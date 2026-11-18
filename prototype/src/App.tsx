import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Building2, ChevronDown, Columns3, History, LayoutGrid, Moon, PanelRight, Sparkles, Sun, Table2, Undo2, WifiOff, Rows3, Grid2x2, Network } from 'lucide-react';
import { Card, ME, PEOPLE, SECTIONS, SEED, STAGES, Stage, idOf, secOf, stageOf } from './data';
import { CARD_W, Laid, Mode, cardH, layout } from './layout';
import { Avatar, cn } from './ui';
import { Canvas, Kanban, MobileList, Table, View, fitView } from './views';
import { Drawer, Entry, Msg, Tab, answer } from './Drawer';
import { Capture, Dock, URL_RE } from './Dock';

type ViewMode = 'canvas' | 'kanban' | 'table' | 'list';
type Filter = 'all' | 'mine' | 'review' | 'ai';
interface Snap { cards: Card[]; mode: Mode; theme: boolean; laid: Laid }
const FILTERS: { id: Filter; label: string }[] = [{ id: 'all', label: 'All' }, { id: 'mine', label: 'My Ideas' }, { id: 'review', label: 'Needs Review' }, { id: 'ai', label: 'AI Suggested' }];
const route = (s: string) => { const l = s.toLowerCase(); const sc = SECTIONS.map((x) => ({ id: x.id, n: x.words.filter((w) => l.includes(w)) })); sc.sort((a, b) => b.n.length - a.n.length); return { section: sc[0].n.length ? sc[0].id : 'customer', hits: sc[0].n }; };
const words = (s: string) => new Set(s.toLowerCase().split(/\W+/).filter((w) => w.length > 3));
const similarity = (a: string, b: string) => { const x = words(a), y = words(b); const i = [...x].filter((w) => y.has(w)).length; return i / (x.size + y.size - i || 1); };
const useMedia = (q: string) => { const [m, setM] = useState(() => matchMedia(q).matches); useEffect(() => { const l = matchMedia(q); const f = () => setM(l.matches); l.addEventListener('change', f); return () => l.removeEventListener('change', f); }, [q]); return m; };

