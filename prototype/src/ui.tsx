import { CSSProperties, ReactNode } from 'react';
import { ArrowBigUp, Image as ImageIcon, Link2, MessageSquare, Pin, Sparkles } from 'lucide-react';
import { Card, Stage, person, stageOf, secOf } from './data';
import { CARD_W, cardH } from './layout';

export const rel = (t: number) => { const m = Math.max(1, Math.round((Date.now() - t) / 60000)); return m < 60 ? `${m}m ago` : m < 1440 ? `${Math.round(m / 60)}h ago` : `${Math.round(m / 1440)}d ago`; };
export const cn = (...a: (string | false | undefined | null)[]) => a.filter(Boolean).join(' ');

export function Avatar({ id, size = 22, ring }: { id: string; size?: number; ring?: boolean }) {
  const p = person(id);
  return (
    <span title={p.name} className={cn('inline-grid shrink-0 place-items-center rounded-full font-semibold text-white', ring && 'ring-2 ring-surface')}
      style={{ width: size, height: size, fontSize: size * 0.4, background: `hsl(${p.hue} 45% 42%)` }}>{p.id}</span>
  );
}
export function StageBadge({ stage }: { stage: Stage }) {
  const s = stageOf(stage);
  return (
    <span className="inline-flex items-center gap-1.5 rounded-md px-1.5 py-0.5 text-[11px] font-medium leading-none"
      style={{ color: s.css, background: `color-mix(in srgb, ${s.css} 12%, transparent)` }}>
      <span className="h-1.5 w-1.5 rounded-full" style={{ background: s.css }} />{s.label}
    </span>
  );
}
export const Mono = ({ children, className }: { children: ReactNode; className?: string }) => <span className={cn('font-mono text-[11px] text-mute', className)}>{children}</span>;

export function Thumb({ card }: { card: Card }) {
  if (card.kind === 'link' && card.link) return (
    <div className="flex items-center gap-2 rounded-md border border-line bg-sunk px-2.5 py-2">
      <Link2 size={14} className="shrink-0 text-mute" />
      <div className="min-w-0"><div className="truncate text-xs font-medium">{card.link.title}</div><Mono>{card.link.domain}</Mono></div>
    </div>
  );
  if (card.kind === 'image' && card.img) return (
    <div className="relative h-[84px] overflow-hidden rounded-md border border-line"
      style={{ background: card.img.src ? undefined : `linear-gradient(135deg, hsl(${card.img.hue} 40% 78%), hsl(${card.img.hue + 40} 45% 62%))` }}>
      {card.img.src ? <img src={card.img.src} alt={card.img.caption} className="h-full w-full object-cover" /> : <ImageIcon className="absolute right-2 top-2 text-white/70" size={16} />}
      <div className="absolute inset-x-0 bottom-0 truncate bg-black/40 px-2 py-1 text-[11px] text-white">{card.img.caption}</div>
    </div>
  );
  return null;
}

interface CardProps {
  card: Card; selected?: boolean; highlight?: boolean; dim?: boolean; style?: CSSProperties; fixed?: boolean;
  onSelect: (id: string) => void; onVote: (id: string) => void; onPin: (id: string) => void; draggable?: boolean;
  onDragStart?: (e: React.DragEvent) => void;
}
export function CardView({ card, selected, highlight, dim, style, fixed = true, onSelect, onVote, onPin, draggable, onDragStart }: CardProps) {
  const st = stageOf(card.stage); const sec = secOf(card.section);
  return (
    <article data-card={card.id} tabIndex={0} draggable={draggable} onDragStart={onDragStart}
      onClick={(e) => { e.stopPropagation(); onSelect(card.id); }} onKeyDown={(e) => e.key === 'Enter' && onSelect(card.id)}
      className={cn('group flex flex-col gap-2 overflow-hidden rounded-lg border bg-surface p-3 text-left shadow-card transition-[opacity,box-shadow] hover:shadow-pop',
        selected ? 'border-accent ring-1 ring-accent' : 'border-line', highlight && 'filed', dim && 'opacity-30')}
      style={{ width: CARD_W, height: fixed ? cardH(card) : undefined, borderLeft: `3px solid ${st.css}`, ...style }}>
      <header className="flex items-center gap-2">
        <Mono>#{card.id}</Mono><StageBadge stage={card.stage} />
        {card.ai && <span title="Filed by the AI agent" className="text-accent"><Sparkles size={12} /></span>}
        <button aria-label={card.pinned ? 'Unpin card' : 'Pin card so Arrange keeps it in place'} aria-pressed={!!card.pinned}
          onClick={(e) => { e.stopPropagation(); onPin(card.id); }}
          className={cn('ml-auto rounded p-1 hover:bg-sunk', card.pinned ? 'text-accent' : 'text-mute opacity-0 group-hover:opacity-100 focus-visible:opacity-100')}><Pin size={13} className={card.pinned ? 'fill-current' : ''} /></button>
      </header>
      <h3 className="line-clamp-2 text-[13.5px] font-semibold leading-snug">{card.title}</h3>
      <p className="line-clamp-3 text-xs leading-relaxed text-mute">{card.body}</p>
      <Thumb card={card} />
      <div className="mt-auto flex flex-wrap gap-1">
        {card.tags.slice(0, 3).map((t) => <span key={t} className="rounded px-1.5 py-0.5 text-[11px]" style={{ color: sec.css, background: `color-mix(in srgb, ${sec.css} 10%, transparent)` }}>{t}</span>)}
      </div>
      <footer className="flex items-center gap-2 border-t border-line pt-2">
        <Avatar id={card.author} size={20} />
        <button onClick={(e) => { e.stopPropagation(); onVote(card.id); }} aria-pressed={!!card.voted} aria-label={`Upvote, ${card.votes} votes`}
          className={cn('ml-auto inline-flex items-center gap-0.5 rounded px-1.5 py-0.5 text-xs font-medium hover:bg-sunk', card.voted ? 'text-accent' : 'text-mute')}><ArrowBigUp size={14} className={card.voted ? 'fill-current' : ''} />{card.votes}</button>
        <span className="inline-flex items-center gap-1 text-xs text-mute"><MessageSquare size={12} />{card.comments.length}</span>
      </footer>
    </article>
  );
}
