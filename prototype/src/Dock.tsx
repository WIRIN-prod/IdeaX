import { RefObject, useEffect, useState } from 'react';
import { CornerDownLeft, ImagePlus, Link2, Sparkles, WifiOff, X } from 'lucide-react';
import { SECTIONS, STAGES, Stage } from './data';
import { cn } from './ui';

export interface Capture { text: string; img?: { src: string; name: string }; section?: string; stage?: Stage }
export const URL_RE = /https?:\/\/[^\s]+/i;

export function Dock({ inputRef, offline, busy, onSubmit, mobile }: { inputRef: RefObject<HTMLInputElement>; offline: boolean; busy: boolean; onSubmit: (c: Capture) => void; mobile: boolean }) {
  const [text, setText] = useState(''); const [img, setImg] = useState<Capture['img']>(); const [section, setSection] = useState(''); const [stage, setStage] = useState(''); const [over, setOver] = useState(false); const [open, setOpen] = useState(false);
  const url = text.match(URL_RE)?.[0]; const domain = url ? (() => { try { return new URL(url).hostname.replace(/^www\./, ''); } catch { return url; } })() : '';
  const readFile = (f?: File) => { if (!f || !f.type.startsWith('image/')) return; const r = new FileReader(); r.onload = () => setImg({ src: String(r.result), name: f.name }); r.readAsDataURL(f); };
  useEffect(() => { // an image dropped anywhere on the page lands in the dock instead of navigating away
    const stop = (e: DragEvent) => e.preventDefault(); const drop = (e: DragEvent) => { e.preventDefault(); readFile(e.dataTransfer?.files?.[0]); };
    window.addEventListener('dragover', stop); window.addEventListener('drop', drop); return () => { window.removeEventListener('dragover', stop); window.removeEventListener('drop', drop); };
  }, []);
  const ready = (text.trim() || img) && !busy;
  const submit = () => { if (!ready) return; onSubmit({ text: text.trim(), img, section: section || undefined, stage: (stage as Stage) || undefined }); setText(''); setImg(undefined); setSection(''); setStage(''); setOpen(false); };
  return (
    <div role="region" aria-label="Capture an idea" onDragOver={(e) => { e.preventDefault(); setOver(true); }} onDragLeave={() => setOver(false)} onDrop={(e) => { e.preventDefault(); e.stopPropagation(); setOver(false); readFile(e.dataTransfer.files?.[0]); }}
      className={cn('border border-line bg-surface/85 shadow-pop backdrop-blur-xl', mobile ? 'rounded-t-2xl p-3 pb-[max(12px,env(safe-area-inset-bottom))]' : 'rounded-2xl p-2', over && 'border-accent ring-2 ring-accent/30')}>
      {(url || img || over) && (
        <div className="flex flex-wrap items-center gap-2 px-2 pb-2 pt-1">
          {url && <span className="inline-flex items-center gap-1.5 rounded-lg border border-line bg-sunk px-2 py-1 text-xs"><Link2 size={12} className="text-mute" /><span className="font-mono">{domain}</span><span className="text-mute">link preview</span></span>}
          {img && <span className="inline-flex items-center gap-2 rounded-lg border border-line bg-sunk py-1 pl-1 pr-2 text-xs"><img src={img.src} alt="" className="h-7 w-7 rounded object-cover" /><span className="max-w-[140px] truncate">{img.name}</span><button aria-label="Remove image" onClick={() => setImg(undefined)}><X size={12} /></button></span>}
          {over && !img && <span className="text-xs text-accent">Drop to attach the image</span>}
          {(url || img) && <span className="inline-flex items-center gap-1 text-xs text-accent"><Sparkles size={12} />{offline ? 'Keyword routing will place it' : 'AI Agent will auto-classify & place'}</span>}
        </div>)}
      <div className="flex items-center gap-2">
        <input ref={inputRef} value={text} onChange={(e) => setText(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') submit(); if (e.key === 'Escape') (e.target as HTMLInputElement).blur(); }}
          aria-label="Idea, link or image" placeholder="Drop an idea, paste a URL, or drag an image anywhere…" className="min-w-0 flex-1 bg-transparent px-3 py-2 text-[14px] outline-none placeholder:text-mute" />
        <label className="grid h-8 w-8 cursor-pointer place-items-center rounded-lg text-mute hover:bg-sunk" title="Attach an image"><ImagePlus size={16} /><span className="sr-only">Attach an image</span><input type="file" accept="image/*" className="hidden" onChange={(e) => readFile(e.target.files?.[0])} /></label>
        <button onClick={() => setOpen(!open)} aria-expanded={open} className={cn('hidden h-8 rounded-lg px-2.5 text-xs font-medium hover:bg-sunk sm:block', (section || stage) ? 'text-accent' : 'text-mute')}>Place manually</button>
        <kbd className="hidden rounded border border-line px-1.5 py-0.5 font-mono text-[11px] text-mute md:block">⌘K</kbd>
        <button onClick={submit} disabled={!ready} className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-accent px-3 text-[13px] font-medium text-accent-ink disabled:opacity-40">{busy ? 'Filing…' : <>Add<CornerDownLeft size={13} /></>}</button>
      </div>
      {open && (
        <div className="flex flex-wrap gap-2 px-2 pb-1 pt-2">
          <select value={section} onChange={(e) => setSection(e.target.value)} aria-label="Section" className="rounded-lg border border-line bg-canvas px-2 py-1.5 text-xs"><option value="">Section: let the agent choose</option>{SECTIONS.map((s) => <option key={s.id} value={s.id}>{s.title}</option>)}</select>
          <select value={stage} onChange={(e) => setStage(e.target.value)} aria-label="Stage" className="rounded-lg border border-line bg-canvas px-2 py-1.5 text-xs"><option value="">Stage: Captured</option>{STAGES.filter((s) => s.id !== 'duplicate').map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}</select>
        </div>)}
      {offline && <div className="flex items-center gap-1.5 px-3 pt-1 text-[11px] text-[color:var(--st-review)]"><WifiOff size={11} />AI proxy offline. Ideas are saved and filed by keyword.</div>}
    </div>
  );
}
