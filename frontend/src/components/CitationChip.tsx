import { cn, kindMeta } from '../lib/utils';
import type { Citation } from '../lib/types';

interface CitationChipProps {
  citation: Citation;
  /** 1-based position in the sources list, shown as the chip's leading badge. */
  index: number;
  onOpen: (itemId: string) => void;
}

export function CitationChip({ citation, index, onOpen }: CitationChipProps) {
  const meta = kindMeta(citation.kind);
  const Icon = meta.icon;

  return (
    <button
      type="button"
      onClick={() => onOpen(citation.item_id)}
      title={citation.snippet}
      aria-label={`Source ${index}: ${citation.title}, ${meta.label}, chunk ${citation.chunk_idx}`}
      data-focus-ring
      className="group flex min-w-0 max-w-full items-center gap-2 rounded-full border border-white/10 bg-white/[0.04] px-2.5 py-1.5 text-xs text-slate-300 backdrop-blur-xl transition hover:border-indigo-400/40 hover:bg-white/[0.08] hover:text-white hover:shadow-[0_8px_40px_-12px_rgba(99,102,241,0.45)]"
    >
      <span
        className={cn(
          'flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[0.62rem] font-semibold',
          meta.tile,
        )}
        aria-hidden="true"
      >
        {index}
      </span>
      <Icon className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
      <span className="max-w-[13rem] truncate font-medium">{citation.title}</span>
      <span className="hidden shrink-0 text-[0.66rem] text-slate-500 sm:inline">chunk {citation.chunk_idx}</span>
    </button>
  );
}
