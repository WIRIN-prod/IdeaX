import { h, $, toast, clamp } from './ui.js';
import { parseAmount, formatINR, daysUntil, countsTowardBudget, SIDES, STATUS_HINTS, statusTone } from './shared.js';
import { CARD_W, layout, pickProfile, insertionIndex, boardWidth } from './layout.js';

const vp = $('#vp');
const world = $('#world');
const SWATCHES = ['#D98E04', '#C2185B', '#00796B', '#3949AB', '#E8590C', '#6B8E23', '#8E2432', '#7B4EA3', '#0B7285', '#B8860B'];
const LOOKS = { card: 'Card', sticky: 'Sticky note', quote: 'Quote', task: 'To-do' };
const GLYPH = { card: '▤', sticky: '✎', quote: '❝', task: '☑', photo: '▣' };
const EXAMPLES = [
  'mom wants marigolds everywhere, I want pastel. need to find a middle',
  'Booked Taj Falaknuma for the Sangeet, ₹12 lakh, 2 lakh advance paid',
  "Sharma family from Delhi, 18 people, bride's side, all functions",
  'Ideas for a mandap in marigold and pink?',
  'How much have we planned vs paid so far?',
];
// typed text that is a question or an instruction goes to Claude as chat; everything else is dropped on the board first
const ASKING = /\?\s*$|^(how|what|which|when|where|who|why|is|are|do|does|did|can|could|should|show|list|move|delete|remove|rename|set|change|update|undo|suggest|give|tell|find|compare|ideas?)\b/i;

const S = {
  board: null, rev: 0, view: { x: 0, y: 0, k: 1 }, profile: null, lay: null, heights: {}, tilt: {},
  cardNodes: new Map(), frameNodes: new Map(), sigs: new Map(), hero: null, slot: null,
  ptrs: new Map(), mode: null, pending: null, drag: null, last: null, pinch: null,
  q: '', attachments: [], busy: false, fresh: new Set(), dirty: false, pasteHook: null, animOn: false,
  tab: 'journal', lastChat: 0,
};

// ---------------------------------------------------------------- API
async function api(url, body) {
  const res = await fetch(url, body === undefined ? {} : { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  if (res.status === 401) { showLock(); throw new Error('Locked'); }
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json.error || res.statusText);
  return json;
}
const sendOps = async (ops) => { const r = await api('/api/ops', { ops }); setBoard(r.board); if (r.errors?.length) toast(r.errors[0], 'err'); return r; };

// ---------------------------------------------------------------- boot / sync
async function boot() {
  const auth = await fetch('/api/auth').then((r) => r.json());
  if (auth.required && !auth.ok) return showLock();
  $('#lock').hidden = true;
  $('#app').hidden = false;
  setBoard(await api('/api/board'));
  await document.fonts?.ready;
  render();
  fit();
  requestAnimationFrame(() => requestAnimationFrame(() => { S.animOn = true; world.classList.add('anim'); }));
  connectEvents();
}

function showLock() { $('#app').hidden = true; $('#lock').hidden = false; }
$('#lockForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const r = await fetch('/api/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ pin: $('#pin').value }) });
  if (r.ok) { $('#lockErr').textContent = ''; boot(); } else $('#lockErr').textContent = 'Wrong PIN';
});

function connectEvents() {
  const es = new EventSource('/api/events');
  es.onmessage = (e) => {
    if (JSON.parse(e.data).rev === S.rev) return;
    if (S.drag) { S.dirty = true; return; }
    api('/api/board').then(setBoard).catch(() => {});
  };
}

function setBoard(b) {
  if (S.board && b.rev < S.rev) return;
  const first = !S.board;
  if (!first) {
    const known = new Set(S.board.cards.map((c) => c.id));
    for (const c of b.cards) if (!known.has(c.id)) S.fresh.add(c.id);
  }
  S.board = b;
  S.rev = b.rev;
  render();
  renderPanel();
  $('#undo').disabled = !b.canUndo;
  const names = b.settings.names;
  $('#title').textContent = names || 'Wedding Board';
  document.title = names ? `${names} · Wedding Board` : 'Wedding Board';
  // surface what Claude says after sorting things in the background
  const lastA = [...(b.chat || [])].reverse().find((m) => m.role === 'assistant');
  if (lastA && lastA.t > S.lastChat) { if (!first && !S.busy) say(lastA.text); S.lastChat = lastA.t; }
}

// ---------------------------------------------------------------- rendering
const sectionOf = (id) => S.board.sections.find((s) => s.id === id);
const sum = (cards, key) => cards.reduce((t, c) => t + (c[key] || 0), 0);
const hash = (id) => { let x = 7; for (const ch of id) x = (x * 31 + ch.charCodeAt(0)) >>> 0; return x; };
const lookOf = (card) => (card.img ? 'photo' : LOOKS[card.look] ? card.look : 'card');
const isDone = (card) => /^(done|complete|finished)/i.test(card.status || '');

function fmtDate(iso) {
  const d = new Date(iso + 'T00:00:00');
  const sameYear = d.getFullYear() === new Date().getFullYear();
  return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', ...(sameYear ? {} : { year: 'numeric' }) });
}

function render() {
  const { sections, cards } = S.board;
  S.profile = pickProfile(vp.clientWidth);
  world.classList.toggle('cols1', S.profile.cols === 1);

  // sections
  const real = sections.filter((s) => s.kind !== 'dashboard');
  const secIds = new Set(real.map((s) => s.id));
  for (const [id, node] of S.frameNodes) if (!secIds.has(id)) { node.remove(); S.frameNodes.delete(id); S.sigs.delete('f' + id); }
  for (const sec of real) {
    let node = S.frameNodes.get(sec.id);
    if (!node) { node = h('div', { class: 'frame', 'data-id': sec.id }); world.append(node); S.frameNodes.set(sec.id, node); }
    const mine = cards.filter((c) => c.section === sec.id);
    const sig = JSON.stringify([sec, mine.length, sum(mine.filter(countsTowardBudget), 'estimate')]);
    node.style.setProperty('--c', sec.color);
    if (S.sigs.get('f' + sec.id) !== sig) { S.sigs.set('f' + sec.id, sig); node.replaceChildren(frameHead(sec, mine)); }
  }

  // cards
  const live = new Set(cards.filter((c) => secIds.has(c.section)).map((c) => c.id));
  for (const [id, node] of S.cardNodes) if (!live.has(id)) { node.remove(); S.cardNodes.delete(id); S.sigs.delete(id); }
  for (const card of cards) {
    if (!live.has(card.id)) continue;
    let node = S.cardNodes.get(card.id);
    if (!node) { node = h('div', { 'data-id': card.id }); world.append(node); S.cardNodes.set(card.id, node); }
    const sec = sectionOf(card.section);
    const look = lookOf(card);
    const hsh = hash(card.id);
    node.style.setProperty('--c', sec.color);
    node.className = ['card', `look-${look}`, `t${hsh % 5}`, card.featured && 'wide', card.pending && 'pending', sec.collapsed && 'folded', isDone(card) && 'done',
      S.drag?.id === card.id && 'dragging'].filter(Boolean).join(' ');
    S.tilt[card.id] = look === 'photo' || look === 'sticky' ? (((hsh >> 3) % 27) / 26 - 0.5) * 2.8 : 0;
    const sig = JSON.stringify(card);
    if (S.sigs.get(card.id) !== sig) { S.sigs.set(card.id, sig); node.replaceChildren(...cardContent(card, look)); }
    if (S.fresh.has(card.id)) { node.classList.add('fresh'); setTimeout(() => node.classList.remove('fresh'), 1700); }
  }
  S.fresh.clear();

  // hero banner
  const dashSec = sections.find((s) => s.kind === 'dashboard');
  S.hero?.remove();
  S.hero = null;
  if (dashSec) {
    const w = boardWidth(S.profile);
    S.hero = buildHero(S.board, w < 620);
    S.hero.style.width = w + 'px';
    world.append(S.hero);
  }

  measure();
  relayout();
  applySearch();
}

