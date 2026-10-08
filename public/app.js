import { h, $, toast, clamp } from './ui.js';
import { parseAmount, formatINR, daysUntil, countsTowardBudget, SIDES, STATUS_HINTS, statusTone } from './shared.js';
import { CARD_W, layout, pickProfile, insertionIndex } from './layout.js';

const vp = $('#vp');
const world = $('#world');
const SWATCHES = ['#D98E04', '#C2185B', '#00796B', '#3949AB', '#E8590C', '#6B8E23', '#8E2432', '#7B4EA3', '#0B7285', '#B8860B'];
const EXAMPLES = [
  'Booked Taj Falaknuma for the Sangeet, ₹12 lakh, 250 guests',
  "Add Sharma family from Delhi, 18 people, bride's side, invite to all functions",
  'Ideas for a marigold and pink mandap, budget around 6 lakh',
  'How much have we planned vs paid so far?',
];

const S = {
  board: null, rev: 0, view: { x: 0, y: 0, k: 1 }, profile: null, lay: null, heights: {},
  cardNodes: new Map(), frameNodes: new Map(), sigs: new Map(), dash: null, slot: null,
  ptrs: new Map(), mode: null, pending: null, drag: null, last: null, pinch: null,
  q: '', attachments: [], busy: false, fresh: new Set(), dirty: false, pasteHook: null, animOn: false,
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
  fit();
  requestAnimationFrame(() => requestAnimationFrame(() => { S.animOn = true; world.classList.add('anim'); }));
  connectEvents();
}

function showLock() {
  $('#app').hidden = true;
  $('#lock').hidden = false;
}
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
  if (S.board) {
    const known = new Set(S.board.cards.map((c) => c.id));
    for (const c of b.cards) if (!known.has(c.id)) S.fresh.add(c.id);
  }
  S.board = b;
  S.rev = b.rev;
  render();
  renderChat();
  $('#undo').disabled = !b.canUndo;
  const names = b.settings.names;
  $('#title').textContent = names || 'Wedding Board';
  document.title = names ? `${names} · Wedding Board` : 'Wedding Board';
}

// ---------------------------------------------------------------- rendering
const sectionOf = (id) => S.board.sections.find((s) => s.id === id);
const sum = (cards, key) => cards.reduce((t, c) => t + (c[key] || 0), 0);

function fmtDate(iso) {
  const d = new Date(iso + 'T00:00:00');
  const sameYear = d.getFullYear() === new Date().getFullYear();
  return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', ...(sameYear ? {} : { year: 'numeric' }) });
}

function render() {
  const { sections, cards } = S.board;
  S.profile = pickProfile(vp.clientWidth);

  // frames
  const secIds = new Set(sections.map((s) => s.id));
  for (const [id, node] of S.frameNodes) if (!secIds.has(id)) { node.remove(); S.frameNodes.delete(id); S.sigs.delete('f' + id); }
  for (const sec of sections) {
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
    if (!node) { node = h('div', { class: 'card', 'data-id': card.id }); world.append(node); S.cardNodes.set(card.id, node); }
    const sec = sectionOf(card.section);
    node.style.setProperty('--c', sec.color);
    node.classList.toggle('folded', !!sec.collapsed);
    const sig = JSON.stringify(card);
    if (S.sigs.get(card.id) !== sig) { S.sigs.set(card.id, sig); node.replaceChildren(...cardContent(card)); }
    if (S.fresh.has(card.id)) { node.classList.add('fresh'); setTimeout(() => node.classList.remove('fresh'), 1500); }
  }
  S.fresh.clear();

  // dashboard
  const dashSec = sections.find((s) => s.kind === 'dashboard');
  if (dashSec) {
    S.dash?.remove();
    S.dash = buildDash(S.board);
    S.dash.style.setProperty('--c', dashSec.color);
    world.append(S.dash);
  }

  measure();
  relayout();
  applySearch();
}

