import express from 'express';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { Store } from './lib/store.js';
import { planWithClaude, fallbackPlan } from './lib/claude.js';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const PORT = +process.env.PORT || 3000;
const HOST = process.env.HOST || '0.0.0.0';
const PIN = process.env.BOARD_PIN || '';
const DATA_DIR = process.env.WB_DATA_DIR || path.join(ROOT, 'data');
const UPLOADS = process.env.WB_UPLOADS_DIR || path.join(ROOT, 'uploads');
fs.mkdirSync(UPLOADS, { recursive: true });

const store = new Store(DATA_DIR);
const app = express();
app.disable('x-powered-by');

// --- guard against DNS-rebinding: only answer for IP literals, localhost, *.local and ALLOWED_HOSTS ---
const extraHosts = (process.env.ALLOWED_HOSTS || '').split(',').map((s) => s.trim().toLowerCase()).filter(Boolean);
app.use((req, res, next) => {
  const host = (req.headers.host || '').toLowerCase().replace(/:\d+$/, '').replace(/^\[|\]$/g, '');
  const ok = host === 'localhost' || host.endsWith('.local') || /^\d{1,3}(\.\d{1,3}){3}$/.test(host) || host.includes(':') || extraHosts.includes(host);
  if (!ok) return res.status(421).send('Unknown host. Set ALLOWED_HOSTS=<name> to allow it.');
  next();
});

// --- optional PIN (set BOARD_PIN) ---
const token = PIN ? crypto.createHash('sha256').update(`wb:${PIN}`).digest('hex') : '';
const cookieOf = (req) => /(?:^|;\s*)wb=([a-f0-9]{64})/.exec(req.headers.cookie || '')?.[1] || '';
const authed = (req) => {
  if (!PIN) return true;
  const c = cookieOf(req);
  return c.length === token.length && crypto.timingSafeEqual(Buffer.from(c), Buffer.from(token));
};
const guard = (req, res, next) => (authed(req) ? next() : res.status(401).json({ error: 'locked' }));

app.get('/api/auth', (req, res) => res.json({ required: !!PIN, ok: authed(req) }));
app.post('/api/login', express.json(), (req, res) => {
  const given = crypto.createHash('sha256').update(`wb:${String(req.body?.pin ?? '')}`).digest('hex');
  if (!PIN || !crypto.timingSafeEqual(Buffer.from(given), Buffer.from(token))) return res.status(403).json({ error: 'Wrong PIN' });
  res.setHeader('Set-Cookie', `wb=${token}; HttpOnly; SameSite=Lax; Path=/; Max-Age=31536000`);
  res.json({ ok: true });
});

app.use(express.static(path.join(ROOT, 'public'), { etag: true, maxAge: 0 }));
app.use('/uploads', guard, express.static(UPLOADS, { maxAge: '30d', immutable: true, setHeaders: (r) => r.setHeader('X-Content-Type-Options', 'nosniff') }));

const jsonOnly = [guard, express.json({ limit: '1mb' })];
const needJson = (req, res, next) => (req.is('application/json') ? next() : res.status(415).json({ error: 'JSON only' }));

app.get('/api/board', guard, (req, res) => res.json(store.view()));

app.post('/api/ops', ...jsonOnly, needJson, (req, res) => {
  const result = store.apply(req.body?.ops);
  res.json({ ...result, board: store.view() });
});

app.post('/api/undo', ...jsonOnly, needJson, (req, res) => {
  res.json({ ok: store.undo(), board: store.view() });
});

app.post('/api/chat/clear', ...jsonOnly, needJson, (req, res) => {
  store.clearChat();
  res.json({ board: store.view() });
});

