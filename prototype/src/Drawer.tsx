import { useEffect, useRef, useState } from 'react';
import { Bot, GitMerge, History, MessageSquare, Send, Sparkles, Undo2, User, X, FileText } from 'lucide-react';
import { Card, Stage, STAGES, person, secOf } from './data';
import { Avatar, Mono, StageBadge, cn, rel } from './ui';

export interface Entry { id: number; t: number; actor: 'human' | 'ai' | 'system'; who?: string; text: string; restore?: () => void }
export interface Msg { role: 'user' | 'ai'; text: string; cites?: string[] }
export type Tab = 'copilot' | 'card' | 'journal';

export function answer(q: string, cards: Card[]): Msg {
  const s = q.toLowerCase(); const top = (l: Card[], n = 3) => [...l].sort((a, b) => b.votes - a.votes).slice(0, n);
  if (/dup|similar|overlap/.test(s)) {
    const d = cards.filter((c) => c.dupOf);
    return d.length ? { role: 'ai', text: `${d.length} idea${d.length > 1 ? 's overlap' : ' overlaps'} with existing work. Open the card and choose Merge cards to combine votes and comments.`, cites: d.flatMap((c) => [c.id, c.dupOf!]) } : { role: 'ai', text: 'No duplicate ideas found on this board.' };
  }
  if (/pain|customer|churn|onboard/.test(s)) {
    const l = top(cards.filter((c) => c.section === 'customer'));
    return { role: 'ai', text: `Customer pain clusters around onboarding and trial activation. The most supported idea is “${l[0].title}” with ${l[0].votes} votes.`, cites: l.map((c) => c.id) };
  }
  if (/approved|decid|ship/.test(s)) { const l = cards.filter((c) => c.stage === 'approved'); return { role: 'ai', text: `${l.length} ideas are approved. Together they cover SSO setup, advisory sessions and a customer story.`, cites: l.map((c) => c.id) }; }
  if (/quick|win|easy|effort/.test(s)) { const l = top(cards.filter((c) => c.impact >= 4 && c.effort <= 2)); return { role: 'ai', text: 'These have high impact for low effort. Start with the first one.', cites: l.map((c) => c.id) }; }
  const review = cards.filter((c) => c.stage === 'review');
  return { role: 'ai', text: `The board has ${cards.length} ideas. ${review.length} are waiting for review, led by the ones below. Try “Summarize top customer pain points” or “Find duplicate ideas”.`, cites: top(review).map((c) => c.id) };
}
const SUGGEST = ['Summarize top customer pain points', 'Find duplicate ideas', 'What are the quick wins?'];

