// Pure auto-layout: sections become frames packed into lanes; cards flow (masonry) inside frames.
// No DOM access here so it can be unit-tested.

export const CARD_W = 232;
export const GAP = 12;
export const PAD = 14;
export const HEAD = 48;
export const FRAME_GAP = 18;
export const EMPTY_BODY = 72;

export const frameWidth = (cols) => PAD * 2 + cols * CARD_W + (cols - 1) * GAP;

/** Pick frame columns and lane count so that "fit to width" stays comfortably readable. */
export function pickProfile(viewportW) {
  const cols = viewportW < 900 ? 1 : 2;
  const laneW = frameWidth(cols);
  const lanes = Math.max(1, Math.min(5, Math.floor((viewportW - 24) / ((laneW + FRAME_GAP) * 0.8))));
  return { cols, lanes };
}

/**
 * sections: [{id, kind?, collapsed?}]
 * cardIds:  { [sectionId]: [cardId, ...] } display order
 * heights:  { [cardId | sectionId(for dashboard)]: px }
 * returns { frames: {id:{x,y,w,h,bodyTop}}, cards: {id:{x,y}}, width, height }
 */
export function layout({ sections, cardIds, heights, cols, lanes }) {
  const laneW = frameWidth(cols);
  const laneY = new Array(lanes).fill(0);
  const frames = {};
  const cards = {};

  for (const sec of sections) {
    const rel = {};
    let bodyH;
    if (sec.kind === 'dashboard') {
      bodyH = heights[sec.id] ?? 280;
    } else if (sec.collapsed) {
      bodyH = 0;
    } else {
      const colY = new Array(cols).fill(0);
      const ids = cardIds[sec.id] || [];
      for (const id of ids) {
        const c = colY.indexOf(Math.min(...colY));
        rel[id] = { x: PAD + c * (CARD_W + GAP), y: HEAD + colY[c] };
        colY[c] += (heights[id] ?? 120) + GAP;
      }
      bodyH = ids.length ? Math.max(...colY) - GAP : EMPTY_BODY;
    }
    const h = sec.collapsed ? HEAD : HEAD + bodyH + PAD;
    const lane = laneY.indexOf(Math.min(...laneY));
    const x = lane * (laneW + FRAME_GAP);
    const y = laneY[lane];
    laneY[lane] += h + FRAME_GAP;
    frames[sec.id] = { x, y, w: laneW, h, bodyTop: HEAD };
    for (const [id, p] of Object.entries(rel)) cards[id] = { x: x + p.x, y: y + p.y };
  }

  return {
    frames,
    cards,
    width: lanes * laneW + (lanes - 1) * FRAME_GAP,
    height: Math.max(0, Math.max(...laneY) - FRAME_GAP),
  };
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
  const h = heights[ids[best]] ?? 120;
  const dy = py - (p.y + h / 2);
  const dx = px - (p.x + CARD_W / 2);
  const after = dy > h * 0.25 || (Math.abs(dy) <= h * 0.25 && dx > 0);
  return best + (after ? 1 : 0);
}