function measure() {
  for (const [id, node] of S.cardNodes) S.heights[id] = node.offsetHeight;
  const dashSec = S.board.sections.find((s) => s.kind === 'dashboard');
  if (dashSec && S.dash) S.heights[dashSec.id] = S.dash.offsetHeight;
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

function relayout(override) {
  S.lay = layout({ sections: S.board.sections, cardIds: cardIdsBySection(override), heights: S.heights, cols: S.profile.cols, lanes: S.profile.lanes });
  applyLayout();
}

function applyLayout() {
  const L = S.lay;
  for (const [id, node] of S.frameNodes) {
    const f = L.frames[id];
    node.style.transform = `translate(${f.x}px, ${f.y}px)`;
    node.style.width = f.w + 'px';
    node.style.height = f.h + 'px';
  }
  for (const [id, node] of S.cardNodes) {
    if (S.drag?.id === id) continue;
    const p = L.cards[id];
    if (p) node.style.transform = `translate(${p.x}px, ${p.y}px)`;
  }
  const dashSec = S.board.sections.find((s) => s.kind === 'dashboard');
  if (dashSec && S.dash) {
    const f = L.frames[dashSec.id];
    S.dash.style.transform = `translate(${f.x + 14}px, ${f.y + f.bodyTop}px)`;
  }
  if (S.drag && S.slot) {
    const p = L.cards[S.drag.id];
    if (p) { S.slot.style.transform = `translate(${p.x}px, ${p.y}px)`; S.slot.style.height = (S.heights[S.drag.id] || 100) + 'px'; }
  }
  for (const [id, node] of S.frameNodes) node.classList.toggle('target', !!S.drag && S.drag.section === id);
  world.style.width = L.width + 'px';
  world.style.height = L.height + 'px';
}

function frameHead(sec, mine) {
  if (sec.kind === 'dashboard') {
    return h('div', { class: 'fhead' },
      h('span', { class: 'ftitle' }, `${sec.emoji} ${sec.title}`),
      h('button', { class: 'ficon', title: 'Edit names, date and budget', onclick: openSettings }, '✎'));
  }
  const est = sum(mine.filter(countsTowardBudget), 'estimate');
  return h('div', { class: 'fhead' },
    h('button', { class: 'ftitle', title: sec.collapsed ? 'Expand' : 'Collapse', onclick: () => sendOps([{ op: 'update_section', id: sec.id, section: { collapsed: !sec.collapsed } }]) },
      `${sec.emoji} ${sec.title}`, h('span', { class: 'fcount' }, mine.length)),
    est ? h('span', { class: 'fsum' }, formatINR(est)) : null,
    h('button', { class: 'ficon', title: 'Add a card', onclick: () => openEditor(null, sec.id) }, '＋'),
    h('button', { class: 'ficon', title: 'Section settings', onclick: () => openSection(sec.id) }, '⋯'));
}

function cardContent(card) {
  const out = [];
  if (card.img) {
    const ratio = clamp(card.img.w / card.img.h, 0.74, 3);
    out.push(h('img', { class: 'cimg', src: card.img.url, alt: '', loading: 'lazy', draggable: false, style: { aspectRatio: String(ratio) } }));
  }
  const chips = [];
  if (card.estimate != null || card.paid != null) {
    const t = [card.estimate != null ? formatINR(card.estimate) : null, card.paid != null ? `paid ${formatINR(card.paid)}` : null].filter(Boolean).join(' · ');
    chips.push(h('span', { class: 'chip money' }, t));
  }
  if (card.count != null) chips.push(h('span', { class: 'chip' }, `👥 ${card.count}`));
  if (card.date) chips.push(h('span', { class: 'chip' }, `📅 ${fmtDate(card.date)}`));
  if (card.side) chips.push(h('span', { class: 'chip' }, SIDES[card.side].replace("'s side", '').replace(' sides', '')));
  if (card.status) chips.push(h('span', { class: `chip ${statusTone(card.status)}` }, card.status));
  for (const t of card.tags || []) chips.push(h('span', { class: 'chip tag' }, t));
  const link = safeUrl(card.url);
  if (link) chips.push(h('a', { class: 'chip', href: link.href, target: '_blank', rel: 'noopener noreferrer' }, `🔗 ${link.hostname.replace(/^www\./, '')}`));
  out.push(h('div', { class: 'cbody' },
    h('div', { class: 'ctitle' }, card.title),
    card.body ? h('div', { class: 'cnote' }, card.body) : null,
    chips.length ? h('div', { class: 'chips' }, chips) : null));
  return out;
}

function safeUrl(u) {
  if (!u) return null;
  try { const x = new URL(/^[a-z]+:/i.test(u) ? u : `https://${u}`); return /^https?:$/.test(x.protocol) ? x : null; } catch { return null; }
}

function buildDash(b) {
  const { settings: st, cards, sections } = b;
  const real = sections.filter((s) => s.kind !== 'dashboard');
  const committed = cards.filter(countsTowardBudget);
  const plan = sum(committed, 'estimate');
  const paid = sum(cards, 'paid');
  const options = sum(cards.filter((c) => !countsTowardBudget(c)), 'estimate');
  const base = st.budgetTotal || plan || 1;
  const kids = [];

  // hero
  const hero = h('div', { class: 'dhero' }, h('div', { class: 'dnames' }, st.names || 'Our Wedding'));
  if (st.weddingDate) {
    const d = daysUntil(st.weddingDate);
    hero.append(h('div', { class: 'ddate' }, new Date(st.weddingDate + 'T00:00:00').toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'long', year: 'numeric' })),
      h('div', { class: 'dbig' }, d > 0 ? `${d} days to go` : d === 0 ? 'Today! 🎉' : `${-d} days ago ❤️`));
  } else hero.append(h('div', { style: { marginTop: '8px' } }, h('button', { class: 'dbtn', onclick: openSettings }, 'Set wedding date & budget')));
  kids.push(hero);

  // budget
  const over = st.budgetTotal && plan > st.budgetTotal;
  kids.push(h('div', { class: 'dblock' },
    h('div', { class: 'dlabel' }, h('span', {}, 'Budget'), h('span', {}, st.budgetTotal ? formatINR(st.budgetTotal) : 'no total set')),
    h('div', { class: 'bar', style: { '--c': over ? 'var(--bad)' : 'var(--accent)' } },
      h('i', { class: 'plan', style: { width: `${Math.min(100, (plan / base) * 100)}%` } }),
      h('i', { style: { width: `${Math.min(100, (paid / base) * 100)}%` } })),
    h('div', { class: 'drow' }, h('span', {}, `Planned ${formatINR(plan)}`), h('span', {}, `Paid ${formatINR(paid)}`)),
    options ? h('div', { class: 'drow' }, h('span', {}, 'Ideas (not counted)'), h('span', {}, formatINR(options))) : null,
    over ? h('div', { class: 'dwarn' }, `Over budget by ${formatINR(plan - st.budgetTotal)}`)
      : st.budgetTotal ? h('div', { class: 'drow' }, h('span', {}, 'Left to plan'), h('span', {}, formatINR(st.budgetTotal - plan))) : null));

  // where the money goes
  const rows = real.map((s) => ({ s, v: sum(committed.filter((c) => c.section === s.id), 'estimate') })).filter((r) => r.v > 0).sort((a, z) => z.v - a.v).slice(0, 7);
  if (rows.length) {
    kids.push(h('div', { class: 'dblock' }, h('div', { class: 'dlabel' }, h('span', {}, 'By category')),
      rows.map((r) => h('div', { class: 'dmini' },
        h('div', { class: 'drow' }, h('span', {}, `${r.s.emoji} ${r.s.title}`), h('span', {}, formatINR(r.v))),
        h('div', { class: 'bar', style: { '--c': r.s.color } }, h('i', { style: { width: `${(r.v / rows[0].v) * 100}%` } }))))));
  }

  // guests
  const guestCards = cards.filter((c) => c.section === 'guests');
  const heads = sum(guestCards, 'count');
  if (guestCards.length || st.guestTarget) {
    const by = (side) => sum(guestCards.filter((c) => (c.side || 'none') === side), 'count');
    kids.push(h('div', { class: 'dblock' },
      h('div', { class: 'dlabel' }, h('span', {}, 'Guests'), h('span', {}, st.guestTarget ? `target ${st.guestTarget}` : '')),
      h('div', { class: 'dbig', style: { marginTop: 0, fontSize: '22px' } }, `${heads} invited`),
      st.guestTarget ? h('div', { class: 'bar' }, h('i', { style: { width: `${Math.min(100, (heads / st.guestTarget) * 100)}%` } })) : null,
      h('div', { class: 'chips' },
        by('bride') ? h('span', { class: 'chip' }, `Bride ${by('bride')}`) : null,
        by('groom') ? h('span', { class: 'chip' }, `Groom ${by('groom')}`) : null,
        by('both') ? h('span', { class: 'chip' }, `Both ${by('both')}`) : null,
        by('none') ? h('span', { class: 'chip' }, `Unassigned ${by('none')}`) : null)));
  }

  // next events
  const events = cards.filter((c) => c.section === 'events');
  const dated = events.filter((c) => c.date && daysUntil(c.date) >= 0).sort((a, z) => a.date.localeCompare(z.date)).slice(0, 4);
  if (dated.length) {
    kids.push(h('div', { class: 'dblock' }, h('div', { class: 'dlabel' }, h('span', {}, 'Coming up')),
      dated.map((c) => h('div', { class: 'drow' }, h('span', {}, c.title), h('span', {}, fmtDate(c.date))))));
  }
  const undated = events.filter((c) => !c.date).length;
  if (undated) kids.push(h('div', { class: 'drow' }, h('span', {}, 'Functions without a date'), h('span', {}, undated)));

  // to-dos
  const todos = cards.filter((c) => c.section === 'todo');
  if (todos.length) {
    const done = todos.filter((c) => statusTone(c.status) === 'good').length;
    kids.push(h('div', { class: 'dblock' }, h('div', { class: 'dlabel' }, h('span', {}, 'To-dos'), h('span', {}, `${done}/${todos.length} done`)),
      h('div', { class: 'bar' }, h('i', { style: { width: `${(done / todos.length) * 100}%` } }))));
  }
  return h('div', { class: 'dash' }, kids);
}