function measure() {
  for (const [id, node] of S.cardNodes) S.heights[id] = node.offsetHeight;
  const dashSec = S.board.sections.find((s) => s.kind === 'dashboard');
  if (dashSec && S.hero) S.heights[dashSec.id] = S.hero.offsetHeight;
}

function cardIdsBySection(override) {
  const ids = {};
  for (const s of S.board.sections) ids[s.id] = [];
  for (const c of S.board.cards) if (ids[c.section]) ids[c.section].push(c.id);
  if (override) {
    for (const list of Object.values(ids)) { const i = list.indexOf(override.id); if (i >= 0) list.splice(i, 1); }
    if (override.section) ids[override.section].splice(override.index ?? ids[override.section].length, 0, override.id);
  }
  return ids;
}

function computeLayout(override) {
  const wide = {};
  for (const c of S.board.cards) if (c.featured) wide[c.id] = true;
  return layout({ sections: S.board.sections, cardIds: cardIdsBySection(override), heights: S.heights, wide, cols: S.profile.cols, lanes: S.profile.lanes });
}

function relayout(override) {
  S.lay = computeLayout(override);
  applyLayout();
}

function applyLayout() {
  const L = S.lay;
  for (const [id, node] of S.frameNodes) {
    const f = L.frames[id];
    node.style.transform = `translate(${f.x}px, ${f.y}px)`;
    node.style.width = f.w + 'px';
    node.style.height = f.h + 'px';
    node.classList.toggle('slim', !!f.slim);
    node.classList.toggle('target', !!S.drag && S.drag.section === id);
  }
  for (const [id, node] of S.cardNodes) {
    if (S.drag?.id === id) continue;
    const p = L.cards[id];
    if (p) node.style.transform = `translate(${p.x}px, ${p.y}px) rotate(${S.tilt[id] || 0}deg)`;
  }
  if (S.drag && S.slot) {
    const p = L.cards[S.drag.id];
    if (p) { S.slot.style.transform = `translate(${p.x}px, ${p.y}px)`; S.slot.style.height = (S.heights[S.drag.id] || 100) + 'px'; S.slot.style.width = S.cardNodes.get(S.drag.id).offsetWidth + 'px'; }
  }
  world.style.width = L.width + 'px';
  world.style.height = L.height + 'px';
}

function frameHead(sec, mine) {
  const est = sum(mine.filter(countsTowardBudget), 'estimate');
  return h('div', { class: 'fhead' },
    h('span', { class: 'fico' }, sec.emoji),
    h('button', { class: 'ftitle', title: mine.length ? (sec.collapsed ? 'Expand' : 'Collapse') : sec.title,
      onclick: () => (mine.length ? sendOps([{ op: 'update_section', id: sec.id, section: { collapsed: !sec.collapsed } }]) : openEditor(null, sec.id)) },
    sec.title, mine.length ? h('span', { class: 'fcount' }, mine.length) : null),
    est ? h('span', { class: 'fsum' }, formatINR(est)) : null,
    h('button', { class: 'ficon', title: 'Add something here', onclick: () => openEditor(null, sec.id) }, '+'),
    h('button', { class: 'ficon', title: 'Section settings', onclick: () => openSection(sec.id) }, '⋯'));
}

function safeUrl(u) {
  if (!u) return null;
  try { const x = new URL(/^[a-z]+:/i.test(u) ? u : `https://${u}`); return /^https?:$/.test(x.protocol) ? x : null; } catch { return null; }
}

/** Facts shown under any kind of card: palette, money, date/guests/side, tags, link. */
function facts(card, { status = true } = {}) {
  const out = [];
  if (card.colors?.length) out.push(h('div', { class: 'pal' }, card.colors.map((c) => h('i', { style: { background: c } }))));
  if (card.estimate != null || card.paid != null) {
    const both = card.estimate && card.paid != null;
    out.push(h('div', { class: 'money' },
      h('div', { class: 'amt' }, card.estimate != null ? h('b', {}, formatINR(card.estimate)) : null, card.paid != null ? h('span', {}, `paid ${formatINR(card.paid)}`) : null),
      both ? h('div', { class: 'mbar' }, h('i', { style: { width: `${Math.min(100, (card.paid / card.estimate) * 100)}%` } })) : null));
  }
  const bits = [];
  if (card.date) bits.push(`📅 ${fmtDate(card.date)}`);
  if (card.count != null) bits.push(`👥 ${card.count}`);
  if (card.side) bits.push(SIDES[card.side]);
  if (bits.length) out.push(h('div', { class: 'mline' }, bits.map((b) => h('span', {}, b))));
  if (status && card.status) out.push(h('span', { class: `status ${statusTone(card.status)}` }, card.status));
  if (card.tags?.length) out.push(h('div', { class: 'tags' }, card.tags.map((t) => h('span', {}, `#${t.replace(/\s+/g, '')}`))));
  const link = safeUrl(card.url);
  if (link) out.push(h('a', { class: 'clink', href: link.href, target: '_blank', rel: 'noopener noreferrer' }, `↗ ${link.hostname.replace(/^www\./, '')}`));
  return out;
}

