// Pure auto-layout: a hero banner on top, then sections packed into lanes; cards flow (masonry) inside sections.
// No DOM access here so it can be unit-tested.

export const CARD_W = 232;
export const GAP = 14;
export const PAD = 16;
export const HEAD = 58;
export const SLIM = 46;
export const FRAME_GAP = 22;

export const frameWidth = (cols) => PAD * 2 + cols * CARD_W + (cols - 1) * GAP;
export const wideWidth = (cols) => (cols >= 2 ? cols * CARD_W + (cols - 1) * GAP : CARD_W);
export const boardWidth = ({ cols, lanes }) => lanes * frameWidth(cols) + (lanes - 1) * FRAME_GAP;

/** Pick section columns and lane count so that "fit to width" stays comfortably readable. */
export function pickProfile(viewportW) {
  const cols = viewportW < 900 ? 1 : 2;
  const laneW = frameWidth(cols);
  const lanes = Math.max(1, Math.min(5, Math.floor((viewportW - 24) / ((laneW + FRAME_GAP) * 0.8))));
  return { cols, lanes };
}

/**
 * sections: [{id, kind?, collapsed?}]   (kind 'dashboard' is the banner)
 * cardIds:  { [sectionId]: [cardId, ...] } display order
 * heights:  { [cardId | bannerSectionId]: px }
 * wide:     { [cardId]: true } cards that span the full section width
 * returns { frames: {id:{x,y,w,h,slim?}}, cards: {id:{x,y}}, width, height }
 */
export function layout({ sections, cardIds, heights, wide = {}, cols, lanes }) {
  const laneW = frameWidth(cols);
  const width = boardWidth({ cols, lanes });
  const frames = {};
  const cards = {};

  const banner = sections.find((s) => s.kind === 'dashboard');
  let top = 0;
  if (banner) {
    const h = heights[banner.id] ?? 220;
    frames[banner.id] = { x: 0, y: 0, w: width, h };
    top = h + FRAME_GAP;
  }

  // sections with something in them first; empty ones become slim bars at the end
  const real = sections.filter((s) => s.kind !== 'dashboard');
  const filled = real.filter((s) => cardIds[s.id]?.length);
  const empty = real.filter((s) => !cardIds[s.id]?.length);
  const laneY = new Array(lanes).fill(top);

  for (const sec of [...filled, ...empty]) {
    const ids = cardIds[sec.id] || [];
    const rel = {};
    let h;
    if (!ids.length) h = SLIM;
    else if (sec.collapsed) h = HEAD;
    else {
      const colY = new Array(cols).fill(0);
      for (const id of ids) {
        const ch = heights[id] ?? 120;
        if (wide[id] && cols > 1) {
          const y = Math.max(...colY);
          rel[id] = { x: PAD, y: HEAD + y };
          colY.fill(y + ch + GAP);
        } else {
          const c = colY.indexOf(Math.min(...colY));
          rel[id] = { x: PAD + c * (CARD_W + GAP), y: HEAD + colY[c] };
          colY[c] += ch + GAP;
        }
      }
      h = HEAD + Math.max(...colY) - GAP + PAD;
    }
    const lane = laneY.indexOf(Math.min(...laneY));
    const x = lane * (laneW + FRAME_GAP);
    const y = laneY[lane];
    laneY[lane] += h + FRAME_GAP;
    frames[sec.id] = { x, y, w: laneW, h, slim: !ids.length };
    for (const [id, p] of Object.entries(rel)) cards[id] = { x: x + p.x, y: y + p.y };
  }

  return { frames, cards, width, height: Math.max(top, Math.max(...laneY) - FRAME_GAP) };
}

/** Index at which a dragged card should be inserted among `ids` (excluding the dragged one). */
export function insertionIndex(ids, cardPos, heights, px, py) {
  if (!ids.length) return 0;
  let best = 0;
  let bestD = Infinity;
  for (let i = 0; i < ids.length; i++) {
    const p = cardPos[ids[i]];
    if (!p) continue;
    const cx = p.x + CARD_W / 2;
    const cy = p.y + (heights[ids[i]] ?? 120) / 2;
    const d = (cx - px) ** 2 + (cy - py) ** 2;
    if (d < bestD) { bestD = d; best = i; }
  }
  const p = cardPos[ids[best]];
  if (!p) return ids.length;
  const h = heights[ids[best]] ?? 120;
  const dy = py - (p.y + h / 2);
  const dx = px - (p.x + CARD_W / 2);
  const after = dy > h * 0.25 || (Math.abs(dy) <= h * 0.25 && dx > 0);
  return best + (after ? 1 : 0);
}
