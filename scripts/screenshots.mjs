// Regenerates docs/screenshots/*. Needs: npm i --no-save playwright && npx playwright install chromium
// Usage: node scripts/screenshots.mjs   (starts its own server on a temp data dir with demo cards)
import { spawn } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { chromium } from 'playwright';

const PORT = 3999, base = `http://localhost:${PORT}`;
const dir = mkdtempSync(path.join(tmpdir(), 'ideax-'));
const srv = spawn('node', ['server.js'], { env: { ...process.env, PORT, WB_DATA_DIR: dir, WB_UPLOADS_DIR: dir, LITELLM_API_KEY: 'demo' }, stdio: 'ignore' });
await new Promise((r) => setTimeout(r, 1500));

const card = (section, title, body, extra = {}) => ({ op: 'add_card', card: { section, title, body, ...extra } });
const ops = [
  card('product', 'Offline-first sync', 'Queue edits locally and merge when the connection returns.', { tags: ['sync', 'v2'], look: 'card' }),
  card('product', 'Shareable board links', 'Read-only link for stakeholders.', { look: 'sticky', tags: ['sharing'] }),
  card('product', 'Voice capture', 'Hold a button, talk, get a note.', { look: 'task', stage: 'discuss' }),
  card('design', 'Warm paper palette', 'Cream background, ink text, one bold accent.', { look: 'sticky', colors: ['#D98E04', '#C2185B', '#3949AB', '#00796B'] }),
  card('design', '“Make it feel like a desk, not a dashboard.”', '', { look: 'quote' }),
  card('marketing', 'Launch thread', 'Short demo video + a 5-tweet story.', { look: 'card', tags: ['launch'], stage: 'locked' }),
  card('marketing', 'Newsletter swaps', 'Trade slots with two indie-maker newsletters.', { look: 'sticky' }),
  card('research', 'Read: Shape Up', 'https://basecamp.com/shapeup', { look: 'card', url: 'https://basecamp.com/shapeup' }),
  card('todo', 'Write README', '', { look: 'task', status: 'done' }),
  card('todo', 'Record demo GIF', '', { look: 'task' }),
  card('ideas', 'What if the board suggested merges for similar notes?', '', { look: 'sticky', stage: 'parked' }),
];
await fetch(`${base}/api/ops`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ ops }) });

const b = await chromium.launch({ executablePath: process.env.CHROME_PATH });
const out = 'docs/screenshots';
const desk = await (await b.newContext({ viewport: { width: 1360, height: 860 } })).newPage();
await desk.goto(base); await desk.waitForTimeout(1200);
await desk.screenshot({ path: `${out}/overview.png` });
await b.close(); srv.kill();
