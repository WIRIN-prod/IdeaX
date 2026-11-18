import { useEffect, useRef, useState } from 'react';
import { ArrowUpDown, Check, Maximize, Minus, Plus } from 'lucide-react';
import { Card, SECTIONS, STAGES, Stage, secOf } from './data';
import { CARD_W, Frame, Laid, bounds, cardH } from './layout';
import { Avatar, CardView, Mono, StageBadge, cn, rel } from './ui';

export interface View { x: number; y: number; k: number }
export interface Actions { onSelect: (id: string) => void; onVote: (id: string) => void; onPin: (id: string) => void }
interface CommonProps extends Actions { cards: Card[]; selected: string | null; highlight: string[]; match: (c: Card) => boolean }

/* ------------------------------------------------------------------ canvas */
export function Canvas({ cards, laid, view, setView, animating, size, setSize, selected, highlight, match, ...act }: CommonProps & {
  laid: Laid; view: View; setView: (v: View, animate?: boolean) => void; animating: boolean; size: { w: number; h: number }; setSize: (s: { w: number; h: number }) => void;
}) {
  const ref = useRef<HTMLDivElement>(null); const drag = useRef<{ x: number; y: number; vx: number; vy: number } | null>(null);
  useEffect(() => {
    const el = ref.current!; const ro = new ResizeObserver(() => setSize({ w: el.clientWidth, h: el.clientHeight })); ro.observe(el); return () => ro.disconnect();
  }, [setSize]);
  useEffect(() => { // non-passive so ctrl+wheel zoom can prevent the page zoom
    const el = ref.current!;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault(); const r = el.getBoundingClientRect();
      if (e.ctrlKey || e.metaKey) {
        const k = Math.min(2, Math.max(0.25, view.k * Math.exp(-e.deltaY * 0.01))); const px = e.clientX - r.left, py = e.clientY - r.top;
        setView({ k, x: px - ((px - view.x) / view.k) * k, y: py - ((py - view.y) / view.k) * k });
      } else setView({ ...view, x: view.x - e.deltaX, y: view.y - e.deltaY });
    };
    el.addEventListener('wheel', onWheel, { passive: false }); return () => el.removeEventListener('wheel', onWheel);
  }, [view, setView]);
  const b = bounds(laid, cards); const mm = { w: 188, h: 112 }; const ms = Math.min(mm.w / (b.x1 - b.x0 + 80), mm.h / (b.y1 - b.y0 + 80));
  const zoom = (f: number) => setView({ k: Math.min(2, Math.max(0.25, view.k * f)), x: view.x + (size.w / 2 - view.x) * (1 - f), y: view.y + (size.h / 2 - view.y) * (1 - f) }, true);
  const fit = () => { const k = Math.min(1, (size.w - 80) / (b.x1 - b.x0), (size.h - 160) / (b.y1 - b.y0)); setView({ k, x: (size.w - (b.x1 - b.x0) * k) / 2 - b.x0 * k, y: 40 - b.y0 * k + 20 }, true); };
  return (
    <div ref={ref} className="dotgrid relative h-full w-full cursor-grab touch-none overflow-hidden active:cursor-grabbing"
      style={{ backgroundPosition: `${view.x}px ${view.y}px`, backgroundSize: `${22 * view.k}px ${22 * view.k}px` }}
      onPointerDown={(e) => { if ((e.target as HTMLElement).closest('[data-card],button')) return; drag.current = { x: e.clientX, y: e.clientY, vx: view.x, vy: view.y }; (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId); }}
      onPointerMove={(e) => { const d = drag.current; if (d) setView({ ...view, x: d.vx + e.clientX - d.x, y: d.vy + e.clientY - d.y }); }}
      onPointerUp={() => { drag.current = null; }} onClick={() => act.onSelect('')}>
      <div className={cn('absolute left-0 top-0 origin-top-left', animating && 'fx')} style={{ transform: `translate(${view.x}px, ${view.y}px) scale(${view.k})` }}>
        {laid.frames.map((f) => <FrameView key={f.id} f={f} animating={animating} />)}
        {cards.map((c) => { const p = laid.pos[c.id]; if (!p) return null; return (
          <div key={c.id} className="fx absolute left-0 top-0" style={{ transform: `translate(${p.x}px, ${p.y}px)` }}>
            <CardView card={c} selected={selected === c.id} highlight={highlight.includes(c.id)} dim={!match(c)} {...act} />
          </div>); })}
      </div>
      <div className="absolute bottom-4 left-4 hidden rounded-lg border border-line bg-surface/90 p-2 shadow-card backdrop-blur md:block" aria-label="Mini-map">
        <svg width={mm.w} height={mm.h} className="block">
          {laid.frames.map((f) => <rect key={f.id} x={(f.x - b.x0 + 40) * ms} y={(f.y - b.y0 + 40) * ms} width={f.w * ms} height={f.h * ms} rx="2" fill={f.css} opacity=".22" />)}
          {cards.map((c) => { const p = laid.pos[c.id]; return p && <rect key={c.id} x={(p.x - b.x0 + 40) * ms} y={(p.y - b.y0 + 40) * ms} width={CARD_W * ms} height={cardH(c) * ms} fill={selected === c.id ? 'var(--accent)' : 'var(--mute)'} opacity=".5" />; })}
          <rect x={((-view.x / view.k) - b.x0 + 40) * ms} y={((-view.y / view.k) - b.y0 + 40) * ms} width={(size.w / view.k) * ms} height={(size.h / view.k) * ms} fill="none" stroke="var(--accent)" strokeWidth="1.5" />
        </svg>
      </div>
      <div className="absolute bottom-4 right-4 flex items-center gap-0.5 rounded-lg border border-line bg-surface/90 p-1 shadow-card backdrop-blur" role="group" aria-label="Zoom">
        <IconBtn label="Zoom out" onClick={() => zoom(1 / 1.2)}><Minus size={14} /></IconBtn>
        <span className="w-12 text-center font-mono text-xs">{Math.round(view.k * 100)}%</span>
        <IconBtn label="Zoom in" onClick={() => zoom(1.2)}><Plus size={14} /></IconBtn>
        <IconBtn label="Fit to screen" onClick={fit}><Maximize size={14} /></IconBtn>
      </div>
    </div>
  );
}
export const fitView = (laid: Laid, cards: Card[], size: { w: number; h: number }): View => {
  const b = bounds(laid, cards); const k = Math.min(1, (size.w - 80) / (b.x1 - b.x0), (size.h - 160) / (b.y1 - b.y0));
  return { k, x: (size.w - (b.x1 - b.x0) * k) / 2 - b.x0 * k, y: 60 - b.y0 * k };
};
const IconBtn = ({ label, onClick, children }: { label: string; onClick: () => void; children: React.ReactNode }) => (
  <button aria-label={label} title={label} onClick={onClick} className="grid h-7 w-7 place-items-center rounded-md text-mute hover:bg-sunk hover:text-ink">{children}</button>
);
function FrameView({ f, animating }: { f: Frame; animating: boolean }) {
  const [open, setOpen] = useState(true);
  return (
    <section className={cn('tint tint-line absolute left-0 top-0 rounded-xl border', animating && 'fx')} style={{ ['--c' as string]: f.css, transform: `translate(${f.x}px, ${f.y}px)`, width: f.w, height: open ? f.h : 52, borderTop: `3px solid ${f.css}`, overflow: 'hidden' }}>
      <header className="flex h-[52px] items-center gap-2 px-3">
        <button aria-label={open ? 'Collapse section' : 'Expand section'} aria-expanded={open} onClick={() => setOpen(!open)} className="min-w-0 flex-1 truncate text-left text-[13px] font-semibold">{f.title}</button>
        <span className="rounded-full bg-surface px-2 py-0.5 font-mono text-[11px] text-mute">{f.count}</span>
      </header>
      {f.summary && open && <div className="mx-3 -mt-1 w-fit max-w-full truncate rounded-full border border-line bg-surface px-2 py-0.5 text-[11px] text-mute">AI summary · {f.summary}</div>}
    </section>
  );
}