function cardContent(card, look) {
  // a raw capture has the same words in title and body; show them once
  const body = card.body && card.body.trim() !== card.title.trim() ? card.body : null;
  const rawTitle = card.body && card.title.replace(/…$/, '') === card.body.slice(0, card.title.replace(/…$/, '').length);
  if (look === 'photo') {
    const ratio = clamp(card.img.w / card.img.h, card.featured ? 1.3 : 0.72, 2.4); // featured photos are cropped to landscape so they don't tower
    return [h('img', { class: 'cimg', src: card.img.url, alt: '', loading: 'lazy', style: { aspectRatio: String(ratio) } }),
      h('div', { class: 'cbody' }, h('div', { class: 'ctitle' }, card.title), body ? h('div', { class: 'cnote' }, body) : null, facts(card))];
  }
  if (look === 'sticky') {
    return [h('div', { class: 'cbody' }, rawTitle ? null : h('div', { class: 'ctitle' }, card.title), body ? h('div', { class: 'cnote' }, body) : null, facts(card))];
  }
  if (look === 'quote') {
    return [h('div', { class: 'cbody' }, h('div', { class: 'qtext' }, body || card.title), body && !rawTitle ? h('div', { class: 'qby' }, card.title) : null, facts(card))];
  }
  if (look === 'task') {
    return [h('div', { class: 'cbody' },
      h('button', { class: 'check', title: isDone(card) ? 'Mark as not done' : 'Mark as done', onclick: () => sendOps([{ op: 'update_card', id: card.id, patch: { status: isDone(card) ? null : 'done' } }]) }, '✓'),
      h('div', { class: 'ctitle' }, card.title), body ? h('div', { class: 'cnote' }, body) : null, facts(card, { status: false }))];
  }
  return [h('div', { class: 'cbody' },
    card.status ? h('div', { class: 'ctop' }, h('span', { class: `status ${statusTone(card.status)}` }, card.status)) : null,
    h('div', { class: 'ctitle' }, card.title), body ? h('div', { class: 'cnote' }, body) : null, facts(card, { status: false }))];
}

function buildHero(b, narrow) {
  const { settings: st, cards, sections } = b;
  const real = sections.filter((s) => s.kind !== 'dashboard');
  const committed = cards.filter(countsTowardBudget);
  const plan = sum(committed, 'estimate');
  const paid = sum(cards, 'paid');
  const options = sum(cards.filter((c) => !countsTowardBudget(c)), 'estimate');
  const base = st.budgetTotal || plan || 1;
  const tile = (label, val, ...rest) => h('div', { class: 'tile' }, h('div', { class: 'tlabel' }, label), h('div', { class: 'tval' }, val), rest);

  const lead = h('div', { class: 'hlead' }, h('div', { class: 'hkicker' }, 'The wedding of'), h('div', { class: 'hnames' }, st.names || 'Our Wedding'));
  if (st.weddingDate) {
    const d = daysUntil(st.weddingDate);
    lead.append(h('div', { class: 'hdate' }, new Date(st.weddingDate + 'T00:00:00').toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })),
      h('div', { class: 'hcount' }, d > 0 ? [h('b', {}, d), h('span', {}, d === 1 ? 'day to go' : 'days to go')] : d === 0 ? h('b', {}, 'Today 🎉') : [h('b', {}, -d), h('span', {}, 'days married ❤️')]));
  } else lead.append(h('button', { class: 'hbtn', onclick: openSettings }, 'Set your names, date & budget'));

  const tiles = [];
  // budget
  const over = st.budgetTotal && plan > st.budgetTotal;
  tiles.push(tile('Budget', st.budgetTotal ? formatINR(st.budgetTotal) : formatINR(plan),
    h('div', { class: 'tbar' }, h('i', { class: 'soft', style: { width: `${Math.min(100, (plan / base) * 100)}%` } }), h('i', { class: 'hard', style: { width: `${Math.min(100, (paid / base) * 100)}%` } })),
    h('div', { class: 'tsub' }, `${formatINR(plan)} planned · ${formatINR(paid)} paid`),
    over ? h('div', { class: 'tsub alert' }, `Over by ${formatINR(plan - st.budgetTotal)}`) : options ? h('div', { class: 'tsub' }, `+ ${formatINR(options)} in ideas`) : null));

  // where the money goes: one stacked bar in section colours
  const rows = real.map((s) => ({ s, v: sum(committed.filter((c) => c.section === s.id), 'estimate') })).filter((r) => r.v > 0).sort((a, z) => z.v - a.v);
  if (rows.length > 1) {
    tiles.push(tile('Biggest spend', `${rows[0].s.emoji} ${formatINR(rows[0].v)}`,
      h('div', { class: 'tbar' }, rows.map((r) => h('i', { title: `${r.s.title} ${formatINR(r.v)}`, style: { width: `${(r.v / plan) * 100}%`, background: r.s.color, filter: 'brightness(1.5) saturate(1.2)' } }))),
      h('div', { class: 'tsub' }, rows.slice(0, 3).map((r) => r.s.title.split(/[ ,&]/)[0]).join(' · '))));
  }

  // guests
  const guestCards = cards.filter((c) => c.section === 'guests');
  const heads = sum(guestCards, 'count');
  const by = (side) => sum(guestCards.filter((c) => c.side === side), 'count');
  tiles.push(tile('Guests', st.guestTarget ? `${heads} / ${st.guestTarget}` : String(heads),
    st.guestTarget ? h('div', { class: 'tbar' }, h('i', { class: 'hard', style: { width: `${Math.min(100, (heads / st.guestTarget) * 100)}%` } })) : null,
    h('div', { class: 'tsub' }, heads ? `Bride ${by('bride')} · Groom ${by('groom')}${by('both') ? ` · Both ${by('both')}` : ''}` : 'No one on the list yet')));

  // next function
  const events = cards.filter((c) => c.section === 'events');
  const next = events.filter((c) => c.date && daysUntil(c.date) >= 0).sort((a, z) => a.date.localeCompare(z.date))[0];
  const undated = events.filter((c) => !c.date).length;
  tiles.push(tile('Next up', next ? next.title : '—', h('div', { class: 'tsub' }, next ? `${fmtDate(next.date)} · in ${daysUntil(next.date)} days` : 'No dates set yet'),
    undated ? h('div', { class: 'tsub' }, `${undated} function${undated > 1 ? 's' : ''} without a date`) : null));

  // to-dos
  const todos = cards.filter((c) => c.section === 'todo' || c.look === 'task');
  if (todos.length) {
    const done = todos.filter(isDone).length;
    tiles.push(tile('To-dos', `${done} / ${todos.length}`, h('div', { class: 'tbar' }, h('i', { class: 'hard', style: { width: `${(done / todos.length) * 100}%` } })), h('div', { class: 'tsub' }, done === todos.length ? 'All done' : `${todos.length - done} still open`)));
  }

  return h('div', { class: `hero${narrow ? ' narrow' : ''}` }, lead, h('div', { class: 'htiles' }, tiles),
    h('button', { class: 'hedit', title: 'Edit names, date and budget', onclick: openSettings }, '✎'));
}

function applySearch() {
  const q = S.q.trim().toLowerCase();
  for (const card of S.board.cards) {
    const node = S.cardNodes.get(card.id);
    if (!node) continue;
    const hay = [card.title, card.body, card.source, card.status, card.url, ...(card.tags || [])].join(' ').toLowerCase();
    node.classList.toggle('dim', !!q && !hay.includes(q));
  }
}
$('#search').addEventListener('input', (e) => { S.q = e.target.value; applySearch(); });
$('#searchBtn').addEventListener('click', () => { document.body.classList.toggle('searching'); if (document.body.classList.contains('searching')) $('#search').focus(); });
$('#theme').addEventListener('click', () => {
  const next = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
  document.documentElement.dataset.theme = next;
  localStorage.setItem('wb-theme', next);
});

