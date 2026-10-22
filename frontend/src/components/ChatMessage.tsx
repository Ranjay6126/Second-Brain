import { motion } from 'framer-motion';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Quote, Sparkles, User } from 'lucide-react';
import type { Citation, SearchHit } from '../lib/types';
import { cn, kindMeta, relativeTime } from '../lib/utils';
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
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
        className="flex justify-end"
      >
        <div className="flex max-w-[85%] items-start gap-3 sm:max-w-[75%]">
          <div className="rounded-3xl rounded-br-lg bg-gradient-to-br from-indigo-500 to-violet-600 px-4 py-3 text-sm leading-relaxed text-white shadow-[0_14px_40px_-18px_rgba(99,102,241,0.95)]">
            <p className="whitespace-pre-wrap break-words">{content}</p>
            {createdAt ? (
              <p className="mt-1.5 text-right text-[0.62rem] text-white/60">{relativeTime(createdAt)}</p>
            ) : null}
          </div>
          <div className="mt-0.5 hidden h-8 w-8 shrink-0 items-center justify-center rounded-2xl border border-white/10 bg-white/[0.05] sm:flex">
            <User className="h-4 w-4 text-slate-300" aria-hidden="true" />
          </div>
        </div>
      </motion.div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
      className="flex justify-start"
    >
      <div className="flex w-full max-w-full items-start gap-3 sm:max-w-[88%]">
        <div className="relative mt-0.5 hidden h-8 w-8 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-indigo-500 to-violet-500 sm:flex">
          <Sparkles className="h-4 w-4 text-white" aria-hidden="true" />
        </div>
        <div className="min-w-0 flex-1 rounded-3xl rounded-bl-lg border border-white/10 bg-white/[0.04] px-4 py-4 backdrop-blur-xl">
          {content.trim() === '' ? (
            <div className="flex items-center gap-1.5 py-1" aria-label="Assistant is thinking">
              {[0, 1, 2].map((dot) => (
                <motion.span
                  key={dot}
                  className="h-1.5 w-1.5 rounded-full bg-indigo-300"
                  animate={{ opacity: [0.25, 1, 0.25], y: [0, -2, 0] }}
                  transition={{ duration: 1.1, repeat: Infinity, delay: dot * 0.16 }}
                />
              ))}
            </div>
          ) : (
            <div className="brain-prose">
              <ReactMarkdown remarkPlugins={[remarkGfm]}>{content}</ReactMarkdown>
              {streaming ? (
                <span className="ml-0.5 inline-block h-4 w-[2px] translate-y-0.5 animate-pulse rounded-full bg-indigo-300" />
              ) : null}
            </div>
          )}

          {citations.length > 0 && onOpenCitation ? (
            <div className="mt-4 border-t border-white/10 pt-3">
              <div className="flex items-center gap-2 text-[0.7rem] font-semibold uppercase tracking-wider text-slate-400">
                <Quote className="h-3.5 w-3.5 text-indigo-300" aria-hidden="true" />
                Sources
              </div>
              <span
                aria-hidden="true"
                className="mt-1.5 block h-[3px] w-12 rounded-full bg-gradient-to-r from-indigo-500 to-violet-500"
              />
              <div className="mt-3 flex flex-wrap gap-2">
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
            <p className="mt-3 text-[0.62rem] text-slate-500">{relativeTime(createdAt)}</p>
          ) : null}
        </div>
      </div>
    </motion.div>
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
      <div className="flex w-full max-w-full items-start gap-3 sm:max-w-[88%]">
        <div className="mt-0.5 hidden h-8 w-8 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-indigo-500/60 to-violet-500/60 sm:flex">
          <Sparkles className="h-4 w-4 animate-pulse text-white" aria-hidden="true" />
        </div>
        <div className="min-w-0 flex-1 rounded-3xl rounded-bl-lg border border-white/10 bg-white/[0.03] px-4 py-4 backdrop-blur-xl">
          <p className="flex items-center gap-2 text-xs font-medium text-indigo-200">
            <span className="relative flex h-2 w-2" aria-hidden="true">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-indigo-400 opacity-60" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-indigo-400" />
            </span>
            Searching your brain…
          </p>
          <div className="mt-3 space-y-2">
            {preview.length === 0 ? (
              <>
                <div className="skeleton h-3 w-2/3 rounded-full" />
                <div className="skeleton h-3 w-1/2 rounded-full" />
              </>
            ) : (
              preview.map((hit, index) => {
                const meta = kindMeta(hit.kind);
                const Icon = meta.icon;
                return (
                  <div
                    key={`${hit.item_id}-${hit.chunk_idx}-${index}`}
                    className="flex items-center gap-2.5 rounded-2xl border border-white/5 bg-white/[0.02] px-3 py-2"
                  >
                    <span className={cn('flex h-7 w-7 items-center justify-center rounded-xl', meta.tile)}>
                      <Icon className="h-3.5 w-3.5" aria-hidden="true" />
                    </span>
                    <span className="min-w-0 flex-1 truncate text-xs text-slate-300">{hit.title}</span>
                    <span className="skeleton h-2.5 w-10 shrink-0 rounded-full" />
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