// --- image upload: raw bytes, type sniffed from magic numbers ---
const MAGIC = [
  ['jpg', (b) => b[0] === 0xff && b[1] === 0xd8],
  ['png', (b) => b.subarray(0, 4).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47]))],
  ['gif', (b) => b.subarray(0, 3).toString() === 'GIF'],
  ['webp', (b) => b.subarray(0, 4).toString() === 'RIFF' && b.subarray(8, 12).toString() === 'WEBP'],
];
app.post('/api/upload', guard, express.raw({ type: () => true, limit: '25mb' }), (req, res) => {
  const buf = req.body;
  const ext = Buffer.isBuffer(buf) && buf.length > 12 ? MAGIC.find(([, test]) => test(buf))?.[0] : undefined;
  if (!ext) return res.status(400).json({ error: 'Not a supported image (jpg, png, webp, gif)' });
  const name = `${Date.now().toString(36)}-${crypto.randomBytes(4).toString('hex')}.${ext}`;
  fs.writeFileSync(path.join(UPLOADS, name), buf);
  res.json({ url: `/uploads/${name}` });
});

// --- chat: one Claude call at a time ---
let queue = Promise.resolve();
app.post('/api/chat', ...jsonOnly, needJson, (req, res) => {
  const message = typeof req.body?.message === 'string' ? req.body.message.trim().slice(0, 4000) : '';
  const attachments = (Array.isArray(req.body?.attachments) ? req.body.attachments : [])
    .filter((a) => /^\/uploads\/[\w-]+\.(jpg|png|webp|gif)$/.test(a?.url || '') && fs.existsSync(path.join(UPLOADS, path.basename(a.url))))
    .slice(0, 6)
    .map((a) => ({ url: a.url, w: a.w, h: a.h }));
  if (!message && !attachments.length) return res.status(400).json({ error: 'Say something or attach a photo' });

  const job = queue.then(async () => {
    store.addChat({ role: 'user', text: message, images: attachments.map((a) => a.url) });
    let plan;
    let note = '';
    try {
      plan = await planWithClaude({ data: store.view(), message, attachments, uploadsDir: UPLOADS, scratchDir: path.join(DATA_DIR, 'claude-cwd') });
    } catch (e) {
      console.error('[claude]', e.message);
      plan = fallbackPlan(message, attachments);
      note = ` (${e.message})`;
    }
    const { applied, errors } = store.apply(plan.ops, { attachments });
    if (errors.length) console.warn('[ops]', errors.join('; '));
    const added = applied.filter((a) => a.op === 'add_card').map((a) => a.id);
    store.addChat({ role: 'assistant', text: plan.reply + note, added });
    return { reply: plan.reply + note, added, board: store.view() };
  });
  queue = job.catch(() => {});
  job.then((r) => res.json(r)).catch((e) => res.status(500).json({ error: e.message }));
});

// --- live sync to every open device ---
const clients = new Set();
app.get('/api/events', guard, (req, res) => {
  res.set({ 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive' });
  res.write(`retry: 2000\ndata: ${JSON.stringify({ rev: store.rev })}\n\n`);
  clients.add(res);
  req.on('close', () => clients.delete(res));
});
store.on('change', (rev) => { for (const c of clients) c.write(`data: ${JSON.stringify({ rev })}\n\n`); });
setInterval(() => { for (const c of clients) c.write(': ping\n\n'); }, 25000).unref();

app.use((err, req, res, next) => {
  if (res.headersSent) return next(err);
  res.status(err.status || 500).json({ error: err.type === 'entity.too.large' ? 'Too large' : err.message });
});

app.listen(PORT, HOST, () => {
  const all = Object.values(os.networkInterfaces()).flat().filter((i) => i && i.family === 'IPv4' && !i.internal).map((i) => i.address);
  const docker = (ip) => /^172\.(1[6-9]|2\d|3[01])\./.test(ip); // container bridges: not reachable from a phone
  const lan = all.filter((ip) => !docker(ip)).length ? all.filter((ip) => !docker(ip)) : all;
  console.log(`\n  Wedding board is running${PIN ? ' (PIN protected)' : ''}\n`);
  console.log(`  This computer : http://localhost:${PORT}`);
  for (const ip of lan) console.log(`  Phone / tablet: http://${ip}:${PORT}   (same Wi-Fi)`);
  if (!PIN) console.log('\n  Anyone on your Wi-Fi can open this. Set BOARD_PIN=1234 to require a PIN.');
  console.log('');
});