// ---------------------------------------------------------------- viewport: pan / zoom / pinch
function applyView() {
  const { k } = S.view;
  const W = (S.lay?.width || 0) * k;
  const H = (S.lay?.height || 0) * k;
  S.view.x = clamp(S.view.x, 80 - W, vp.clientWidth - 80);
  S.view.y = clamp(S.view.y, 80 - H - 100, vp.clientHeight - 80);
  world.style.transform = `translate(${S.view.x}px, ${S.view.y}px) scale(${k})`;
  vp.style.setProperty('--gs', `${56 * k}px`);
  vp.style.setProperty('--gx', `${S.view.x}px`);
  vp.style.setProperty('--gy', `${S.view.y}px`);
  $('#zoomLbl').textContent = `${Math.round(k * 100)}%`;
}

function zoomAt(cx, cy, factor) {
  const r = vp.getBoundingClientRect();
  const px = cx - r.left;
  const py = cy - r.top;
  const k = clamp(S.view.k * factor, 0.15, 2.5);
  const f = k / S.view.k;
  S.view.x = px - (px - S.view.x) * f;
  S.view.y = py - (py - S.view.y) * f;
  S.view.k = k;
  applyView();
}

function fit() {
  const prof = pickProfile(vp.clientWidth);
  if (!S.profile || prof.cols !== S.profile.cols || prof.lanes !== S.profile.lanes) render();
  const W = S.lay.width;
  S.view.k = clamp((vp.clientWidth - 28) / W, 0.2, 1.15);
  S.view.x = (vp.clientWidth - W * S.view.k) / 2;
  S.view.y = 16;
  smooth();
  applyView();
}

function smooth() {
  if (!S.animOn) return;
  world.classList.add('smooth');
  clearTimeout(smooth.t);
  smooth.t = setTimeout(() => world.classList.remove('smooth'), 500);
}

/** Bring a card into view. force: always centre it (and zoom in if we are too far out to read it). */
function reveal(id, { force = false } = {}) {
  const p = S.lay.cards[id];
  if (!p) return false;
  const h2 = S.heights[id] || 100;
  const w2 = S.cardNodes.get(id)?.offsetWidth || CARD_W;
  if (force && S.view.k < 0.7) S.view.k = 1;
  const { x, y, k } = S.view;
  const sx = p.x * k + x, sy = p.y * k + y;
  const visible = sx > 0 && sy > 0 && sx + w2 * k < vp.clientWidth && sy + h2 * k < vp.clientHeight - 90;
  if (!visible || force) {
    S.view.x = vp.clientWidth / 2 - (p.x + w2 / 2) * k;
    S.view.y = (vp.clientHeight - 90) / 2 - (p.y + h2 / 2) * k;
    smooth();
    applyView();
  }
  if (force) { const n = S.cardNodes.get(id); n.classList.remove('fresh'); void n.offsetWidth; n.classList.add('fresh'); setTimeout(() => n.classList.remove('fresh'), 1700); }
  return true;
}

vp.addEventListener('wheel', (e) => {
  e.preventDefault();
  if (e.ctrlKey || e.metaKey) zoomAt(e.clientX, e.clientY, Math.exp(-e.deltaY * 0.01));
  else { S.view.x -= e.deltaX; S.view.y -= e.deltaY; applyView(); }
}, { passive: false });
vp.addEventListener('contextmenu', (e) => e.preventDefault());

$('#fit').addEventListener('click', fit);
$('#zoomIn').addEventListener('click', () => { const r = vp.getBoundingClientRect(); zoomAt(r.left + r.width / 2, r.top + r.height / 2, 1.2); });
$('#zoomOut').addEventListener('click', () => { const r = vp.getBoundingClientRect(); zoomAt(r.left + r.width / 2, r.top + r.height / 2, 1 / 1.2); });
let resizeT;
window.addEventListener('resize', () => {
  clearTimeout(resizeT);
  resizeT = setTimeout(() => {
    const p = pickProfile(vp.clientWidth);
    if (S.board && (p.cols !== S.profile.cols || p.lanes !== S.profile.lanes)) fit(); else applyView();
  }, 150);
});

// ---------------------------------------------------------------- pointer: pan, pinch, card drag
const IGNORE = 'button, a, input, select, textarea, label, dialog';
vp.addEventListener('pointerdown', (e) => {
  if (e.button > 0 || e.target.closest(IGNORE)) return;
  S.ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY });
  if (S.ptrs.size === 2) { cancelPending(); if (S.drag) endDrag(true); S.mode = 'pinch'; S.pinch = pinchState(); return; }
  if (S.ptrs.size > 2) return;
  S.last = { x: e.clientX, y: e.clientY };
  const cardEl = e.target.closest('.card');
  if (cardEl) {
    S.mode = 'card';
    S.pending = { id: cardEl.dataset.id, sx: e.clientX, sy: e.clientY, pointerId: e.pointerId, touch: e.pointerType !== 'mouse', timer: null };
    if (S.pending.touch) S.pending.timer = setTimeout(() => { if (S.mode === 'card') { navigator.vibrate?.(12); startDrag(S.ptrs.get(S.pending.pointerId)); } }, 330);
  } else S.mode = 'pan';
});

window.addEventListener('pointermove', (e) => {
  if (!S.ptrs.has(e.pointerId)) return;
  S.ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY });
  if (S.mode === 'pan') {
    S.view.x += e.clientX - S.last.x; S.view.y += e.clientY - S.last.y;
    S.last = { x: e.clientX, y: e.clientY };
    applyView();
  } else if (S.mode === 'pinch' && S.ptrs.size >= 2) {
    const now = pinchState();
    zoomAt(now.cx, now.cy, now.d / S.pinch.d);
    S.view.x += now.cx - S.pinch.cx; S.view.y += now.cy - S.pinch.cy;
    S.pinch = now;
    applyView();
  } else if (S.mode === 'card' && S.pending) {
    const dist = Math.hypot(e.clientX - S.pending.sx, e.clientY - S.pending.sy);
    if (!S.pending.touch && dist > 5) startDrag({ x: e.clientX, y: e.clientY });
    else if (S.pending.touch && dist > 10) { cancelPending(); S.mode = 'pan'; S.last = { x: e.clientX, y: e.clientY }; }
  } else if (S.mode === 'drag') dragMove(e.clientX, e.clientY);
});

function pointerUp(e, cancelled) {
  if (!S.ptrs.has(e.pointerId)) return;
  S.ptrs.delete(e.pointerId);
  if (S.mode === 'card' && S.pending && !cancelled) { const id = S.pending.id; cancelPending(); S.mode = null; openEditor(id); return; }
  if (S.mode === 'drag') { endDrag(cancelled); S.mode = null; return; }
  if (S.mode === 'pinch' && S.ptrs.size === 1) { const [p] = S.ptrs.values(); S.last = { ...p }; S.mode = 'pan'; return; }
  if (!S.ptrs.size) { cancelPending(); S.mode = null; }
}
window.addEventListener('pointerup', (e) => pointerUp(e, false));
window.addEventListener('pointercancel', (e) => pointerUp(e, true));

