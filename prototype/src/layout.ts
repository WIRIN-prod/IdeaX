import { Card, SECTIONS } from './data';
export type Mode = 'sections' | 'matrix' | 'grid';
export interface Frame { id: string; title: string; x: number; y: number; w: number; h: number; css: string; count: number; summary?: string }
export interface Pos { x: number; y: number }
export interface Laid { pos: Record<string, Pos>; frames: Frame[] }
export const CARD_W = 280, GAP = 12, HEAD = 80, PAD = 16;
export const cardH = (c: Card) => (c.kind === 'text' ? 188 : c.kind === 'link' ? 262 : 292);

export function layout(cards: Card[], mode: Mode, prev: Record<string, Pos> = {}, byTheme = false): Laid {
  const pos: Record<string, Pos> = {}; const frames: Frame[] = [];
  const keep = (c: Card, p: Pos) => { pos[c.id] = c.pinned && prev[c.id] ? prev[c.id] : p; };
  if (mode === 'sections') {
    SECTIONS.forEach((s, i) => {
      let list = cards.filter((c) => c.section === s.id).sort((a, b) => a.n - b.n);
      if (byTheme) list = [...list].sort((a, b) => (a.tags[0] ?? '').localeCompare(b.tags[0] ?? ''));
      const x = 40 + i * (CARD_W + PAD * 2 + 28), y = 80; let cy = y + HEAD;
      list = [...list.filter((c) => c.pinned), ...list.filter((c) => !c.pinned)]; // pinned cards lead their section so nothing overlaps them
      list.forEach((c) => { pos[c.id] = { x: x + PAD, y: cy }; cy += cardH(c) + GAP; });
      frames.push({ id: s.id, title: s.title, x, y, w: CARD_W + PAD * 2, h: cy - y - GAP + PAD + (list.length ? 0 : 60), css: s.css, count: list.length, summary: s.summary });
    });
  } else if (mode === 'matrix') {
    const quads = [
      { id: 'q-quick', title: 'Quick wins · high impact, low effort', hi: true, ef: false }, { id: 'q-big', title: 'Big bets · high impact, high effort', hi: true, ef: true },
      { id: 'q-fill', title: 'Fill-ins · low impact, low effort', hi: false, ef: false }, { id: 'q-rethink', title: 'Reconsider · low impact, high effort', hi: false, ef: true },
    ];
    const members = quads.map((q) => cards.filter((c) => (c.impact >= 3) === q.hi && (c.effort >= 3) === q.ef).sort((a, b) => b.impact - a.impact));
    const rows = (n: number) => Math.ceil(n / 2);
    const rowH = (i: number) => { const h = Math.max(...members[i].map(cardH), 0); return h; };
    const qh = (r: number[]) => Math.max(...r.map((i) => HEAD + rows(members[i].length) * (Math.max(rowH(i), 188) + GAP) + PAD), 200);
    const topH = qh([0, 1]), botH = qh([2, 3]); const qw = CARD_W * 2 + GAP + PAD * 2;
    quads.forEach((q, i) => {
      const x = 40 + (i % 2) * (qw + 28), y = 80 + (i < 2 ? 0 : topH + 28);
      members[i].forEach((c, k) => keep(c, { x: x + PAD + (k % 2) * (CARD_W + GAP), y: y + HEAD + Math.floor(k / 2) * (Math.max(rowH(i), 188) + GAP) }));
      frames.push({ id: q.id, title: q.title, x, y, w: qw, h: i < 2 ? topH : botH, css: i === 0 ? 'var(--st-approved)' : i === 1 ? 'var(--sec-platform)' : i === 2 ? 'var(--st-captured)' : 'var(--st-hold)', count: members[i].length });
    });
  } else {
    [...cards].sort((a, b) => b.votes - a.votes).forEach((c, k) => keep(c, { x: 40 + (k % 4) * (CARD_W + 20), y: 80 + Math.floor(k / 4) * 310 }));
  }
  return { pos, frames };
}
export const bounds = (l: Laid, cards: Card[]) => {
  const xs = [...l.frames.flatMap((f) => [f.x, f.x + f.w]), ...cards.flatMap((c) => { const p = l.pos[c.id]; return p ? [p.x, p.x + CARD_W] : []; })];
  const ys = [...l.frames.flatMap((f) => [f.y, f.y + f.h]), ...cards.flatMap((c) => { const p = l.pos[c.id]; return p ? [p.y, p.y + cardH(c)] : []; })];
  return { x0: Math.min(...xs), y0: Math.min(...ys), x1: Math.max(...xs), y1: Math.max(...ys) };
};
