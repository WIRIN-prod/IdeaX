import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { EventEmitter } from 'node:events';
import { parseAmount, isISODate } from '../public/shared.js';

const newId = () => crypto.randomBytes(5).toString('hex');
const SIDE_KEYS = ['bride', 'groom', 'both'];
const IMG_URL = /^\/uploads\/[\w-]+\.(jpg|jpeg|png|webp|gif)$/;
const LOOKS = ['card', 'sticky', 'quote', 'task'];
const STAGES = ['discuss', 'parked', 'locked'];
const COLORS = ['#D98E04', '#C2185B', '#00796B', '#3949AB', '#E8590C', '#6B8E23', '#8E2432', '#7B4EA3', '#0B7285', '#B8860B'];

export const DEFAULT_SECTIONS = [
  { id: 'overview', title: 'Idea Board', emoji: '💡', color: '#D98E04', kind: 'dashboard' },
  { id: 'product', title: 'Product & Features', emoji: '🧩', color: '#3949AB' },
  { id: 'design', title: 'Design & Brand', emoji: '🎨', color: '#C2185B' },
  { id: 'marketing', title: 'Marketing & Growth', emoji: '📣', color: '#E8590C' },
  { id: 'research', title: 'Research & Reading', emoji: '🔎', color: '#0B7285' },
  { id: 'todo', title: 'To-do', emoji: '✅', color: '#00796B' },
  { id: 'ideas', title: 'Inbox', emoji: '✨', color: '#D98E04' },
];

function seed() {
  return {
    sections: structuredClone(DEFAULT_SECTIONS),
    cards: [],
    settings: { names: '', weddingDate: null, budgetTotal: null, guestTarget: null },
    chat: [],
    trash: [],
  };
}

// ---------- sanitising ----------
const clip = (v, n) => (typeof v === 'string' ? v.trim().slice(0, n) : undefined);

function cleanImg(v) {
  if (!v || typeof v !== 'object' || !IMG_URL.test(v.url || '')) return undefined;
  const dim = (x, d) => (Number.isFinite(+x) && +x > 0 && +x < 20000 ? Math.round(+x) : d);
  return { url: v.url, w: dim(v.w, 800), h: dim(v.h, 600) };
}

function cleanTags(v) {
  const arr = Array.isArray(v) ? v : typeof v === 'string' ? v.split(',') : [];
  return [...new Set(arr.map((t) => clip(String(t), 30)).filter(Boolean))].slice(0, 8);
}