function pinchState() {
  const [a, b] = [...S.ptrs.values()];
  return { cx: (a.x + b.x) / 2, cy: (a.y + b.y) / 2, d: Math.max(10, Math.hypot(a.x - b.x, a.y - b.y)) };
}
function cancelPending() { if (S.pending) clearTimeout(S.pending.timer); S.pending = null; }

const toWorld = (cx, cy) => { const r = vp.getBoundingClientRect(); return { x: (cx - r.left - S.view.x) / S.view.k, y: (cy - r.top - S.view.y) / S.view.k }; };
const sectionAt = (w, lay) => S.board.sections.find((s) => { const f = lay.frames[s.id]; return s.kind !== 'dashboard' && f && w.x >= f.x && w.x <= f.x + f.w && w.y >= f.y && w.y <= f.y + f.h; });

function startDrag(pt) {
  if (!pt || !S.pending) return;
  const id = S.pending.id;
  cancelPending();
  const card = S.board.cards.find((c) => c.id === id);
  const node = S.cardNodes.get(id);
  const here = S.lay.cards[id];
  if (!card || !node || !here) { S.mode = null; return; }
  const w = toWorld(pt.x, pt.y);
  const origIds = cardIdsBySection()[card.section];
  S.mode = 'drag';
  S.drag = { id, gx: w.x - here.x, gy: w.y - here.y, origSection: card.section, origIndex: origIds.indexOf(id), section: card.section, index: origIds.indexOf(id), px: pt.x, py: pt.y };
  // stable hit-testing layout: the board as if the dragged card had been lifted out
  S.drag.base = computeLayout({ id, section: null });
  node.classList.add('dragging');
  S.slot = h('div', { class: 'slot' });
  S.slot.style.setProperty('--c', sectionOf(card.section).color);
  world.append(S.slot);
  dragMove(pt.x, pt.y);
  edgeScroll();
}

function dragMove(cx, cy) {
  const d = S.drag;
  if (!d) return;
  d.px = cx; d.py = cy;
  const w = toWorld(cx, cy);
  S.cardNodes.get(d.id).style.transform = `translate(${w.x - d.gx}px, ${w.y - d.gy}px) rotate(2deg)`;
  const sec = sectionAt(w, d.base);
  if (sec) {
    const ids = cardIdsBySection({ id: d.id, section: null })[sec.id];
    d.section = sec.id;
    d.index = sec.collapsed ? ids.length : insertionIndex(ids, d.base.cards, S.heights, w.x, w.y);
    S.slot.style.setProperty('--c', sec.color);
  }
  relayout({ id: d.id, section: d.section, index: d.index });
}

function edgeScroll() {
  if (!S.drag) return;
  const r = vp.getBoundingClientRect();
  const { px, py } = S.drag;
  let dx = 0, dy = 0;
  if (py < r.top + 50) dy = 10; else if (py > r.bottom - 120) dy = -10;
  if (px < r.left + 40) dx = 10; else if (px > r.right - 40) dx = -10;
  if (dx || dy) { S.view.x += dx; S.view.y += dy; applyView(); dragMove(px, py); }
  requestAnimationFrame(edgeScroll);
}

async function endDrag(cancelled) {
  const d = S.drag;
  if (!d) return;
  S.drag = null;
  S.slot?.remove(); S.slot = null;
  S.cardNodes.get(d.id)?.classList.remove('dragging');
  const moved = !cancelled && (d.section !== d.origSection || d.index !== d.origIndex);
  if (moved) {
    // optimistic local move, then confirm with the server
    const cards = S.board.cards;
    const card = cards.splice(cards.findIndex((c) => c.id === d.id), 1)[0];
    card.section = d.section;
    const inSec = cards.filter((c) => c.section === d.section);
    const at = d.index >= inSec.length ? (inSec.length ? cards.indexOf(inSec[inSec.length - 1]) + 1 : cards.length) : cards.indexOf(inSec[d.index]);
    cards.splice(at, 0, card);
    render();
    try { await sendOps([{ op: 'move_card', id: d.id, section_id: d.section, index: d.index }]); } catch (e) { toast(e.message, 'err'); api('/api/board').then(setBoard); }
  } else relayout();
  if (S.dirty) { S.dirty = false; api('/api/board').then(setBoard); }
}

// ---------------------------------------------------------------- images + capture
async function loadBitmap(file) {
  try { return await createImageBitmap(file, { imageOrientation: 'from-image' }); } catch { /* try next */ }
  try { return await createImageBitmap(file); } catch { /* try next */ }
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    return img;
  } finally { setTimeout(() => URL.revokeObjectURL(url), 5000); }
}

async function uploadImage(file) {
  const bmp = await loadBitmap(file);
  const w0 = bmp.width || bmp.naturalWidth, h0 = bmp.height || bmp.naturalHeight;
  const s = Math.min(1, 1600 / Math.max(w0, h0));
  const w = Math.round(w0 * s), hh = Math.round(h0 * s);
  const canvas = Object.assign(document.createElement('canvas'), { width: w, height: hh });
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, w, hh);
  ctx.drawImage(bmp, 0, 0, w, hh);
  const blob = await new Promise((res) => canvas.toBlob(res, 'image/jpeg', 0.86));
  const r = await fetch('/api/upload', { method: 'POST', headers: { 'Content-Type': 'application/octet-stream' }, body: blob });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error || 'Upload failed');
  return { url: j.url, w, h: hh };
}

/** Put something on the board right now; Claude tidies and files it in the background. */
async function capture(payload) {
  try {
    const r = await api('/api/capture', payload);
    setBoard(r.board);
    setTimeout(() => reveal(r.ids[0]), 90);
    return r;
  } catch (e) { toast(e.message, 'err'); return null; }
}

async function captureImages(files, section) {
  const pics = [...files].filter((f) => f.type.startsWith('image/'));
  if (!pics.length) return;
  toast(pics.length > 1 ? `Adding ${pics.length} photos…` : 'Adding photo…');
  const images = [];
  for (const f of pics) { try { images.push(await uploadImage(f)); } catch (e) { toast(e.message, 'err'); } }
  for (let i = 0; i < images.length; i += 8) await capture({ images: images.slice(i, i + 8), section });
}

async function addAttachments(files) {
  for (const file of [...files].filter((f) => f.type.startsWith('image/'))) {
    const chip = h('div', { class: 'att up' }, h('img', { src: URL.createObjectURL(file), alt: '' }));
    $('#atts').append(chip);
    try {
      const img = await uploadImage(file);
      S.attachments.push(img);
      chip.classList.remove('up');
      chip.append(h('button', { title: 'Remove', onclick: () => { S.attachments.splice(S.attachments.indexOf(img), 1); chip.remove(); } }, '×'));
    } catch (e) { chip.remove(); toast(e.message, 'err'); }
  }
  $('#msg').focus({ preventScroll: true });
}

