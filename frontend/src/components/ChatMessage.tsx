import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Quote, Sparkles, User } from 'lucide-react';
import type { Citation, SearchHit } from '../lib/types';
import { kindMeta, relativeTime } from '../lib/utils';
import { CitationChip } from './CitationChip';

interface ChatMessageProps {
  role: 'user' | 'assistant';
  content: string;
  citations?: Citation[];
  createdAt?: string;
  streaming?: boolean;
  onOpenCitation?: (itemId: string) => void;
}

export function ChatMessage({
  role,
  content,
  citations = [],
  createdAt,
  streaming = false,
  onOpenCitation,
}: ChatMessageProps) {
  const isUser = role === 'user';

  if (isUser) {
    return (
      <div className="flex justify-end">
        <div className="flex max-w-md items-start gap-2 sm:max-w-lg">
          <div className="rounded-md bg-blue-600 px-3 py-2 text-sm text-white">
            <p className="whitespace-pre-wrap break-words">{content}</p>
            {createdAt ? (
              <p className="mt-1 text-right text-xs text-blue-100">{relativeTime(createdAt)}</p>
            ) : null}
          </div>
          <div className="mt-0.5 hidden h-8 w-8 shrink-0 items-center justify-center rounded-md border border-gray-300 bg-gray-50 sm:flex">
            <User className="h-4 w-4 text-gray-500" aria-hidden="true" />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex justify-start">
      <div className="flex w-full items-start gap-2">
        <div className="mt-0.5 hidden h-8 w-8 shrink-0 items-center justify-center rounded-md border border-gray-300 bg-gray-50 sm:flex">
          <Sparkles className="h-4 w-4 text-gray-500" aria-hidden="true" />
        </div>
        <div className="min-w-0 flex-1 rounded-md bg-gray-100 px-3 py-2 text-gray-900">
          {content.trim() === '' ? (
            <p className="text-xs text-gray-500">Loading…</p>
          ) : (
            <div className="brain-prose">
              <ReactMarkdown remarkPlugins={[remarkGfm]}>{content}</ReactMarkdown>
            </div>
          )}

          {citations.length > 0 && onOpenCitation ? (
            <div className="mt-3 border-t border-gray-300 pt-3">
              <div className="flex items-center gap-2 text-xs font-medium text-gray-500">
                <Quote className="h-3.5 w-3.5 text-gray-500" aria-hidden="true" />
                Sources
              </div>
              <div className="mt-2 flex flex-wrap gap-2">
                {citations.map((citation, index) => (
                  <CitationChip
                    key={`${citation.item_id}-${citation.chunk_idx}-${index}`}
                    citation={citation}
                    index={index + 1}
                    onOpen={onOpenCitation}
                  />
                ))}
              </div>
            </div>
          ) : null}

          {createdAt && !streaming ? (
            <p className="mt-2 text-xs text-gray-500">{relativeTime(createdAt)}</p>
          ) : null}
        </div>
      </div>
    </div>
  );
}

interface RetrievalSkeletonProps {
  hits: SearchHit[];
}

/** "Searching your brain…" placeholders shown before the first token arrives. */
export function RetrievalSkeleton({ hits }: RetrievalSkeletonProps) {
  const preview = hits.slice(0, 3);

  return (
    <div className="flex justify-start">
      <div className="flex w-full items-start gap-2">
        <div className="mt-0.5 hidden h-8 w-8 shrink-0 items-center justify-center rounded-md border border-gray-300 bg-gray-50 sm:flex">
          <Sparkles className="h-4 w-4 text-gray-500" aria-hidden="true" />
        </div>
        <div className="min-w-0 flex-1 rounded-md bg-gray-100 px-3 py-2">
          <p className="text-xs text-gray-600">Searching…</p>
          <div className="mt-2 space-y-2">
            {preview.length === 0 ? (
              <>
                <div className="skeleton h-3 w-2/3 rounded" />
                <div className="skeleton h-3 w-1/2 rounded" />
              </>
            ) : (
              preview.map((hit, index) => {
                const meta = kindMeta(hit.kind);
                const Icon = meta.icon;
                return (
                  <div
                    key={`${hit.item_id}-${hit.chunk_idx}-${index}`}
                    className="flex items-center gap-2 rounded-md border border-gray-300 bg-white px-2 py-1.5"
                  >
                    <Icon className="h-3.5 w-3.5 shrink-0 text-gray-500" aria-hidden="true" />
                    <span className="min-w-0 flex-1 truncate text-xs text-gray-600">{hit.title}</span>
                    <span className="skeleton h-2.5 w-10 shrink-0 rounded" />
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
