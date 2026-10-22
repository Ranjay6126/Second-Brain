import { useEffect, useState, type FormEvent } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Brain, Cpu, Plus, Search, Sparkles, TriangleAlert, X } from 'lucide-react';
import type { Health } from '../lib/types';
import { cn } from '../lib/utils';

interface TopBarProps {
  health: Health | null;
  query: string;
  onSearch: (value: string) => void;
  onNew: () => void;
  showLocalBanner: boolean;
  onDismissLocalBanner: () => void;
}

export function TopBar({
  health,
  query,
  onSearch,
  onNew,
  showLocalBanner,
  onDismissLocalBanner,
}: TopBarProps) {
  const [draft, setDraft] = useState(query);

  useEffect(() => {
    setDraft(query);
  }, [query]);

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const value = draft.trim();
    if (value === '') return;
    onSearch(value);
  };

  const isGemini = health?.mode === 'gemini';

  return (
    <header className="sticky top-0 z-30 border-b border-white/10 bg-void-950/70 backdrop-blur-2xl">
      <div className="mx-auto flex w-full max-w-[1600px] items-center gap-3 px-4 py-3 md:px-7">
        <div className="flex items-center gap-2.5 md:hidden">
          <div className="flex h-9 w-9 items-center justify-center rounded-2xl bg-gradient-to-br from-indigo-500 to-violet-500">
            <Brain className="h-4.5 w-4.5 text-white" aria-hidden="true" />
          </div>
          <span className="hidden text-sm font-semibold tracking-tight text-white sm:block">Second Brain</span>
        </div>

        <form onSubmit={submit} role="search" className="min-w-0 flex-1">
          <div className="group relative">
            <Search
              className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500 transition-colors group-focus-within:text-indigo-300"
              aria-hidden="true"
            />
            <input
              type="search"
              value={draft}
              onChange={(event) => {
                setDraft(event.target.value);
                if (event.target.value === '') onSearch('');
              }}
              placeholder="Search your brain…"
              aria-label="Search your brain"
              data-focus-ring
              className="h-11 w-full rounded-full border border-white/10 bg-white/[0.04] pl-11 pr-11 text-sm text-white outline-none backdrop-blur-xl transition placeholder:text-slate-500 focus:border-indigo-400/40 focus:bg-white/[0.06] [&::-webkit-search-cancel-button]:hidden"
            />
            {draft !== '' ? (
              <button
                type="button"
                aria-label="Clear search"
                data-focus-ring
                onClick={() => {
                  setDraft('');
                  onSearch('');
                }}
                className="absolute right-3 top-1/2 -translate-y-1/2 rounded-full p-1.5 text-slate-400 transition hover:bg-white/10 hover:text-white"
              >
                <X className="h-3.5 w-3.5" aria-hidden="true" />
              </button>
            ) : null}
          </div>
        </form>

        <div
          title={
            health
              ? `${health.mode === 'gemini' ? 'Gemini' : 'Local'} mode · chat: ${health.chat_model}`
              : 'Contacting the backend…'
          }
          className={cn(
            'hidden shrink-0 items-center gap-2 rounded-full border px-3 py-2 text-xs font-medium sm:flex',
            health === null
              ? 'border-white/10 bg-white/[0.04] text-slate-400'
              : isGemini
                ? 'border-emerald-400/25 bg-emerald-500/10 text-emerald-200'
                : 'border-amber-400/25 bg-amber-500/10 text-amber-200',
          )}
        >
          <span className="relative flex h-2 w-2" aria-hidden="true">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-current opacity-50" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-current" />
          </span>
          {health === null ? (
            'Connecting'
          ) : (
            <>
              {isGemini ? <Sparkles className="h-3.5 w-3.5" aria-hidden="true" /> : <Cpu className="h-3.5 w-3.5" aria-hidden="true" />}
              {isGemini ? 'Gemini mode' : 'Local mode'}
            </>
          )}
        </div>

        <button
          type="button"
          onClick={onNew}
          data-focus-ring
          className="flex shrink-0 items-center gap-2 rounded-full bg-gradient-to-r from-indigo-500 to-violet-500 px-4 py-2.5 text-sm font-semibold text-white shadow-[0_10px_30px_-10px_rgba(99,102,241,0.95)] transition hover:brightness-110 active:scale-[0.98]"
        >
          <Plus className="h-4 w-4" aria-hidden="true" />
          New
        </button>
      </div>

      <AnimatePresence initial={false}>
        {showLocalBanner ? (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
            className="overflow-hidden border-t border-amber-400/20 bg-amber-500/10 backdrop-blur-xl"
          >
            <div className="mx-auto flex w-full max-w-[1600px] items-center gap-3 px-4 py-2.5 md:px-7">
              <TriangleAlert className="h-4 w-4 shrink-0 text-amber-300" aria-hidden="true" />
              <p className="flex-1 text-xs leading-snug text-amber-100 sm:text-[0.8rem]">
                <span className="font-semibold">Local mode</span> — add{' '}
                <code className="rounded bg-black/25 px-1.5 py-0.5 font-mono text-[0.72rem] text-amber-100">
                  GEMINI_API_KEY
                </code>{' '}
                to <code className="rounded bg-black/25 px-1.5 py-0.5 font-mono text-[0.72rem] text-amber-100">backend/.env</code> for
                full multimodal understanding.
              </p>
              <button
                type="button"
                aria-label="Dismiss local mode notice"
                data-focus-ring
                onClick={onDismissLocalBanner}
                className="shrink-0 rounded-full p-1.5 text-amber-200/80 transition hover:bg-amber-400/15 hover:text-amber-100"
              >
                <X className="h-3.5 w-3.5" aria-hidden="true" />
              </button>
            </div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </header>
  );
}