document.addEventListener('paste', (e) => {
  const files = [...(e.clipboardData?.files || [])].filter((f) => f.type.startsWith('image/'));
  const typing = e.target instanceof Element && e.target.closest('input, textarea');
  if (files.length) {
    e.preventDefault();
    if (S.pasteHook) return S.pasteHook(files);
    if (e.target === msg) return addAttachments(files); // pasting into the box: they want to say something about it
    return captureImages(files);
  }
  if (typing || document.querySelector('dialog[open]')) return;
  const text = (e.clipboardData?.getData('text/plain') || '').trim();
  if (text) { e.preventDefault(); capture({ text: text.slice(0, 4000) }); }
});

let dragDepth = 0;
document.addEventListener('dragenter', (e) => { if (e.dataTransfer?.types.includes('Files')) { dragDepth++; document.body.classList.add('drop'); } });
document.addEventListener('dragleave', () => { if (--dragDepth <= 0) { dragDepth = 0; document.body.classList.remove('drop'); } });
document.addEventListener('dragover', (e) => { if (e.dataTransfer?.types.includes('Files')) e.preventDefault(); });
document.addEventListener('drop', (e) => {
  dragDepth = 0; document.body.classList.remove('drop');
  const files = [...(e.dataTransfer?.files || [])].filter((f) => f.type.startsWith('image/'));
  if (!files.length) return;
  e.preventDefault();
  if (S.pasteHook) return S.pasteHook(files);
  captureImages(files, sectionAt(toWorld(e.clientX, e.clientY), S.lay)?.id); // dropped on a section = a hint for Claude
});

// ---------------------------------------------------------------- dialogs
function dialog(content, { onClose } = {}) {
  const dlg = h('dialog', { class: 'dlg' }, content);
  document.body.append(dlg);
  dlg.addEventListener('close', () => { S.pasteHook = null; dlg.remove(); onClose?.(); });
  const opened = Date.now(); // touch browsers replay a mousedown after the tap that opened us; ignore it
  dlg.addEventListener('mousedown', (e) => { if (e.target === dlg && Date.now() - opened > 500) dlg.close(); });
  dlg.showModal();
  return dlg;
}
const field = (label, el) => h('label', { class: 'fld' }, h('span', {}, label), el);
const moneyText = (v) => (v == null ? '' : String(v));

function openEditor(id, sectionId) {
  const card = id ? S.board.cards.find((c) => c.id === id) : null;
  if (id && !card) return;
  const real = S.board.sections.filter((s) => s.kind !== 'dashboard');
  const st = { img: card?.img ?? null, look: card?.look || (card ? 'card' : 'sticky'), featured: !!card?.featured, armed: false };
  const hasFacts = card && (card.estimate != null || card.paid != null || card.count != null || card.date || card.status || card.side || card.url || card.tags?.length);
  const f = {
    title: h('textarea', { class: 'etitle', rows: 1, placeholder: 'What is it?', maxLength: 200 }, card?.title ?? ''),
    body: h('textarea', { class: 'ebody', rows: 3, placeholder: 'Write anything… thoughts, details, why you like it' }, card?.body ?? ''),
    section: h('select', {}, real.map((s) => h('option', { value: s.id, selected: s.id === (card?.section ?? sectionId) }, `${s.emoji} ${s.title}`))),
    estimate: h('input', { value: moneyText(card?.estimate), placeholder: 'e.g. 5 lakh', inputMode: 'text' }),
    paid: h('input', { value: moneyText(card?.paid), placeholder: 'e.g. 50k', inputMode: 'text' }),
    count: h('input', { value: moneyText(card?.count), placeholder: 'guests', inputMode: 'numeric' }),
    date: h('input', { type: 'date', value: card?.date ?? '' }),
    status: h('input', { value: card?.status ?? '', list: 'statuses', placeholder: 'idea, booked…' }),
    side: h('select', {}, h('option', { value: '' }, '—'), Object.entries(SIDES).map(([k, v]) => h('option', { value: k, selected: card?.side === k }, v))),
    tags: h('input', { value: (card?.tags || []).join(', '), placeholder: 'Mehendi, Sangeet…' }),
    url: h('input', { value: card?.url ?? '', placeholder: 'https://…', inputMode: 'url' }),
  };
  const grow = () => { f.body.style.height = 'auto'; f.body.style.height = Math.min(320, f.body.scrollHeight + 2) + 'px'; };
  f.body.addEventListener('input', grow);
  const growTitle = () => { f.title.style.height = 'auto'; f.title.style.height = f.title.scrollHeight + 2 + 'px'; };
  f.title.addEventListener('input', growTitle);
  f.title.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); f.body.focus(); } });

  const fileIn = h('input', { type: 'file', accept: 'image/*', hidden: true, onchange: (e) => setImg([...e.target.files]) });
  const heroBox = h('div', {});
  const looksBox = h('div', { class: 'looks' });
  const draw = () => {
    heroBox.className = st.img ? 'ehero' : '';
    heroBox.replaceChildren(...[
      st.img ? h('img', { src: st.img.url, alt: '' }) : null,
      st.img ? h('div', { class: 'ebtns' },
        h('button', { type: 'button', class: 'btn', onclick: () => fileIn.click() }, 'Replace'),
        h('button', { type: 'button', class: 'btn', onclick: () => { st.img = null; draw(); } }, 'Remove photo')) : null,
    ].filter(Boolean));
    looksBox.replaceChildren(...[
      st.img ? null : h('div', { class: 'seg' }, Object.entries(LOOKS).map(([k, v]) => h('button', { type: 'button', class: st.look === k ? 'on' : '', onclick: () => { st.look = k; draw(); } }, v))),
      h('div', { class: 'seg' }, h('button', { type: 'button', class: st.featured ? 'on' : '', title: 'Show this card double width', onclick: () => { st.featured = !st.featured; draw(); } }, st.featured ? '★ Featured' : '☆ Feature')),
      st.img ? null : h('button', { type: 'button', class: 'btn', onclick: () => fileIn.click() }, '📷 Add photo'),
    ].filter(Boolean));
  };
  const setImg = async (files) => {
    const file = files.find((x) => x.type.startsWith('image/'));
    if (!file) return;
    try { st.img = await uploadImage(file); draw(); } catch (e) { toast(e.message, 'err'); }
  };
  draw();
  S.pasteHook = setImg;

  const del = h('button', { type: 'button', class: 'btn danger', onclick: async () => {
    if (!st.armed) { st.armed = true; del.textContent = 'Tap again to delete'; del.classList.add('armed'); return; }
    dlg.close();
    await sendOps([{ op: 'delete_card', id }]);
    toast('Deleted. You can restore it from the Journal');
  } }, 'Delete');

  const showOrig = card?.source && card.source.trim() !== (card.body || card.title).trim();
  const form = h('form', { method: 'dialog', onsubmit: async (e) => {
    e.preventDefault();
    const bad = [];
    const money = (el) => { const v = el.value.trim(); if (!v) return null; const n = parseAmount(v); if (n === undefined) { el.classList.add('bad'); bad.push(el); } return n; };
    const bodyText = f.body.value.trim();
    const fields = {
      title: f.title.value.replace(/\s+/g, ' ').trim() || bodyText.split('\n')[0].slice(0, 70), body: bodyText || null, estimate: money(f.estimate), paid: money(f.paid), count: money(f.count),
      date: f.date.value || null, status: f.status.value.trim() || null, side: f.side.value || null, url: f.url.value.trim() || null,
      tags: f.tags.value, img: st.img, look: st.img ? null : st.look, featured: st.featured,
    };
    if (bad.length) { more.open = true; bad[0].focus(); return; }
    if (!fields.title && !st.img) { f.title.classList.add('bad'); f.title.focus(); return; }
    dlg.close();
    if (card) await sendOps([{ op: 'update_card', id, patch: { ...fields, section: f.section.value } }]);
    else await sendOps([{ op: 'add_card', card: { ...fields, section: f.section.value } }]).then((r) => { const a = r.applied?.[0]; if (a) setTimeout(() => reveal(a.id), 100); });
  } },
  heroBox, fileIn, f.title, f.body,
  showOrig ? h('div', { class: 'eorig' }, h('small', {}, 'What you originally wrote'), card.source) : null,
  looksBox,
  field('Section', f.section));
  const more = h('details', { class: 'more', open: !!hasFacts },
    h('summary', {}, 'Details: budget, date, guests, status'),
    h('div', {},
      h('div', { class: 'grid3' }, field('Budget ₹', f.estimate), field('Paid ₹', f.paid), field('Guests', f.count)),
      h('div', { class: 'grid3' }, field('Date', f.date), field('Status', f.status), field('Side', f.side)),
      field('Tags', f.tags), field('Link', f.url),
      h('datalist', { id: 'statuses' }, STATUS_HINTS.map((s) => h('option', { value: s })))));
  form.append(more, h('div', { class: 'actions' }, card ? del : null,
    card?.created ? h('span', { class: 'emeta' }, `Added ${new Date(card.created).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}`) : null,
    h('span', { class: 'spacer' }),
    h('button', { type: 'button', class: 'btn', onclick: () => dlg.close() }, 'Cancel'),
    h('button', { class: 'btn primary' }, 'Save')));
  const dlg = dialog(form);
  grow(); growTitle();
  if (!card) f.title.focus();
}