function applySearch() {
  const q = S.q.trim().toLowerCase();
  for (const card of S.board.cards) {
    const node = S.cardNodes.get(card.id);
    if (!node) continue;
    const hay = [card.title, card.body, card.status, card.url, ...(card.tags || [])].join(' ').toLowerCase();
    node.classList.toggle('dim', !!q && !hay.includes(q));
  }
}
$('#search').addEventListener('input', (e) => { S.q = e.target.value; applySearch(); });
$('#searchBtn').addEventListener('click', () => { document.body.classList.toggle('searching'); if (document.body.classList.contains('searching')) $('#search').focus(); });

// ---------------------------------------------------------------- viewport: pan / zoom / pinch
function applyView() {
  const { k } = S.view;
  const W = (S.lay?.width || 0) * k;
  const H = (S.lay?.height || 0) * k;
  S.view.x = clamp(S.view.x, 80 - W, vp.clientWidth - 80);
  S.view.y = clamp(S.view.y, 80 - H - 100, vp.clientHeight - 80);
  world.style.transform = `translate(${S.view.x}px, ${S.view.y}px) scale(${k})`;
  vp.style.setProperty('--gs', `${24 * k}px`);
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
  if (!S.profile || prof.cols !== S.profile.cols || prof.lanes !== S.profile.lanes) { render(); }
  measure();
  relayout();
  const W = S.lay.width;
  S.view.k = clamp((vp.clientWidth - 24) / W, 0.2, 1.15);
  S.view.x = (vp.clientWidth - W * S.view.k) / 2;
  S.view.y = 12;
  smooth();
  applyView();
}

