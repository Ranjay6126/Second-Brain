import { useCallback, useEffect, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import {
  Calendar,
  Clock,
  ExternalLink,
  HardDrive,
  Layers,
  RefreshCw,
  ScrollText,
  StickyNote,
  Tag,
  Trash2,
  TriangleAlert,
  X,
  type LucideIcon,
} from 'lucide-react';
import { deleteItem, errorMessage, getItem, itemFileUrl, reprocessItem } from '../lib/api';
import type { ItemDetail } from '../lib/types';
import { formatBytes, formatDateTime, kindMeta, relativeTime } from '../lib/utils';
import { SectionTitle } from './SectionTitle';
import { SkeletonDetail } from './Skeleton';
import { useToast } from './Toast';

interface ItemDetailDrawerProps {
  itemId: string;
  onClose: () => void;
  /** Called after a mutation so the library and health stats refresh. */
  onChanged: () => void;
}

export function ItemDetailDrawer({ itemId, onClose, onChanged }: ItemDetailDrawerProps) {
  const { toast } = useToast();
  const [detail, setDetail] = useState<ItemDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [showChunks, setShowChunks] = useState(false);

  const load = useCallback(
    async (silent = false) => {
      if (!silent) setLoading(true);
      try {
        const next = await getItem(itemId);
        setDetail(next);
      } catch (error) {
        if (!silent) toast(errorMessage(error), 'error');
      } finally {
        if (!silent) setLoading(false);
      }
    },
    [itemId, toast],
  );

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [onClose]);

  // Keep an eye on items that are still being indexed.
  useEffect(() => {
    if (detail?.status !== 'processing') return;
    const timer = window.setInterval(() => {
      void load(true);
    }, 3000);
    return () => window.clearInterval(timer);
  }, [detail?.status, load]);

  const handleReprocess = async () => {
    if (!detail) return;
    setBusy(true);
    try {
      await reprocessItem(detail.id);
      toast('Re-indexing started — this can take a few moments.', 'success');
      onChanged();
      await load(true);
    } catch (error) {
      toast(errorMessage(error), 'error');
    } finally {
      setBusy(false);
    }
  };

  const handleDelete = async () => {
    if (!detail) return;
    setBusy(true);
    try {
      await deleteItem(detail.id);
      toast(`Deleted “${detail.title}”.`, 'success');
      onChanged();
      onClose();
    } catch (error) {
      toast(errorMessage(error), 'error');
      setBusy(false);
    }
  };

  const meta = detail ? kindMeta(detail.kind) : null;
  const Icon = meta?.icon;

  return (
    <div className="fixed inset-0 z-50" role="dialog" aria-modal="true" aria-label="Item details">
      <button
        type="button"
        aria-label="Close details"
        onClick={onClose}
        className="absolute inset-0 cursor-default bg-black/40"
        tabIndex={-1}
      />

      <aside className="absolute inset-y-0 right-0 flex w-full max-w-xl flex-col border-l border-gray-300 bg-white shadow-sm">
        <div className="flex items-center justify-between gap-3 border-b border-gray-200 px-5 py-4">
          <div className="flex min-w-0 items-center gap-2">
            {meta && Icon ? <Icon className="h-4 w-4 shrink-0 text-gray-500" aria-hidden="true" /> : null}
            <div className="min-w-0">
              <p className="truncate text-sm font-medium text-gray-900">{detail?.title ?? 'Loading…'}</p>
              <p className="text-xs text-gray-500">
                {meta ? `${meta.label} · ${detail?.status}` : 'Item detail'}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close details"
            data-focus-ring
            className="shrink-0 rounded-md p-2 text-gray-500 transition-colors duration-150 hover:bg-gray-100 hover:text-gray-700"
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-6">
          {loading && !detail ? (
            <SkeletonDetail />
          ) : detail ? (
            <div className="space-y-7">
              {detail.status === 'processing' ? (
                <div className="rounded-md border border-blue-300 px-3 py-2">
                  <p className="text-xs text-blue-700">Indexing…</p>
                </div>
              ) : null}

              {detail.status === 'failed' ? (
                <div className="flex items-start gap-2 rounded-md border border-red-300 px-3 py-2">
                  <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0 text-red-600" aria-hidden="true" />
                  <p className="text-xs leading-relaxed text-red-700">
                    {detail.error ?? 'Indexing failed. Try reprocessing this item.'}
                  </p>
                </div>
              ) : null}

              <div className="grid grid-cols-2 gap-3">
                <MetaTile icon={Calendar} label="Added" value={formatDateTime(detail.created_at)} />
                <MetaTile icon={Clock} label="Updated" value={relativeTime(detail.updated_at)} />
                <MetaTile icon={HardDrive} label="Size" value={formatBytes(detail.size_bytes)} />
                <MetaTile
                  icon={Layers}
                  label="Chunks"
                  value={`${detail.chunk_count} ${detail.chunk_count === 1 ? 'chunk' : 'chunks'}`}
                />
              </div>

              <section>
                <p className="truncate text-xs text-gray-500" title={detail.source}>
                  Source: {detail.source}
                  {detail.mime ? ` · ${detail.mime}` : ''}
                </p>
              </section>

              {detail.tags.length > 0 ? (
                <section>
                  <SectionTitle>Tags</SectionTitle>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {detail.tags.map((tag) => (
                      <span
                        key={tag}
                        className="inline-flex items-center gap-1.5 rounded-md border border-gray-300 bg-gray-50 px-2 py-1 text-xs text-gray-600"
                      >
                        <Tag className="h-3 w-3 text-gray-500" aria-hidden="true" />
                        {tag}
                      </span>
                    ))}
                  </div>
                </section>
              ) : null}

              {detail.note ? (
                <section>
                  <SectionTitle>Context note</SectionTitle>
                  <div className="mt-3 rounded-md border border-gray-300 bg-gray-50 p-3">
                    <p className="flex gap-2 text-sm leading-relaxed text-gray-700">
                      <StickyNote className="mt-0.5 h-4 w-4 shrink-0 text-gray-500" aria-hidden="true" />
                      <span className="whitespace-pre-wrap">{detail.note}</span>
                    </p>
                  </div>
                </section>
              ) : null}

              {detail.summary ? (
                <section>
                  <SectionTitle>Summary</SectionTitle>
                  <div className="mt-3 rounded-md border border-gray-300 bg-gray-50 p-3">
                    <p className="text-sm leading-relaxed text-gray-700">{detail.summary}</p>
                  </div>
                </section>
              ) : null}

              <section>
                <SectionTitle
                  right={
                    detail.file_url ? (
                      <a
                        href={detail.file_url}
                        target="_blank"
                        rel="noreferrer"
                        data-focus-ring
                        className="flex items-center gap-2 rounded-md border border-gray-300 bg-white px-2 py-1 text-xs text-gray-700 transition-colors duration-150 hover:bg-gray-50"
                      >
                        <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
                        Open original
                      </a>
                    ) : undefined
                  }
                >
                  Preview
                </SectionTitle>
                <div className="mt-3">
                  <Preview detail={detail} />
                </div>
              </section>

              <section>
                <SectionTitle
                  hint={detail.chunks.length > 0 ? `${detail.chunks.length} indexed chunks` : 'No chunks yet'}
                  right={
                    detail.chunks.length > 0 ? (
                      <button
                        type="button"
                        onClick={() => setShowChunks((value) => !value)}
                        aria-expanded={showChunks}
                        data-focus-ring
                        className="rounded-md border border-gray-300 bg-white px-2 py-1 text-xs text-gray-700 transition-colors duration-150 hover:bg-gray-50"
                      >
                        {showChunks ? 'Hide' : 'Inspect'}
                      </button>
                    ) : undefined
                  }
                >
                  Chunks
                </SectionTitle>

                {showChunks && detail.chunks.length > 0 ? (
                  <div className="mt-3 max-h-80 space-y-2 overflow-y-auto pr-1">
                    {detail.chunks.map((chunk) => (
                      <div key={chunk.idx} className="rounded-md border border-gray-300 bg-gray-50 p-3">
                        <div className="flex items-center gap-2 text-xs font-medium text-gray-500">
                          <ScrollText className="h-3 w-3" aria-hidden="true" />
                          chunk {chunk.idx}
                        </div>
                        <p className="mt-2 whitespace-pre-wrap text-xs leading-relaxed text-gray-600">
                          {chunk.text}
                        </p>
                      </div>
                    ))}
                  </div>
                ) : null}
              </section>
            </div>
          ) : (
            <p className="text-sm text-gray-500">This item could not be loaded.</p>
          )}
        </div>

        <div className="flex items-center gap-3 border-t border-gray-200 px-5 py-4">
          {confirming ? (
            <>
              <p className="flex-1 text-xs text-gray-600">Delete permanently?</p>
              <button
                type="button"
                onClick={handleDelete}
                disabled={busy}
                className="rounded-md border border-red-300 px-3 py-2 text-sm text-red-600 transition-colors duration-150 hover:bg-red-50 disabled:opacity-50"
              >
                Delete
              </button>
              <button
                type="button"
                onClick={() => setConfirming(false)}
                className="rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-700 transition-colors duration-150 hover:bg-gray-50"
              >
                Cancel
              </button>
            </>
          ) : (
            <>
              <button
                type="button"
                onClick={handleReprocess}
                disabled={busy || !detail}
                data-focus-ring
                className="flex flex-1 items-center justify-center gap-2 rounded-md bg-blue-600 px-3 py-2 text-sm text-white transition-colors duration-150 hover:bg-blue-700 disabled:opacity-50"
              >
                <RefreshCw className="h-4 w-4" aria-hidden="true" />
                Reprocess
              </button>
              <button
                type="button"
                onClick={() => setConfirming(true)}
                disabled={busy || !detail}
                data-focus-ring
                className="flex items-center justify-center gap-2 rounded-md border border-red-300 px-3 py-2 text-sm text-red-600 transition-colors duration-150 hover:bg-red-50 disabled:opacity-50"
              >
                <Trash2 className="h-4 w-4" aria-hidden="true" />
                Delete
              </button>
            </>
          )}
        </div>
      </aside>
    </div>
  );
}