function openSection(id) {
  const sec = id ? sectionOf(id) : null;
  let color = sec?.color ?? SWATCHES[S.board.sections.length % SWATCHES.length];
  let armed = false;
  const title = h('input', { value: sec?.title ?? '', placeholder: 'e.g. Honeymoon plans', required: true, maxLength: 60 });
  const emoji = h('input', { value: sec?.emoji ?? '📌', maxLength: 8, style: { width: '80px' } });
  const sw = h('div', { class: 'swatches' });
  const drawSw = () => sw.replaceChildren(...SWATCHES.map((c) => h('button', { type: 'button', class: `sw ${c === color ? 'on' : ''}`, style: { background: c }, onclick: () => { color = c; drawSw(); } })));
  drawSw();
  const idx = S.board.sections.findIndex((s) => s.id === id);
  const move = (delta) => async () => { dlg.close(); await sendOps([{ op: 'move_section', id, index: idx + delta }]); };
  const del = h('button', { type: 'button', class: 'btn danger', onclick: async () => {
    if (!armed) { armed = true; del.textContent = 'Tap again: its cards go to the Inbox'; del.classList.add('armed'); return; }
    dlg.close(); await sendOps([{ op: 'delete_section', id }]);
  } }, 'Delete section');
  const form = h('form', { method: 'dialog', onsubmit: async (e) => {
    e.preventDefault();
    if (!title.value.trim()) return;
    dlg.close();
    const section = { title: title.value.trim(), emoji: emoji.value.trim() || '📌', color };
    await sendOps([sec ? { op: 'update_section', id, section } : { op: 'add_section', section }]);
  } },
  h('h3', {}, sec ? 'Section settings' : 'New section'),
  h('div', { style: { display: 'flex', gap: '10px' } }, field('Icon', emoji), h('div', { style: { flex: 1 } }, field('Name', title))),
  field('Colour', sw),
  sec ? h('div', { class: 'actions', style: { justifyContent: 'flex-start' } },
    h('button', { type: 'button', class: 'btn', disabled: idx <= 1, onclick: move(-1) }, '↑ Earlier'),
    h('button', { type: 'button', class: 'btn', disabled: idx >= S.board.sections.length - 1, onclick: move(1) }, '↓ Later')) : null,
  h('div', { class: 'actions' }, sec && sec.id !== 'ideas' ? del : null, h('span', { class: 'spacer' }),
    h('button', { type: 'button', class: 'btn', onclick: () => dlg.close() }, 'Cancel'), h('button', { class: 'btn primary' }, 'Save')));
  const dlg = dialog(form);
  if (!sec) title.focus();
}
$('#addSec').addEventListener('click', () => openSection(null));

function openSettings() {
  const st = S.board.settings;
  const f = {
    names: h('input', { value: st.names, placeholder: 'e.g. Anika & Rohan', maxLength: 80 }),
    date: h('input', { type: 'date', value: st.weddingDate ?? '' }),
    budget: h('input', { value: moneyText(st.budgetTotal), placeholder: 'e.g. 40 lakh or 1.2 cr' }),
    guests: h('input', { value: moneyText(st.guestTarget), placeholder: 'e.g. 400', inputMode: 'numeric' }),
  };
  const form = h('form', { method: 'dialog', onsubmit: async (e) => {
    e.preventDefault();
    const b = f.budget.value.trim() ? parseAmount(f.budget.value) : null;
    const g = f.guests.value.trim() ? parseAmount(f.guests.value) : null;
    if (b === undefined) { f.budget.classList.add('bad'); return; }
    if (g === undefined) { f.guests.classList.add('bad'); return; }
    dlg.close();
    await sendOps([{ op: 'set_settings', settings: { names: f.names.value.trim(), weddingDate: f.date.value || null, budgetTotal: b, guestTarget: g } }]);
  } },
  h('h3', {}, 'Our wedding'),
  field('Names', f.names), field('Wedding date', f.date),
  h('div', { class: 'grid2' }, field('Total budget ₹', f.budget), field('Guest target', f.guests)),
  h('div', { class: 'actions' }, h('span', { class: 'spacer' }),
    h('button', { type: 'button', class: 'btn', onclick: () => dlg.close() }, 'Cancel'), h('button', { class: 'btn primary' }, 'Save')));
  const dlg = dialog(form);
}

// ---------------------------------------------------------------- undo / arrange
$('#undo').addEventListener('click', async () => {
  try { const r = await api('/api/undo', {}); setBoard(r.board); toast(r.ok ? 'Undone' : 'Nothing to undo'); } catch (e) { toast(e.message, 'err'); }
});