function Cites({ ids, onCite }: { ids: string[]; onCite: (id: string) => void }) {
  return <span className="mt-1.5 flex flex-wrap gap-1">{[...new Set(ids)].map((id) => <button key={id} onClick={() => onCite(id)} className="rounded border border-line bg-surface px-1.5 py-0.5 font-mono text-[11px] text-accent hover:bg-sunk">#{id}</button>)}</span>;
}

interface Props {
  tab: Tab; setTab: (t: Tab) => void; onClose: () => void; cards: Card[]; card?: Card; journal: Entry[]; msgs: Msg[]; ask: (q: string) => void; thinking: boolean;
  onCite: (id: string) => void; setStage: (id: string, s: Stage) => void; patch: (id: string, p: Partial<Card>) => void; merge: (id: string) => void; comment: (id: string, text: string) => void;
}
export function Drawer(p: Props) {
  const tabs: { id: Tab; label: string; icon: React.ReactNode }[] = [{ id: 'copilot', label: 'Copilot', icon: <Sparkles size={14} /> }, { id: 'card', label: 'Card', icon: <FileText size={14} /> }, { id: 'journal', label: 'Audit Journal', icon: <History size={14} /> }];
  return (
    <aside className="flex h-full w-full flex-col border-l border-line bg-surface" aria-label="Copilot and inspector">
      <div className="flex h-12 shrink-0 items-center gap-1 border-b border-line px-2" role="tablist">
        {tabs.map((t) => <button key={t.id} role="tab" aria-selected={p.tab === t.id} onClick={() => p.setTab(t.id)} className={cn('inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-[13px] font-medium', p.tab === t.id ? 'bg-sunk text-ink' : 'text-mute hover:text-ink')}>{t.icon}{t.label}</button>)}
        <button aria-label="Close panel (Esc)" onClick={p.onClose} className="ml-auto rounded-md p-1.5 text-mute hover:bg-sunk"><X size={16} /></button>
      </div>
      {p.tab === 'copilot' && <Copilot {...p} />}
      {p.tab === 'card' && (p.card ? <Inspector {...p} card={p.card} /> : <Empty icon={<FileText />} title="No card selected" text="Select a card on the board to review its details, change its stage or discuss it with the team." />)}
      {p.tab === 'journal' && <Journal entries={p.journal} />}
    </aside>
  );
}
const Empty = ({ icon, title, text }: { icon: React.ReactNode; title: string; text: string }) => <div className="grid flex-1 place-items-center p-8 text-center"><div><div className="mx-auto mb-3 grid h-10 w-10 place-items-center rounded-full bg-sunk text-mute">{icon}</div><div className="font-medium">{title}</div><p className="mt-1 text-xs text-mute">{text}</p></div></div>;

function Copilot({ msgs, ask, thinking, onCite }: Props) {
  const [q, setQ] = useState(''); const end = useRef<HTMLDivElement>(null);
  useEffect(() => end.current?.scrollIntoView({ block: 'end' }), [msgs, thinking]);
  const send = (t: string) => { if (t.trim()) { ask(t.trim()); setQ(''); } };
  return (
    <>
      <div className="scroll-thin flex-1 space-y-4 overflow-y-auto p-4" aria-live="polite">
        {!msgs.length && <div className="space-y-2"><p className="text-[13px] text-mute">Ask about anything on this board. Answers link to the cards they come from.</p>{SUGGEST.map((s) => <button key={s} onClick={() => send(s)} className="block w-full rounded-lg border border-line px-3 py-2 text-left text-[13px] hover:bg-sunk">{s}</button>)}</div>}
        {msgs.map((m, i) => (
          <div key={i} className={cn('rise flex gap-2', m.role === 'user' && 'flex-row-reverse')}>
            <span className={cn('grid h-6 w-6 shrink-0 place-items-center rounded-full', m.role === 'ai' ? 'bg-accent text-accent-ink' : 'bg-sunk text-mute')}>{m.role === 'ai' ? <Bot size={13} /> : <User size={13} />}</span>
            <div className={cn('max-w-[85%] rounded-xl px-3 py-2 text-[13px] leading-relaxed', m.role === 'ai' ? 'bg-sunk' : 'bg-accent text-accent-ink')}>{m.text}{m.cites && <Cites ids={m.cites} onCite={onCite} />}</div>
          </div>))}
        {thinking && <div className="flex gap-2"><span className="grid h-6 w-6 place-items-center rounded-full bg-accent text-accent-ink"><Bot size={13} /></span><div className="sweep h-8 w-28 rounded-xl bg-sunk" /></div>}
        <div ref={end} />
      </div>
      <form onSubmit={(e) => { e.preventDefault(); send(q); }} className="flex gap-2 border-t border-line p-3">
        <input value={q} onChange={(e) => setQ(e.target.value)} aria-label="Ask the board copilot" placeholder="Ask about this board…" className="min-w-0 flex-1 rounded-lg border border-line bg-canvas px-3 py-2 text-[13px] outline-none focus:border-accent" />
        <button aria-label="Send question" className="grid h-9 w-9 place-items-center rounded-lg bg-accent text-accent-ink"><Send size={15} /></button>
      </form>
    </>
  );
}

function Inspector({ card, setStage, patch, merge, comment, cards, onCite }: Props & { card: Card }) {
  const [txt, setTxt] = useState(''); const sec = secOf(card.section); const orig = cards.find((c) => c.id === card.dupOf);
  const flow = STAGES.filter((s) => s.id !== 'duplicate');
  return (
    <div className="scroll-thin flex-1 space-y-5 overflow-y-auto p-4">
      <div><div className="mb-2 flex items-center gap-2"><Mono>#{card.id}</Mono><StageBadge stage={card.stage} /><span className="ml-auto text-xs text-mute">{rel(card.updated)}</span></div>
        <h2 className="text-base font-semibold leading-snug">{card.title}</h2><p className="mt-2 text-[13px] leading-relaxed text-mute">{card.body}</p>
        {card.link && <div className="mt-3 rounded-lg border border-line bg-sunk px-3 py-2 text-xs"><div className="font-medium">{card.link.title}</div><Mono>{card.link.domain}</Mono></div>}
        {card.img && <div className="mt-3 h-32 overflow-hidden rounded-lg border border-line" style={{ background: card.img.src ? undefined : `linear-gradient(135deg, hsl(${card.img.hue} 40% 78%), hsl(${card.img.hue + 40} 45% 62%))` }}>{card.img.src && <img src={card.img.src} alt={card.img.caption} className="h-full w-full object-cover" />}</div>}
        <div className="mt-3 flex items-center gap-2 text-xs text-mute"><Avatar id={card.author} />{person(card.author).name}<span>·</span><span className="inline-flex items-center gap-1"><span className="h-2 w-2 rounded-sm" style={{ background: sec.css }} />{sec.title}</span></div></div>
      {orig && card.dupScore && (
        <div className="rounded-lg border p-3" style={{ borderColor: 'color-mix(in srgb, var(--st-duplicate) 40%, var(--line))', background: 'color-mix(in srgb, var(--st-duplicate) 7%, transparent)' }}>
          <div className="text-[13px] font-medium text-[color:var(--st-duplicate)]">Possible duplicate</div>
          <p className="mt-1 text-xs text-mute"><span className="font-mono">{Math.round(card.dupScore * 100)}%</span> similar to <button onClick={() => onCite(orig.id)} className="font-mono text-accent underline">#{orig.id}</button> “{orig.title}”.</p>
          <button onClick={() => merge(card.id)} className="mt-2 inline-flex items-center gap-1.5 rounded-md bg-[color:var(--st-duplicate)] px-2.5 py-1.5 text-xs font-medium text-white"><GitMerge size={13} />Merge cards</button>
        </div>)}
      <section><h3 className="mb-2 text-xs font-medium text-mute">Decision stage</h3>
        <div className="grid grid-cols-2 gap-1.5">{flow.map((s) => <button key={s.id} onClick={() => setStage(card.id, s.id)} aria-pressed={card.stage === s.id} className={cn('rounded-md border px-2 py-1.5 text-xs font-medium', card.stage === s.id ? 'border-transparent text-white' : 'border-line hover:bg-sunk')} style={card.stage === s.id ? { background: s.css } : { color: s.css }}>{s.label}</button>)}</div></section>
      <section className="space-y-3"><h3 className="text-xs font-medium text-mute">Prioritisation</h3>
        {(['impact', 'effort'] as const).map((k) => <label key={k} className="block text-xs"><span className="mb-1 flex justify-between capitalize"><span>{k}</span><span className="font-mono">{card[k]} / 5</span></span><input type="range" min={1} max={5} value={card[k]} onChange={(e) => patch(card.id, { [k]: +e.target.value })} className="w-full accent-[color:var(--accent)]" /></label>)}</section>
      <section><h3 className="mb-2 flex items-center gap-1.5 text-xs font-medium text-mute"><MessageSquare size={12} />Comments · {card.comments.length}</h3>
        <ul className="space-y-3">{card.comments.map((m, i) => <li key={i} className="flex gap-2"><Avatar id={m.author} /><div><div className="text-xs"><span className="font-medium">{person(m.author).name}</span> <span className="text-mute">{rel(m.t)}</span></div><p className="text-[13px]">{m.text}</p></div></li>)}</ul>
        <form onSubmit={(e) => { e.preventDefault(); if (txt.trim()) { comment(card.id, txt.trim()); setTxt(''); } }} className="mt-3 flex gap-2">
          <input value={txt} onChange={(e) => setTxt(e.target.value)} aria-label="Add a comment" placeholder="Add a comment…" className="min-w-0 flex-1 rounded-lg border border-line bg-canvas px-3 py-2 text-[13px] outline-none focus:border-accent" />
          <button className="rounded-lg border border-line px-3 text-[13px] font-medium hover:bg-sunk">Post</button></form></section>
    </div>
  );
}

function Journal({ entries }: { entries: Entry[] }) {
  return (
    <ol className="scroll-thin flex-1 space-y-0 overflow-y-auto p-4">
      {entries.map((e) => (
        <li key={e.id} className="relative border-l border-line pb-5 pl-4">
          <span className="absolute -left-[5px] top-1 h-2.5 w-2.5 rounded-full border-2 border-surface" style={{ background: e.actor === 'ai' ? 'var(--accent)' : 'var(--mute)' }} />
          <div className="mb-1 flex items-center gap-2">
            {e.actor === 'ai' ? <span className="rounded bg-accent px-1.5 py-0.5 text-[10px] font-semibold text-accent-ink">AI Agent</span> : <span className="text-xs font-medium">{e.who ?? 'System'}</span>}
            <Mono>{rel(e.t)}</Mono>
          </div>
          <p className="text-[13px]">{e.text}</p>
          {e.restore && <button onClick={e.restore} className="mt-1.5 inline-flex items-center gap-1 text-xs font-medium text-accent hover:underline"><Undo2 size={12} />Restore this state</button>}
        </li>))}
    </ol>
  );
}