/* ------------------------------------------------------------------ kanban */
export function Kanban({ cards, selected, highlight, match, setStage, ...act }: CommonProps & { setStage: (id: string, s: Stage) => void }) {
  const [over, setOver] = useState<Stage | null>(null);
  const cols = STAGES.filter((s) => s.id !== 'duplicate'); const list = cards.filter(match);
  return (
    <div className="scroll-thin flex h-full gap-4 overflow-x-auto p-4 md:p-6">
      {cols.map((col) => { const items = list.filter((c) => c.stage === col.id || (col.id === 'captured' && c.stage === 'duplicate')); return (
        <section key={col.id} onDragOver={(e) => { e.preventDefault(); setOver(col.id); }} onDragLeave={() => setOver(null)}
          onDrop={(e) => { setOver(null); const id = e.dataTransfer.getData('text/plain'); if (id) setStage(id, col.id); }}
          className={cn('flex w-[312px] shrink-0 flex-col rounded-xl border bg-sunk', over === col.id ? 'border-accent' : 'border-line')} aria-label={col.label}>
          <header className="flex items-center gap-2 px-3 py-3"><span className="h-2 w-2 rounded-full" style={{ background: col.css }} /><h2 className="text-[13px] font-semibold">{col.label}</h2><Mono className="ml-auto">{items.length}</Mono></header>
          <div className="scroll-thin flex flex-1 flex-col gap-3 overflow-y-auto px-3 pb-3">
            {items.map((c) => (
              <div key={c.id} className="group relative">
                <CardView card={c} fixed={false} selected={selected === c.id} highlight={highlight.includes(c.id)} draggable onDragStart={(e) => e.dataTransfer.setData('text/plain', c.id)} {...act} style={{ width: '100%' }} />
                {c.stage !== 'approved' && col.id !== 'approved' && (
                  <button onClick={() => setStage(c.id, 'approved')} className="absolute right-3 top-10 inline-flex items-center gap-1 rounded-md border border-line bg-surface px-2 py-1 text-[11px] font-medium text-[color:var(--st-approved)] opacity-0 shadow-card hover:bg-sunk focus-visible:opacity-100 group-hover:opacity-100"><Check size={12} />Approve</button>
                )}
              </div>))}
            {!items.length && <p className="rounded-lg border border-dashed border-line p-4 text-center text-xs text-mute">Drop a card here to move it to {col.label}.</p>}
          </div>
        </section>); })}
    </div>
  );
}