/** Validate card fields from untrusted input (UI or LLM). In patch mode null/'' clears a field. */
export function cleanCardFields(src = {}, { patch = false } = {}) {
  const out = {};
  const opt = (key, fn) => {
    if (!(key in src)) return;
    const raw = src[key];
    if (raw === null || raw === '') { if (patch) out[key] = null; return; }
    const v = fn(raw);
    if (v !== undefined) out[key] = v;
  };
  const title = clip(src.title, 200);
  if (title) out.title = title;
  opt('body', (v) => clip(String(v), 4000));
  opt('estimate', parseAmount);
  opt('paid', parseAmount);
  opt('count', (v) => { const n = parseAmount(v); return n === undefined ? undefined : Math.min(n, 100000); });
  opt('date', (v) => (isISODate(v) ? v : undefined));
  opt('status', (v) => clip(String(v), 40));
  opt('url', (v) => clip(String(v), 500));
  opt('side', (v) => (SIDE_KEYS.includes(v) ? v : undefined));
  opt('img', cleanImg);
  opt('look', (v) => (LOOKS.includes(v) ? v : undefined));
  opt('stage', (v) => (STAGES.includes(v) ? v : undefined));
  opt('featured', (v) => (v === true ? true : patch ? null : undefined));
  opt('colors', (v) => (Array.isArray(v) ? v.filter((c) => /^#[0-9a-f]{6}$/i.test(c)).slice(0, 6) : undefined));
  if (!patch) opt('source', (v) => clip(String(v), 4000));
  if ('tags' in src) out.tags = cleanTags(src.tags);
  return out;
}

function resolveSection(board, ref) {
  if (!ref) return undefined;
  const r = String(ref).trim().toLowerCase();
  const sec = board.sections.find((s) => s.kind !== 'dashboard' && (s.id === r || s.title.toLowerCase() === r));
  return sec?.id;
}

function ensureInbox(board) {
  if (!board.sections.some((s) => s.id === 'ideas')) {
    board.sections.push({ id: 'ideas', title: 'Inbox', emoji: '✨', color: '#D98E04' });
  }
  return 'ideas';
}

function slug(board, title) {
  const base = title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 24) || 'section';
  let id = base;
  for (let i = 2; board.sections.some((s) => s.id === id); i++) id = `${base}-${i}`;
  return id;
}

function placeCard(board, card, sectionId, index) {
  const cur = board.cards.indexOf(card);
  if (cur >= 0) board.cards.splice(cur, 1);
  card.section = sectionId;
  const inSec = board.cards.filter((c) => c.section === sectionId);
  if (index == null || index >= inSec.length) {
    const last = inSec[inSec.length - 1];
    board.cards.splice(last ? board.cards.indexOf(last) + 1 : board.cards.length, 0, card);
  } else {
    board.cards.splice(board.cards.indexOf(inSec[Math.max(0, index)]), 0, card);
  }
}

/**
 * Apply a list of operations to `board` (mutating). Never throws on bad input:
 * invalid ops are reported in `errors` and skipped.
 * ctx.attachments: [{url,w,h}] that ops may reference through `attachment: <index>`.
 */
export function applyOps(board, ops, ctx = {}) {
  const applied = [];
  const errors = [];
  const attach = ctx.attachments || [];

  for (const [i, op] of (Array.isArray(ops) ? ops : []).entries()) {
    try {
      const kind = op?.op;
      if (kind === 'add_card') {
        const src = op.card || {};
        const f = cleanCardFields(src);
        if (Number.isInteger(src.attachment) && attach[src.attachment]) f.img = cleanImg(attach[src.attachment]);
        if (!f.title && f.img) f.title = 'Photo';
        if (!f.title) throw new Error('card needs a title');
        const section = resolveSection(board, src.section) || ensureInbox(board);
        const card = { id: newId(), tags: [], created: Date.now(), ...f };
        placeCard(board, card, section);
        applied.push({ op: kind, id: card.id });
      } else if (kind === 'update_card') {
        const card = board.cards.find((c) => c.id === op.id);
        if (!card) throw new Error(`no card ${op.id}`);
        const patch = cleanCardFields(op.patch || {}, { patch: true });
        if (Number.isInteger(op.patch?.attachment) && attach[op.patch.attachment]) patch.img = cleanImg(attach[op.patch.attachment]);
        for (const [k, v] of Object.entries(patch)) {
          if (v === null) delete card[k]; else card[k] = v;
        }
        const target = resolveSection(board, op.patch?.section);
        if (target && target !== card.section) placeCard(board, card, target);
        applied.push({ op: kind, id: card.id });
      } else if (kind === 'delete_card') {
        const idx = board.cards.findIndex((c) => c.id === op.id);
        if (idx < 0) throw new Error(`no card ${op.id}`);
        const [gone] = board.cards.splice(idx, 1);
        delete gone.pending;
        (board.trash ||= []).unshift({ ...gone, deleted: Date.now() });
        board.trash.length = Math.min(board.trash.length, 100);
        applied.push({ op: kind, id: op.id });
      } else if (kind === 'restore_card') {
        const idx = (board.trash || []).findIndex((c) => c.id === op.id);
        if (idx < 0) throw new Error(`nothing to restore for ${op.id}`);
        const [card] = board.trash.splice(idx, 1);
        delete card.deleted;
        placeCard(board, card, resolveSection(board, card.section) || ensureInbox(board));
        applied.push({ op: kind, id: card.id });
      } else if (kind === 'empty_trash') {
        board.trash = [];
        applied.push({ op: kind });
      } else if (kind === 'order_section') {
        const section = resolveSection(board, op.section_id ?? op.section);
        if (!section || !Array.isArray(op.ids)) throw new Error('bad order_section');
        const mine = board.cards.filter((c) => c.section === section);
        const rank = new Map(op.ids.map((id, n) => [id, n]));
        const sorted = [...mine].sort((a, z) => (rank.get(a.id) ?? 1e6 + mine.indexOf(a)) - (rank.get(z.id) ?? 1e6 + mine.indexOf(z)));
        let n = 0;
        board.cards = board.cards.map((c) => (c.section === section ? sorted[n++] : c));
        applied.push({ op: kind, id: section });
      } else if (kind === 'move_card') {
        const card = board.cards.find((c) => c.id === op.id);
        const section = resolveSection(board, op.section_id ?? op.section);
        if (!card || !section) throw new Error('bad move');
        placeCard(board, card, section, Number.isInteger(op.index) ? op.index : null);
        applied.push({ op: kind, id: card.id });
      } else if (kind === 'add_section') {
        const title = clip(op.section?.title, 60);
        if (!title) throw new Error('section needs a title');
        const color = /^#[0-9a-f]{6}$/i.test(op.section?.color || '') ? op.section.color : COLORS[board.sections.length % COLORS.length];
        const sec = { id: slug(board, title), title, emoji: clip(op.section?.emoji, 8) || '📌', color };
        const inbox = board.sections.findIndex((s) => s.id === 'ideas');
        board.sections.splice(inbox >= 0 ? inbox : board.sections.length, 0, sec);
        applied.push({ op: kind, id: sec.id });
      } else if (kind === 'update_section') {
        const sec = board.sections.find((s) => s.id === op.id);
        if (!sec) throw new Error(`no section ${op.id}`);
        const p = op.section || {};
        if (clip(p.title, 60)) sec.title = clip(p.title, 60);
        if (clip(p.emoji, 8)) sec.emoji = clip(p.emoji, 8);
        if (/^#[0-9a-f]{6}$/i.test(p.color || '')) sec.color = p.color;
        if (typeof p.collapsed === 'boolean') sec.collapsed = p.collapsed;
        applied.push({ op: kind, id: sec.id });
      } else if (kind === 'move_section') {
        const from = board.sections.findIndex((s) => s.id === op.id);
        if (from < 0 || !Number.isInteger(op.index)) throw new Error('bad move_section');
        const [sec] = board.sections.splice(from, 1);
        board.sections.splice(Math.max(0, Math.min(op.index, board.sections.length)), 0, sec);
        applied.push({ op: kind, id: sec.id });
      } else if (kind === 'delete_section') {
        const sec = board.sections.find((s) => s.id === op.id);
        if (!sec || sec.kind === 'dashboard') throw new Error('cannot delete that section');
        const inbox = sec.id === 'ideas' ? null : ensureInbox(board);
        if (!inbox && board.cards.some((c) => c.section === sec.id)) throw new Error('inbox still has cards');
        for (const c of board.cards) if (c.section === sec.id) c.section = inbox;
        board.sections.splice(board.sections.indexOf(sec), 1);
        applied.push({ op: kind, id: op.id });
      } else if (kind === 'set_settings') {
        const p = op.settings || op.patch || {};
        const s = board.settings;
        if ('names' in p) s.names = clip(String(p.names ?? ''), 80) || '';
        if ('weddingDate' in p) s.weddingDate = isISODate(p.weddingDate) ? p.weddingDate : null;
        if ('budgetTotal' in p) s.budgetTotal = parseAmount(p.budgetTotal) ?? null;
        if ('guestTarget' in p) s.guestTarget = parseAmount(p.guestTarget) ?? null;
        applied.push({ op: kind });
      } else {
        throw new Error(`unknown op ${kind}`);
      }
    } catch (e) {
      errors.push(`op ${i}: ${e.message}`);
    }
  }
  return { applied, errors };
}

// ---------- persistence ----------
export class Store extends EventEmitter {
  constructor(dir) {
    super();
    this.dir = dir;
    this.file = path.join(dir, 'board.json');
    this.history = [];
    this.rev = 1;
    fs.mkdirSync(dir, { recursive: true });
    this.load();
  }

  load() {
    try {
      this.data = JSON.parse(fs.readFileSync(this.file, 'utf8'));
      this.data.chat ||= [];
      this.data.trash ||= [];
      for (const c of this.data.cards) delete c.pending; // a capture that was mid-sort when we stopped
    } catch (e) {
      if (e.code !== 'ENOENT') {
        fs.renameSync(this.file, path.join(this.dir, `board.corrupt-${Date.now()}.json`));
        console.error('board.json was unreadable; moved aside and starting fresh');
      }
      this.data = seed();
      this.save();
    }
  }

  save() {
    const tmp = this.file + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(this.data, null, 1));
    fs.renameSync(tmp, this.file);
    const day = new Date().toISOString().slice(0, 10);
    const backupDir = path.join(this.dir, 'backups');
    const backup = path.join(backupDir, `board-${day}.json`);
    if (!fs.existsSync(backup)) {
      fs.mkdirSync(backupDir, { recursive: true });
      fs.copyFileSync(this.file, backup);
    }
  }

  snapshot() {
    const { sections, cards, settings, trash } = this.data;
    return structuredClone({ sections, cards, settings, trash: trash || [] });
  }

  commit() {
    this.rev++;
    this.save();
    this.emit('change', this.rev);
  }

  apply(ops, ctx) {
    const before = this.snapshot();
    const result = applyOps(this.data, ops, ctx);
    if (result.applied.length) {
      this.history.push(before);
      if (this.history.length > 50) this.history.shift();
      this.commit();
    }
    return result;
  }

  /** Drop raw captures straight onto the board (in the inbox unless a section is given); Claude sorts them afterwards. */
  addRaw(items) {
    this.history.push(this.snapshot());
    if (this.history.length > 50) this.history.shift();
    const ids = [];
    for (const it of items) {
      const text = clip(it.text, 4000) || '';
      const img = cleanImg(it.img);
      if (!text && !img) continue;
      const firstLine = text.split('\n')[0];
      const card = {
        id: newId(), tags: [], created: Date.now(), pending: true,
        title: text ? (firstLine.length > 70 ? firstLine.slice(0, 67) + '…' : firstLine) : 'Photo',
        ...(text && (text.length > 70 || text.includes('\n')) ? { body: text } : {}),
        ...(text ? { source: text } : {}),
        ...(img ? { img } : { look: 'sticky' }),
      };
      placeCard(this.data, card, resolveSection(this.data, it.section) || ensureInbox(this.data));
      ids.push(card.id);
    }
    if (ids.length) this.commit(); else this.history.pop();
    return ids;
  }

  /** Clear the "being sorted" marker. Not an undo step. */
  settle(ids, { silent = false } = {}) {
    let n = 0;
    for (const c of this.data.cards) if (c.pending && (!ids || ids.includes(c.id))) { delete c.pending; n++; }
    if (n && !silent) this.commit();
  }

  undo() {
    const prev = this.history.pop();
    if (!prev) return false;
    Object.assign(this.data, prev);
    this.commit();
    return true;
  }

  addChat(entry) {
    this.data.chat.push({ t: Date.now(), ...entry });
    if (this.data.chat.length > 300) this.data.chat.splice(0, this.data.chat.length - 300);
    this.commit();
  }

  clearChat(section) {
    this.data.chat = section ? this.data.chat.filter((m) => m.section !== section) : this.data.chat.filter((m) => m.section);
    this.commit();
  }

  view() {
    return { rev: this.rev, canUndo: this.history.length > 0, ...this.data };
  }
}
