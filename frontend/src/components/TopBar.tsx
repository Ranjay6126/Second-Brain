import { useEffect, useState, type FormEvent } from 'react';
import { Brain, Plus, Search, TriangleAlert, X } from 'lucide-react';
import type { Health } from '../lib/types';

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

  const missingMedia = health
    ? (['image', 'audio', 'video'] as const).filter((kind) => !health.capabilities[kind])
    : [];
  const providerLabel = health
    ? health.provider === 'local'
      ? 'Local RAG'
      : `${health.provider} AI`
    : 'Contacting the backend…';

  return (
    <header className="sticky top-0 z-30 border-b border-gray-200 bg-white">
      <div className="mx-auto flex w-full max-w-7xl items-center gap-3 px-4 py-3 md:px-6">
        <div className="flex items-center gap-2 md:hidden">
          <Brain className="h-5 w-5 shrink-0 text-gray-500" aria-hidden="true" />
          <span className="hidden text-sm font-semibold text-gray-900 sm:block">Second Brain</span>
        </div>

        <form onSubmit={submit} role="search" className="min-w-0 flex-1">
          <div className="relative">
            <Search
              className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-500"
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
              className="h-10 w-full rounded-md border border-gray-300 bg-white pl-10 pr-10 text-sm text-gray-900 focus:border-blue-500 focus:outline-none"
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
                className="absolute right-2 top-1/2 -translate-y-1/2 rounded-md p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-700"
              >
                <X className="h-4 w-4" aria-hidden="true" />
              </button>
            ) : null}
          </div>
        </form>

        <div
          title={
            health
              ? `${providerLabel} · chat: ${health.chat_model}`
              : 'Contacting the backend…'
          }
          className="hidden shrink-0 items-center rounded-md border border-gray-300 px-2 py-1 text-xs text-gray-600 sm:flex"
        >
          {health === null ? 'Connecting' : providerLabel}
        </div>

        <button
          type="button"
          onClick={onNew}
          data-focus-ring
          className="flex shrink-0 items-center gap-2 rounded-md bg-blue-600 px-3 py-2 text-sm text-white transition-colors duration-150 hover:bg-blue-700"
        >
          <Plus className="h-4 w-4" aria-hidden="true" />
          New
        </button>
      </div>

      {showLocalBanner ? (
        <div className="border-t border-amber-200 bg-amber-50">
          <div className="mx-auto flex w-full max-w-7xl items-center gap-3 px-4 py-2 md:px-6">
            <TriangleAlert className="h-4 w-4 shrink-0 text-amber-600" aria-hidden="true" />
            <p className="flex-1 text-xs leading-snug text-amber-800 sm:text-sm">
              <span className="font-semibold">Some media cannot be fully understood yet</span> — add a compatible key to{' '}
              <code className="rounded bg-amber-100 px-1.5 py-0.5 font-mono text-xs text-amber-800">backend/.env</code>{' '}
              to read {missingMedia.join(', ')}. Gemini supports all media and scanned PDFs; OpenRouter supports
              images; Groq supports audio transcription. The app automatically uses a configured compatible provider.
            </p>
            <button
              type="button"
              aria-label="Dismiss local mode notice"
              data-focus-ring
              onClick={onDismissLocalBanner}
              className="shrink-0 rounded-md p-1.5 text-amber-700 hover:bg-amber-100"
            >
              <X className="h-4 w-4" aria-hidden="true" />
            </button>
          </div>
        </div>
      ) : null}
    </header>
  );
}