interface MetaTileProps {
  icon: LucideIcon;
  label: string;
  value: string;
}

function MetaTile({ icon: Icon, label, value }: MetaTileProps) {
  return (
    <div className="rounded-md border border-gray-200 bg-gray-50 px-3.5 py-3">
      <p className="flex items-center gap-1.5 text-xs font-medium text-gray-500">
        <Icon className="h-3 w-3" aria-hidden="true" />
        {label}
      </p>
      <p className="mt-1 truncate text-xs text-gray-800" title={value}>
        {value || '—'}
      </p>
    </div>
  );
}

function Preview({ detail }: { detail: ItemDetail }) {
  const url = detail.file_url ?? (detail.status === 'ready' ? itemFileUrl(detail.id) : null);

  if (detail.kind === 'text') {
    if (!detail.content) {
      return <p className="text-xs text-gray-500">No stored content for this note.</p>;
    }
    return (
      <div className="brain-prose max-h-96 overflow-y-auto rounded-md border border-gray-200 bg-gray-50 p-4">
        <ReactMarkdown remarkPlugins={[remarkGfm]}>{detail.content}</ReactMarkdown>
      </div>
    );
  }

  if (!url) {
    return <p className="text-xs text-gray-500">Preview becomes available once indexing finishes.</p>;
  }

  if (detail.kind === 'image') {
    return (
      <img
        src={url}
        alt={detail.title}
        loading="lazy"
        className="max-h-96 w-full rounded-md border border-gray-200 object-contain"
      />
    );
  }

  if (detail.kind === 'audio') {
    return (
      <audio controls src={url} className="w-full rounded-md">
        Your browser cannot play this audio file.
      </audio>
    );
  }

  if (detail.kind === 'video') {
    return (
      <video controls src={url} className="max-h-96 w-full rounded-md border border-gray-200 bg-black" />
    );
  }

  return (
    <object
      data={url}
      type="application/pdf"
      aria-label={`PDF preview of ${detail.title}`}
      className="h-96 w-full rounded-md border border-gray-200 bg-gray-50"
    >
      <p className="p-4 text-xs text-gray-500">
        Inline PDF preview is unavailable — use “Open original” to view the file.
      </p>
    </object>
  );
}