$('#arrange').addEventListener('click', async () => {
  if (S.busy) return;
  S.busy = true;
  $('#arrange').classList.add('busy');
  say('Claude is looking over the whole board and tidying it…', true);
  try {
    const r = await api('/api/arrange', {});
    S.busy = false;
    setBoard(r.board);
    say(r.changed ? `${r.reply}  (↶ undoes it)` : r.reply);
  } catch (e) { say(''); toast(e.message, 'err'); } finally { S.busy = false; $('#arrange').classList.remove('busy'); }
});

// ---------------------------------------------------------------- composer
const msg = $('#msg');
const autosize = () => { msg.style.height = 'auto'; msg.style.height = Math.min(120, msg.scrollHeight) + 'px'; };
msg.addEventListener('input', autosize);
msg.addEventListener('keydown', (e) => { if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) { e.preventDefault(); send(); } });
$('#send').addEventListener('click', send);
$('#attBtn').addEventListener('click', () => $('#file').click());
$('#file').addEventListener('change', (e) => { addAttachments(e.target.files); e.target.value = ''; });

function say(text, busy = false) {
  const el = $('#status');
  clearTimeout(say.t);
  if (!text) { el.hidden = true; return; }
  el.hidden = false;
  el.className = busy ? 'busy' : '';
  el.textContent = text;
  if (!busy) say.t = setTimeout(() => { el.hidden = true; }, Math.min(20000, 5000 + text.length * 60));
}
$('#status').addEventListener('click', () => { $('#status').hidden = true; });

async function send() {
  if (S.busy) return;
  const message = msg.value.trim();
  if (!message && !S.attachments.length) return;
  if ($('#atts .up')) return toast('Photo is still uploading…');
  const attachments = S.attachments.splice(0);
  msg.value = ''; autosize(); $('#atts').replaceChildren();

  // Thoughts and photos land on the board straight away and get sorted in the background.
  // Questions, instructions, and a remark about several photos at once go to Claude as a conversation.
  const converse = (message && ASKING.test(message)) || (message && attachments.length > 1);
  if (!converse) { await capture({ text: message, images: attachments }); return; }

  S.busy = true; $('#send').disabled = true;
  say('Claude is on it…', true);
  try {
    const r = await api('/api/chat', { message, attachments });
    S.busy = false;
    setBoard(r.board);
    say(r.reply);
    if (r.added?.length) setTimeout(() => reveal(r.added[0]), 80);
  } catch (e) {
    say('');
    toast(e.message, 'err');
    msg.value = message; autosize();
  } finally {
    S.busy = false; $('#send').disabled = false;
  }
}

// ---------------------------------------------------------------- side panel: journal + conversation
function openPanel(tab) {
  const panel = $('#panel');
  if (!panel.hidden && S.tab === tab) { panel.hidden = true; return; }
  S.tab = tab;
  panel.hidden = false;
  renderPanel();
}
$('#journalBtn').addEventListener('click', () => openPanel('journal'));
$('#chatBtn').addEventListener('click', () => openPanel('chat'));
$('#panelClose').addEventListener('click', () => { $('#panel').hidden = true; });
for (const t of document.querySelectorAll('.tab')) t.addEventListener('click', () => { S.tab = t.dataset.tab; renderPanel(); });

function renderPanel() {
  if ($('#panel').hidden || !S.board) return;
  for (const t of document.querySelectorAll('.tab')) t.classList.toggle('on', t.dataset.tab === S.tab);
  if (S.tab === 'chat') renderChat(); else renderJournal();
}

function dayLabel(ts) {
  const d = new Date(ts);
  const days = Math.round((new Date().setHours(0, 0, 0, 0) - new Date(ts).setHours(0, 0, 0, 0)) / 86400000);
  if (days === 0) return 'Today';
  if (days === 1) return 'Yesterday';
  return d.toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long' });
}

function jump(id) {
  const card = S.board.cards.find((c) => c.id === id);
  if (!card) return;
  const go = () => { reveal(id, { force: true }); if (innerWidth < 760) $('#panel').hidden = true; };
  if (sectionOf(card.section)?.collapsed) sendOps([{ op: 'update_section', id: card.section, section: { collapsed: false } }]).then(() => setTimeout(go, 60));
  else go();
}

function journalRow(card, action) {
  const sec = sectionOf(card.section);
  const look = lookOf(card);
  const time = new Date(card.deleted || card.created || Date.now()).toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' });
  const orig = card.source && card.source.trim() !== card.title.trim() ? card.source : null;
  const row = h('div', { class: 'jrow', role: 'button', tabindex: 0, style: { '--c': sec?.color } },
    card.img ? h('img', { class: 'jthumb', src: card.img.url, alt: '', loading: 'lazy' }) : h('span', { class: 'jthumb' }, GLYPH[look]),
    h('span', { class: 'jmain' }, h('span', { class: 'jt' }, card.title),
      orig ? h('span', { class: 'jsrc' }, `“${orig.replace(/\s+/g, ' ')}”`) : null,
      h('span', { class: 'js' }, `${sec ? `${sec.emoji} ${sec.title}` : 'Removed section'} · ${time}`)),
    action || h('span', {}));
  if (!action) row.addEventListener('click', () => jump(card.id));
  return row;
}

function renderJournal() {
  const body = $('#panelBody');
  const cards = [...S.board.cards].sort((a, z) => (z.created || 0) - (a.created || 0)).slice(0, 200);
  const out = [];
  if (!cards.length) out.push(h('div', { class: 'jempty' }, 'Nothing here yet. Paste a photo or type a thought below and it will show up here, newest first.'));
  let last = '';
  for (const c of cards) {
    const label = dayLabel(c.created || Date.now());
    if (label !== last) { out.push(h('div', { class: 'jday' }, label)); last = label; }
    out.push(journalRow(c));
  }
  const trash = S.board.trash || [];
  if (trash.length) {
    out.push(h('div', { class: 'jday' }, 'Recently deleted'));
    for (const c of trash.slice(0, 30)) out.push(journalRow(c, h('button', { class: 'jact', onclick: () => sendOps([{ op: 'restore_card', id: c.id }]).then(() => setTimeout(() => jump(c.id), 120)) }, 'Restore')));
    out.push(h('button', { class: 'link', onclick: () => sendOps([{ op: 'empty_trash' }]) }, 'Empty deleted items'));
  }
  body.replaceChildren(...out);
}

function renderChat() {
  const body = $('#panelBody');
  const log = S.board?.chat || [];
  if (!log.length) {
    body.replaceChildren(h('div', { class: 'sugg' }, h('div', { class: 'jempty' }, 'Say it however it comes out. Claude files it, or answers.'),
      EXAMPLES.map((t) => h('button', { onclick: () => { msg.value = t; autosize(); msg.focus(); } }, t))));
    return;
  }
  body.replaceChildren(...log.map((m) => h('div', { class: `msg ${m.role}` }, (m.images || []).map((u) => h('img', { src: u, alt: '' })), m.text)),
    h('button', { class: 'link', onclick: async () => setBoard((await api('/api/chat/clear', {})).board) }, 'Clear conversation'));
  body.scrollTop = body.scrollHeight;
}

boot().catch((e) => { console.error(e); toast(e.message, 'err'); });