export default function App() {
  const mobile = useMedia('(max-width: 767px)'); const wide = useMedia('(min-width: 1280px)');
  const [dark, setDark] = useState(() => { try { return localStorage.getItem('ix-theme') === 'dark'; } catch { return false; } });
  useEffect(() => { document.documentElement.dataset.theme = dark ? 'dark' : 'light'; try { localStorage.setItem('ix-theme', dark ? 'dark' : 'light'); } catch { /* storage blocked */ } }, [dark]);
  const [cards, setCards] = useState<Card[]>(SEED);
  const [mode, setMode] = useState<Mode>('sections'); const [byTheme, setByTheme] = useState(false);
  const [laid, setLaid] = useState<Laid>(() => layout(SEED, 'sections'));
  const [viewMode, setViewMode] = useState<ViewMode>(() => (matchMedia('(max-width: 767px)').matches ? 'list' : 'canvas'));
  const [filter, setFilter] = useState<Filter>('all');
  const [selected, setSelected] = useState<string | null>(null); const [highlight, setHighlight] = useState<string[]>([]);
  const [drawer, setDrawer] = useState(false); const [tab, setTab] = useState<Tab>('copilot');
  const [journal, setJournal] = useState<Entry[]>([{ id: 1, t: Date.now() - 86400000, actor: 'system', text: 'Board created from the Q4 planning workshop.' }]);
  const [msgs, setMsgs] = useState<Msg[]>([]); const [thinking, setThinking] = useState(false);
  const [offline, setOffline] = useState(false); const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState<{ text: string; undo?: () => void } | null>(null);
  const [menu, setMenu] = useState<null | 'arrange' | 'workspace'>(null);
  const [view, setViewRaw] = useState<View>({ x: 0, y: 0, k: 1 }); const [animating, setAnimating] = useState(false); const [size, setSize] = useState({ w: 0, h: 0 });
  const fitted = useRef(false); const inputRef = useRef<HTMLInputElement>(null); const jid = useRef(10); const timers = useRef<number[]>([]);
  const later = (fn: () => void, ms: number) => { timers.current.push(window.setTimeout(fn, ms)); };
  useEffect(() => () => timers.current.forEach(clearTimeout), []);

  const setView = useCallback((v: View, animate = false) => { setAnimating(animate); setViewRaw(v); if (animate) { later(() => setAnimating(false), 650); } }, []);
  useEffect(() => { if (viewMode === 'canvas') fitted.current = false; }, [viewMode]);
  useEffect(() => { if (viewMode === 'canvas' && size.w > 0 && !fitted.current) { fitted.current = true; setViewRaw(fitView(laid, cards, size)); } }, [size, viewMode, laid, cards]);

  const match = useCallback((c: Card) => filter === 'all' || (filter === 'mine' && c.author === ME) || (filter === 'review' && (c.stage === 'review' || c.stage === 'captured')) || (filter === 'ai' && !!c.ai), [filter]);
  const log = (actor: Entry['actor'], text: string, who?: string, snap?: Snap) => setJournal((j) => [{ id: jid.current++, t: Date.now(), actor, who, text, restore: snap ? () => applySnap(snap, 'Restored a previous board state') : undefined }, ...j]);
  const snap = (): Snap => ({ cards, mode, theme: byTheme, laid });
  const applySnap = (s: Snap, msg: string) => { setCards(s.cards); setMode(s.mode); setByTheme(s.theme); setAnimating(true); setLaid(s.laid); later(() => setAnimating(false), 650); log('human', msg, 'Alex Morgan'); setToast(null); };
  const flash = (ids: string[], ms = 3600) => { setHighlight(ids); later(() => setHighlight([]), ms); };
  const showToast = (t: { text: string; undo?: () => void }) => { setToast(t); later(() => setToast(null), 9000); };

  const panTo = (id: string, p = laid.pos[id]) => { if (!p) return; const k = Math.max(view.k, 0.8); setView({ k, x: size.w / 2 - (p.x + CARD_W / 2) * k, y: size.h / 2 - (p.y + 120) * k }, true); };
  const cite = (id: string) => { setSelected(id); flash([id], 2800); if (viewMode !== 'canvas') { setViewMode('canvas'); later(() => panTo(id), 120); } else panTo(id); if (mobile) setDrawer(false); };
  const select = (id: string) => { if (!id) { setSelected(null); return; } setSelected(id); setTab('card'); setDrawer(true); };

  const update = (id: string, patch: Partial<Card>, entry?: string) => {
    const next = cards.map((c) => (c.id === id ? { ...c, ...patch, updated: Date.now() } : c)); setCards(next);
    if (mode === 'matrix' && ('impact' in patch || 'effort' in patch)) { setAnimating(true); setLaid(layout(next, mode, laid.pos, byTheme)); later(() => setAnimating(false), 650); }
    if (entry) log('human', entry, 'Alex Morgan');
  };
  const vote = (id: string) => setCards((cs) => cs.map((c) => (c.id === id ? { ...c, voted: !c.voted, votes: c.votes + (c.voted ? -1 : 1) } : c)));
  const pin = (id: string) => setCards((cs) => cs.map((c) => (c.id === id ? { ...c, pinned: !c.pinned } : c)));
  const setStage = (id: string, s: Stage) => { const c = cards.find((x) => x.id === id); if (c && c.stage !== s) update(id, { stage: s }, `Moved #${id} from ${stageOf(c.stage).label} to ${stageOf(s).label}.`); };
  const comment = (id: string, text: string) => { setCards((cs) => cs.map((c) => (c.id === id ? { ...c, comments: [...c.comments, { author: ME, text, t: Date.now() }] } : c))); log('human', `Commented on #${id}.`, 'Alex Morgan'); };
  const merge = (id: string) => {
    const dup = cards.find((c) => c.id === id); if (!dup?.dupOf) return; const s = snap();
    const next = cards.filter((c) => c.id !== id).map((c) => (c.id === dup.dupOf ? { ...c, votes: c.votes + dup.votes, comments: [...c.comments, ...dup.comments], updated: Date.now() } : c));
    setCards(next); setAnimating(true); setLaid(layout(next, mode, laid.pos, byTheme)); later(() => setAnimating(false), 650); setSelected(dup.dupOf); flash([dup.dupOf]);
    log('human', `Merged #${id} into #${dup.dupOf}. Votes and comments were combined.`, 'Alex Morgan', s); showToast({ text: `Merged #${id} into #${dup.dupOf}`, undo: () => applySnap(s, `Undid the merge of #${id}`) });
  };

  const arrange = (kind: 'cluster' | 'matrix' | 'grid') => {
    setMenu(null); const s = snap(); const m: Mode = kind === 'cluster' ? 'sections' : kind; const th = kind === 'cluster'; const label = { cluster: 'Cluster by theme', matrix: 'Impact vs effort matrix', grid: 'Tidy grid' }[kind];
    const nl = layout(cards, m, laid.pos, th); setViewMode('canvas'); setMode(m); setByTheme(th); setAnimating(true); setLaid(nl);
    later(() => { setView(fitView(nl, cards, size), true); }, 80); later(() => setAnimating(false), 800);
    const pinned = cards.filter((c) => c.pinned).length;
    log('ai', `${label}: arranged ${cards.length - pinned} cards${pinned ? `, left ${pinned} pinned in place` : ''}.`, undefined, s);
    showToast({ text: `Board arranged · ${label}`, undo: () => applySnap(s, `Undid ${label.toLowerCase()}`) });
  };

  const addIdea = (cap: Capture) => {
    setBusy(true); const ai = !offline;
    later(() => {
      const url = cap.text.match(URL_RE)?.[0]; let domain = ''; try { domain = url ? new URL(url).hostname.replace(/^www\./, '') : ''; } catch { domain = url ?? ''; }
      const clean = cap.text.replace(URL_RE, '').trim(); const first = (clean.split(/(?<=[.!?])\s/)[0] || domain || cap.img?.name || 'New idea').slice(0, 90);
      const r = route(cap.text + ' ' + (cap.img?.name ?? '')); const section = cap.section ?? r.section;
      const sim = cards.map((c) => ({ c, s: similarity(first, c.title) })).sort((a, b) => b.s - a.s)[0]; const dup = !cap.stage && sim && sim.s >= 0.34 ? sim : undefined;
      const n = Math.max(...cards.map((c) => c.n)) + 1; const s = snap();
      const card: Card = { id: idOf(n), n, title: first.charAt(0).toUpperCase() + first.slice(1), body: clean.slice(first.length).trim() || (url ? `Saved from ${domain}.` : cap.img ? 'Image captured for review.' : 'Captured from the board.'),
        section, stage: dup ? 'duplicate' : cap.stage ?? 'captured', kind: cap.img ? 'image' : url ? 'link' : 'text', author: ME, votes: 1, voted: true, comments: [], tags: r.hits.slice(0, 2).length ? r.hits.slice(0, 2) : ['new'],
        link: url ? { domain, title: clean || `Link from ${domain}` } : undefined, img: cap.img ? { hue: 220, src: cap.img.src, caption: cap.img.name } : undefined,
        impact: 3, effort: 3, updated: Date.now(), ai, dupOf: dup?.c.id, dupScore: dup ? Math.min(0.97, 0.5 + dup.s) : undefined };
      const next = [...cards, card]; setCards(next); setLaid(layout(next, mode, laid.pos, byTheme)); setBusy(false); flash([card.id]);
      const where = secOf(section).title;
      log(ai ? 'ai' : 'system', ai ? `Filed #${card.id} in ${where}${dup ? `, flagged as ${Math.round(card.dupScore! * 100)}% similar to #${dup.c.id}` : ''}.` : `Saved #${card.id} in ${where} using keyword routing.`, undefined, s);
      showToast({ text: `${ai ? 'Filed' : 'Saved'} #${card.id} in ${where}`, undo: () => applySnap(s, `Removed #${card.id}`) });
      if (viewMode === 'canvas') later(() => { const p = layout(next, mode, laid.pos, byTheme).pos[card.id]; if (p && (p.x + view.x < 0 || p.x * view.k + view.x > size.w || p.y * view.k + view.y > size.h)) panTo(card.id, p); }, 100);
    }, 900);
  };

  const ask = (q: string) => {
    setMsgs((m) => [...m, { role: 'user', text: q }]); setThinking(true);
    later(() => { setMsgs((m) => [...m, offline ? { role: 'ai', text: 'The AI proxy is offline, so Copilot can’t answer right now. Ideas are still being saved and filed by keyword.' } : answer(q, cards)]); setThinking(false); }, 800);
  };

  useEffect(() => { // keyboard: N or / focus capture, A arrange menu, Esc close, arrows move between cards
    const h = (e: KeyboardEvent) => {
      const typing = /INPUT|TEXTAREA|SELECT/.test((e.target as HTMLElement).tagName);
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); inputRef.current?.focus(); return; }
      if (e.key === 'Escape') { setMenu(null); if (typing) (e.target as HTMLElement).blur(); else if (drawer) setDrawer(false); else setSelected(null); return; }
      if (typing || e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key === 'n' || e.key === '/') { e.preventDefault(); inputRef.current?.focus(); }
      else if (e.key === 'a') { e.preventDefault(); setMenu('arrange'); }
      else if (e.key.startsWith('Arrow')) {
        const order = SECTIONS.flatMap((s) => cards.filter((c) => c.section === s.id && match(c)).sort((a, b) => a.n - b.n)); if (!order.length) return;
        const i = order.findIndex((c) => c.id === selected); const nx = order[(i + (e.key === 'ArrowLeft' || e.key === 'ArrowUp' ? -1 : 1) + order.length) % order.length];
        e.preventDefault(); setSelected(nx.id); if (viewMode === 'canvas') panTo(nx.id);
      }
    };
    window.addEventListener('keydown', h); return () => window.removeEventListener('keydown', h);
  });

  const common = { cards, selected, highlight, match, onSelect: select, onVote: vote, onPin: pin };
  const selCard = cards.find((c) => c.id === selected);
  const VIEWS: { id: ViewMode; label: string; icon: React.ReactNode }[] = [{ id: 'canvas', label: 'Spatial Canvas', icon: <LayoutGrid size={14} /> }, { id: 'kanban', label: 'Stage Kanban', icon: <Columns3 size={14} /> }, { id: 'table', label: 'Executive Table', icon: <Table2 size={14} /> }];
  if (mobile) VIEWS.unshift({ id: 'list', label: 'List', icon: <Rows3 size={14} /> });
  const seg = (
    <div role="tablist" aria-label="View" className="flex shrink-0 rounded-lg border border-line bg-sunk p-0.5">
      {VIEWS.map((v) => <button key={v.id} role="tab" aria-selected={viewMode === v.id} onClick={() => setViewMode(v.id)} className={cn('inline-flex items-center gap-1.5 whitespace-nowrap rounded-md px-2.5 py-1.5 text-[13px] font-medium', viewMode === v.id ? 'bg-surface text-ink shadow-card' : 'text-mute hover:text-ink')}>{v.icon}{(!mobile || viewMode === v.id) && v.label}</button>)}
    </div>);
  const pills = wide ? (
    <div role="group" aria-label="Filter" className="flex items-center gap-1">{FILTERS.map((f) => <button key={f.id} aria-pressed={filter === f.id} onClick={() => setFilter(f.id)} className={cn('whitespace-nowrap rounded-full border px-2.5 py-1 text-xs font-medium', filter === f.id ? 'border-transparent bg-ink text-canvas' : 'border-line text-mute hover:text-ink')}>{f.label}</button>)}</div>
  ) : <select aria-label="Filter" value={filter} onChange={(e) => setFilter(e.target.value as Filter)} className="rounded-lg border border-line bg-surface px-2 py-1.5 text-xs">{FILTERS.map((f) => <option key={f.id} value={f.id}>{f.label}</option>)}</select>;

  const arrangeBtn = (
    <div className="relative">
      <div className="flex">
        <button onClick={() => arrange('cluster')} className="inline-flex h-8 items-center gap-1.5 whitespace-nowrap rounded-l-lg bg-accent px-3 text-[13px] font-medium text-accent-ink hover:opacity-90"><Sparkles size={14} />{!mobile && 'Arrange Board'}</button>
        <button aria-label="Arrange options (A)" aria-expanded={menu === 'arrange'} onClick={() => setMenu(menu === 'arrange' ? null : 'arrange')} className="grid h-8 w-7 place-items-center rounded-r-lg border-l border-white/25 bg-accent text-accent-ink hover:opacity-90"><ChevronDown size={14} /></button>
      </div>
      {menu === 'arrange' && (
        <div role="menu" className="absolute right-0 top-10 z-50 w-64 rounded-xl border border-line bg-surface p-1 shadow-pop">
          {[{ k: 'cluster', icon: <Network size={14} />, t: 'Cluster by theme', d: 'Group related ideas within each section' }, { k: 'matrix', icon: <Grid2x2 size={14} />, t: 'Impact vs effort matrix', d: 'Plot ideas on a prioritisation grid' }, { k: 'grid', icon: <LayoutGrid size={14} />, t: 'Tidy grid', d: 'Even grid, most supported first' }].map((o) => (
            <button key={o.k} role="menuitem" onClick={() => arrange(o.k as 'cluster')} className="flex w-full items-start gap-2.5 rounded-lg px-2.5 py-2 text-left hover:bg-sunk"><span className="mt-0.5 text-accent">{o.icon}</span><span><span className="block text-[13px] font-medium">{o.t}</span><span className="block text-xs text-mute">{o.d}</span></span></button>))}
          <p className="px-2.5 py-1.5 text-[11px] text-mute">Pinned cards stay where they are.</p>
        </div>)}
    </div>);

  return (
    <div className="flex h-dvh flex-col bg-canvas" onClick={() => menu && setMenu(null)}>
      <header className="shrink-0 border-b border-line bg-surface">
        <div className="flex h-14 items-center gap-3 px-3 md:px-4">
          <div className="relative min-w-0">
            <button onClick={(e) => { e.stopPropagation(); setMenu(menu === 'workspace' ? null : 'workspace'); }} aria-expanded={menu === 'workspace'} className="flex items-center gap-2 rounded-lg px-1.5 py-1 hover:bg-sunk">
              <span className="grid h-7 w-7 place-items-center rounded-md bg-accent text-accent-ink"><Building2 size={15} /></span>
              {!mobile && <span className="text-left leading-tight whitespace-nowrap"><span className="block text-xs text-mute">Acme Corp</span><span className="block text-[13px] font-semibold">Q4 Product Strategy</span></span>}
              <ChevronDown size={14} className="text-mute" />
            </button>
            {menu === 'workspace' && <div className="absolute left-0 top-11 z-50 w-60 rounded-xl border border-line bg-surface p-1 shadow-pop">{['Acme Corp / Q4 Product Strategy', 'Acme Corp / Platform Roadmap', 'Acme Labs / Innovation Intake'].map((w, i) => <button key={w} className={cn('block w-full rounded-lg px-2.5 py-2 text-left text-[13px] hover:bg-sunk', i === 0 && 'font-semibold')}>{w}</button>)}</div>}
          </div>
          <button onClick={() => setOffline(!offline)} title="Click to simulate the AI proxy going offline" className={cn('inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border px-2.5 py-1 text-xs font-medium', offline ? 'border-[color:var(--st-review)] text-[color:var(--st-review)]' : 'border-line text-mute')}
            style={offline ? { background: 'color-mix(in srgb, var(--st-review) 10%, transparent)' } : undefined}>
            {offline ? <><WifiOff size={12} />{mobile ? 'AI offline' : 'AI Proxy Offline — Saving with Keyword Routing'}</> : <><span className="h-1.5 w-1.5 rounded-full bg-[color:var(--st-approved)]" />Synced</>}
          </button>
          {!mobile && <div className="hidden items-center -space-x-1.5 2xl:flex" aria-label="Online collaborators">{PEOPLE.map((p, i) => <span key={p.id} className={cn('rounded-full', i < 3 ? 'ring-2 ring-[color:var(--st-approved)]' : 'opacity-60 ring-2 ring-line')}><Avatar id={p.id} size={24} ring /></span>)}</div>}
          {!mobile && <div className="mx-auto flex min-w-0 shrink-0 items-center gap-3">{seg}{pills}</div>}
          <div className={cn('flex items-center gap-1.5', mobile && 'ml-auto')}>
            {arrangeBtn}
            <button aria-label="Audit journal" onClick={() => { setTab('journal'); setDrawer(true); }} className="grid h-8 w-8 place-items-center rounded-lg text-mute hover:bg-sunk"><History size={16} /></button>
            <button aria-label="Toggle copilot panel" aria-pressed={drawer} onClick={() => setDrawer(!drawer)} className={cn('grid h-8 w-8 place-items-center rounded-lg hover:bg-sunk', drawer ? 'text-accent' : 'text-mute')}><PanelRight size={16} /></button>
            <button aria-label={dark ? 'Switch to light theme' : 'Switch to dark theme'} onClick={() => setDark(!dark)} className="grid h-8 w-8 place-items-center rounded-lg text-mute hover:bg-sunk">{dark ? <Sun size={16} /> : <Moon size={16} />}</button>
            {!mobile && <span className="ml-1 hidden items-center gap-1.5 whitespace-nowrap rounded-full border border-line py-0.5 pl-0.5 pr-2.5 text-xs font-medium xl:inline-flex"><Avatar id={ME} size={22} />Moderator</span>}
          </div>
        </div>
        {mobile && <div className="scroll-thin flex items-center gap-2 overflow-x-auto px-3 pb-2">{seg}{pills}</div>}
      </header>

      <div className="relative flex min-h-0 flex-1">
        <main className="relative min-w-0 flex-1">
          {viewMode === 'canvas' && <Canvas {...common} laid={laid} view={view} setView={setView} animating={animating} size={size} setSize={setSize} />}
          {viewMode === 'kanban' && <Kanban {...common} setStage={setStage} />}
          {viewMode === 'table' && <Table {...common} />}
          {viewMode === 'list' && <MobileList {...common} />}
          {busy && <div className="sweep pointer-events-none absolute inset-x-0 top-0 h-0.5" />}
          {toast && (
            <div role="status" className="rise absolute bottom-[104px] left-1/2 z-40 flex -translate-x-1/2 items-center gap-3 rounded-xl bg-ink px-4 py-2.5 text-[13px] text-canvas shadow-pop md:bottom-28">
              <span>{toast.text}</span>{toast.undo && <button onClick={toast.undo} className="inline-flex items-center gap-1 font-semibold underline-offset-2 hover:underline"><Undo2 size={13} />Undo</button>}
            </div>)}
          <div className={cn('z-30', mobile ? 'fixed inset-x-0 bottom-0' : 'absolute bottom-6 left-1/2 w-[min(720px,calc(100%-32px))] -translate-x-1/2')}>
            <Dock inputRef={inputRef} offline={offline} busy={busy} onSubmit={addIdea} mobile={mobile} />
          </div>
        </main>
        <div className={cn(mobile ? 'fixed inset-0 z-50' : 'shrink-0 overflow-hidden transition-[width] duration-300', mobile ? (drawer ? 'block' : 'hidden') : drawer ? 'w-[380px]' : 'w-0')} aria-hidden={!drawer}>
          <div className={mobile ? 'h-full' : 'h-full w-[380px]'}>
            <Drawer tab={tab} setTab={setTab} onClose={() => setDrawer(false)} cards={cards} card={selCard} journal={journal} msgs={msgs} ask={ask} thinking={thinking}
              onCite={cite} setStage={setStage} patch={(id, p) => update(id, p)} merge={merge} comment={comment} />
          </div>
        </div>
      </div>
    </div>
  );
}