/* ------------------------------------------------------------------- table */
type SortKey = 'n' | 'title' | 'section' | 'stage' | 'author' | 'votes' | 'dup' | 'updated';
export function Table({ cards, selected, match, onSelect }: CommonProps) {
  const [key, setKey] = useState<SortKey>('votes'); const [dir, setDir] = useState(-1);
  const val = (c: Card) => ({ n: c.n, title: c.title, section: c.section, stage: c.stage, author: c.author, votes: c.votes, dup: c.dupScore ?? 0, updated: c.updated }[key]);
  const rows = cards.filter(match).sort((a, b) => (val(a) > val(b) ? 1 : val(a) < val(b) ? -1 : 0) * dir);
  const head = (k: SortKey, label: string, cls = '') => (
    <th scope="col" aria-sort={key === k ? (dir > 0 ? 'ascending' : 'descending') : 'none'} className={cn('whitespace-nowrap px-3 py-2.5 text-left text-xs font-medium text-mute', cls)}>
      <button onClick={() => { setDir(key === k ? -dir : -1); setKey(k); }} className="inline-flex items-center gap-1 hover:text-ink">{label}<ArrowUpDown size={11} className={key === k ? 'text-accent' : 'opacity-40'} /></button>
    </th>);
  return (
    <div className="scroll-thin h-full overflow-auto p-4 md:p-6">
      <table className="w-full min-w-[860px] border-separate border-spacing-0 overflow-hidden rounded-xl border border-line bg-surface text-[13px]">
        <thead className="sticky top-0 bg-sunk"><tr>{head('n', 'ID')}{head('title', 'Title')}{head('section', 'Section')}{head('stage', 'Stage')}{head('author', 'Author')}{head('votes', 'Votes', 'text-right')}{head('dup', 'AI duplicate score')}{head('updated', 'Last updated')}</tr></thead>
        <tbody>{rows.map((c) => (
          <tr key={c.id} onClick={() => onSelect(c.id)} tabIndex={0} onKeyDown={(e) => e.key === 'Enter' && onSelect(c.id)} aria-selected={selected === c.id}
            className={cn('cursor-pointer border-t border-line hover:bg-sunk', selected === c.id && 'bg-sunk')}>
            <td className="border-t border-line px-3 py-2.5"><Mono>{c.id}</Mono></td>
            <td className="max-w-[360px] truncate border-t border-line px-3 py-2.5 font-medium">{c.title}</td>
            <td className="whitespace-nowrap border-t border-line px-3 py-2.5"><span className="inline-flex items-center gap-1.5"><span className="h-2 w-2 rounded-sm" style={{ background: secOf(c.section).css }} />{secOf(c.section).title}</span></td>
            <td className="border-t border-line px-3 py-2.5"><StageBadge stage={c.stage} /></td>
            <td className="border-t border-line px-3 py-2.5"><Avatar id={c.author} /></td>
            <td className="border-t border-line px-3 py-2.5 text-right font-mono">{c.votes}</td>
            <td className="border-t border-line px-3 py-2.5 font-mono text-xs">{c.dupScore ? <span className="text-[color:var(--st-duplicate)]">{Math.round(c.dupScore * 100)}% → {c.dupOf}</span> : <span className="text-mute">none</span>}</td>
            <td className="whitespace-nowrap border-t border-line px-3 py-2.5 text-xs text-mute">{rel(c.updated)}</td>
          </tr>))}</tbody>
      </table>
    </div>
  );
}

/* -------------------------------------------------------------- mobile list */
export function MobileList({ cards, selected, highlight, match, ...act }: CommonProps) {
  return (
    <div className="flex h-full snap-x snap-mandatory gap-3 overflow-x-auto p-3">
      {SECTIONS.map((s) => (
        <section key={s.id} className="tint tint-line scroll-thin flex w-[88%] shrink-0 snap-center flex-col gap-3 overflow-y-auto rounded-xl border p-3" style={{ ['--c' as string]: s.css, borderTop: `3px solid ${s.css}` }}>
          <h2 className="text-[13px] font-semibold">{s.title} <Mono>{cards.filter((c) => c.section === s.id).length}</Mono></h2>
          {cards.filter((c) => c.section === s.id).map((c) => <CardView key={c.id} card={c} fixed={false} selected={selected === c.id} highlight={highlight.includes(c.id)} dim={!match(c)} style={{ width: '100%' }} {...act} />)}
        </section>))}
    </div>
  );
}
