import { kindMeta } from '../lib/utils';
import type { Citation } from '../lib/types';

interface CitationChipProps {
  citation: Citation;
  /** 1-based position in the sources list, shown as the chip's leading badge. */
  index: number;
  onOpen: (itemId: string) => void;
}

export function CitationChip({ citation, index, onOpen }: CitationChipProps) {
  const meta = kindMeta(citation.kind);

  return (
    <button
      type="button"
      onClick={() => onOpen(citation.item_id)}
      title={citation.snippet}
      aria-label={`Source ${index}: ${citation.title}${citation.location ? `, ${citation.location}` : ''}, ${meta.label}, chunk ${citation.chunk_idx}`}
      data-focus-ring
      className="flex min-w-0 max-w-full items-center rounded-md border border-gray-300 px-2 py-1 text-xs text-gray-600 transition-colors duration-150 hover:bg-gray-50"
    >
      <span className="shrink-0">[{index}]</span>
      <span className="ml-1 max-w-52 truncate">{citation.title}</span>
      {citation.location ? (
        <span className="ml-1 shrink-0 text-gray-400">{citation.location}</span>
      ) : null}
    </button>
  );
}