function smooth() {
  if (!S.animOn) return;
  world.classList.add('smooth');
  clearTimeout(smooth.t);
  smooth.t = setTimeout(() => world.classList.remove('smooth'), 400);
}

function reveal(id) {
  const p = S.lay.cards[id];
  if (!p) return;
  const { x, y, k } = S.view;
  const h2 = S.heights[id] || 100;
  const sx = p.x * k + x, sy = p.y * k + y;
  const visible = sx > 0 && sy > 0 && sx + CARD_W * k < vp.clientWidth && sy + h2 * k < vp.clientHeight - 90;
  if (visible) return;
  S.view.x = vp.clientWidth / 2 - (p.x + CARD_W / 2) * k;
  S.view.y = (vp.clientHeight - 90) / 2 - (p.y + h2 / 2) * k;
  smooth();
  applyView();
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
  if (S.ptrs.size === 2) { cancelPending(); endDragCancel(); S.mode = 'pinch'; S.pinch = pinchState(); return; }
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

function startDrag(pt) {
  if (!pt || !S.pending) return;
  const id = S.pending.id;
  cancelPending();
  const card = S.board.cards.find((c) => c.id === id);
  const node = S.cardNodes.get(id);
  if (!card || !node) return;
  const w = toWorld(pt.x, pt.y);
  const here = S.lay.cards[id];
  const origIds = cardIdsBySection()[card.section];
  S.mode = 'drag';
  S.drag = { id, gx: w.x - here.x, gy: w.y - here.y, origSection: card.section, origIndex: origIds.indexOf(id), section: card.section, index: origIds.indexOf(id), px: pt.x, py: pt.y };
  // stable hit-testing layout: the board as if the dragged card had been lifted out
  S.drag.base = layout({ sections: S.board.sections, cardIds: cardIdsBySection({ id, section: null }), heights: S.heights, cols: S.profile.cols, lanes: S.profile.lanes });
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
  S.cardNodes.get(d.id).style.transform = `translate(${w.x - d.gx}px, ${w.y - d.gy}px) rotate(1.2deg)`;
  const B = d.base;
  for (const sec of S.board.sections) {
    if (sec.kind === 'dashboard') continue;
    const f = B.frames[sec.id];
    if (w.x >= f.x && w.x <= f.x + f.w && w.y >= f.y && w.y <= f.y + f.h) {
      const ids = cardIdsBySection({ id: d.id, section: null })[sec.id];
      d.section = sec.id;
      d.index = sec.collapsed ? ids.length : insertionIndex(ids, B.cards, S.heights, w.x, w.y);
      S.slot.style.setProperty('--c', sec.color);
      break;
    }
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

function endDragCancel() {
  if (!S.drag) return;
  endDrag(true);
}

async function endDrag(cancelled) {
  const d = S.drag;
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

// ---------------------------------------------------------------- images
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
  if (!files.length) return;
  e.preventDefault();
  (S.pasteHook || addAttachments)(files);
});

let dragDepth = 0;
document.addEventListener('dragenter', (e) => { if (e.dataTransfer?.types.includes('Files')) { dragDepth++; document.body.classList.add('drop'); } });
document.addEventListener('dragleave', () => { if (--dragDepth <= 0) { dragDepth = 0; document.body.classList.remove('drop'); } });
document.addEventListener('dragover', (e) => { if (e.dataTransfer?.types.includes('Files')) e.preventDefault(); });
document.addEventListener('drop', async (e) => {
  dragDepth = 0; document.body.classList.remove('drop');
  const files = [...(e.dataTransfer?.files || [])].filter((f) => f.type.startsWith('image/'));
  if (!files.length) return;
  e.preventDefault();
  if (S.pasteHook) return S.pasteHook(files);
  // dropped on a section: file it there directly; elsewhere: attach to the chat for Claude to file
  const w = toWorld(e.clientX, e.clientY);
  const hit = S.board.sections.find((s) => { const f = S.lay.frames[s.id]; return s.kind !== 'dashboard' && f && w.x >= f.x && w.x <= f.x + f.w && w.y >= f.y && w.y <= f.y + f.h; });
  if (!hit) return addAttachments(files);
  try {
    const ops = [];
    for (const f of files) ops.push({ op: 'add_card', card: { section: hit.id, title: f.name.replace(/\.[^.]+$/, '') || 'Photo', img: await uploadImage(f) } });
    await sendOps(ops);
    toast(`Added to ${hit.title} - tap a photo to add details`);
  } catch (err) { toast(err.message, 'err'); }
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
  const real = S.board.sections.filter((s) => s.kind !== 'dashboard');
  const st = { img: card?.img ?? null, armed: false };
  const f = {
    title: h('input', { value: card?.title ?? '', placeholder: 'e.g. Taj Falaknuma Palace', required: true, maxLength: 200 }),
    body: h('textarea', { rows: 4, placeholder: 'Notes, details, why you like it…' }, card?.body ?? ''),
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
  const imgBox = h('div', { class: 'imgbox' });
  const fileIn = h('input', { type: 'file', accept: 'image/*', hidden: true, onchange: (e) => setImg([...e.target.files]) });
  const drawImg = () => {
    imgBox.replaceChildren(...[
      st.img ? h('img', { src: st.img.url, alt: '' }) : null,
      h('button', { type: 'button', class: 'btn', onclick: () => fileIn.click() }, st.img ? 'Replace photo' : '📷 Add photo'),
      st.img ? h('button', { type: 'button', class: 'btn danger', onclick: () => { st.img = null; drawImg(); } }, 'Remove') : null,
    ].filter(Boolean));
  };
  const setImg = async (files) => {
    const file = files.find((x) => x.type.startsWith('image/'));
    if (!file) return;
    try { st.img = await uploadImage(file); drawImg(); } catch (e) { toast(e.message, 'err'); }
  };
  drawImg();
  S.pasteHook = setImg;

  const del = h('button', { type: 'button', class: 'btn danger', onclick: async () => {
    if (!st.armed) { st.armed = true; del.textContent = 'Tap again to delete'; del.classList.add('armed'); return; }
    dlg.close();
    await sendOps([{ op: 'delete_card', id }]);
    toast('Deleted - ↶ Undo is in the top bar');
  } }, 'Delete');

  const form = h('form', { method: 'dialog', onsubmit: async (e) => {
    e.preventDefault();
    const bad = [];
    const money = (el) => { const v = el.value.trim(); if (!v) return null; const n = parseAmount(v); if (n === undefined) { el.classList.add('bad'); bad.push(el); } return n; };
    const fields = {
      title: f.title.value.trim(), body: f.body.value.trim() || null, estimate: money(f.estimate), paid: money(f.paid), count: money(f.count),
      date: f.date.value || null, status: f.status.value.trim() || null, side: f.side.value || null, url: f.url.value.trim() || null,
      tags: f.tags.value, img: st.img,
    };
    if (bad.length) { bad[0].focus(); return; }
    if (!fields.title) { f.title.classList.add('bad'); f.title.focus(); return; }
    dlg.close();
    if (card) await sendOps([{ op: 'update_card', id, patch: { ...fields, section: f.section.value } }]);
    else await sendOps([{ op: 'add_card', card: { ...fields, section: f.section.value } }]).then((r) => { const a = r.applied?.[0]; if (a) setTimeout(() => reveal(a.id), 100); });
  } },
  h('h3', {}, card ? 'Edit card' : 'New card'),
  field('Title', f.title), imgBox, fileIn,
  field('Notes', f.body),
  h('div', { class: 'grid2' }, field('Section', f.section), field('Status', f.status)),
  h('div', { class: 'grid3' }, field('Budget ₹', f.estimate), field('Paid ₹', f.paid), field('Guests', f.count)),
  h('div', { class: 'grid2' }, field('Date', f.date), field('Side', f.side)),
  field('Tags', f.tags), field('Link', f.url),
  h('datalist', { id: 'statuses' }, STATUS_HINTS.map((s) => h('option', { value: s }))),
  h('div', { class: 'actions' }, card ? del : null, h('span', { class: 'spacer' }),
    h('button', { type: 'button', class: 'btn', onclick: () => dlg.close() }, 'Cancel'),
    h('button', { class: 'btn primary' }, 'Save')));
  const dlg = dialog(form);
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
    if (!armed) { armed = true; del.textContent = 'Tap again - cards go to the Inbox'; del.classList.add('armed'); return; }
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

// ---------------------------------------------------------------- undo
$('#undo').addEventListener('click', async () => {
  try { const r = await api('/api/undo', {}); setBoard(r.board); toast(r.ok ? 'Undone' : 'Nothing to undo'); } catch (e) { toast(e.message, 'err'); }
});

// ---------------------------------------------------------------- chat
const msg = $('#msg');
const autosize = () => { msg.style.height = 'auto'; msg.style.height = Math.min(120, msg.scrollHeight) + 'px'; };
msg.addEventListener('input', autosize);
msg.addEventListener('keydown', (e) => { if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) { e.preventDefault(); send(); } });
$('#send').addEventListener('click', send);
$('#attBtn').addEventListener('click', () => $('#file').click());
$('#file').addEventListener('change', (e) => { addAttachments(e.target.files); e.target.value = ''; });
$('#chatBtn').addEventListener('click', () => { $('#chat').hidden = !$('#chat').hidden; renderChat(); });
$('#chatClose').addEventListener('click', () => { $('#chat').hidden = true; });
$('#chatClear').addEventListener('click', async () => { setBoard((await api('/api/chat/clear', {})).board); });

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
  const restore = { message, attachments };
  msg.value = ''; autosize(); $('#atts').replaceChildren();
  S.busy = true; $('#send').disabled = true;
  say('Claude is organising your board…', true);
  try {
    const r = await api('/api/chat', { message, attachments });
    setBoard(r.board);
    say(r.reply);
    if (r.added?.length) setTimeout(() => reveal(r.added[0]), 80);
  } catch (e) {
    say('');
    toast(e.message, 'err');
    msg.value = restore.message; autosize();
  } finally {
    S.busy = false; $('#send').disabled = false;
  }
}

function renderChat() {
  const list = $('#chatList');
  const log = S.board?.chat || [];
  if ($('#chat').hidden) return;
  if (!log.length) {
    list.replaceChildren(h('div', { class: 'sugg' }, h('div', { style: { color: 'var(--muted)' } }, 'Type or paste anything - Claude files it on the board. Try:'),
      EXAMPLES.map((t) => h('button', { onclick: () => { msg.value = t; autosize(); msg.focus(); } }, t))));
    return;
  }
  list.replaceChildren(...log.map((m) => h('div', { class: `msg ${m.role}` }, (m.images || []).map((u) => h('img', { src: u, alt: '' })), m.text)));
  list.scrollTop = list.scrollHeight;
}

boot().catch((e) => { console.error(e); toast(e.message, 'err'); });
