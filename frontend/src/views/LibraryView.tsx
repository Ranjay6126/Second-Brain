import { useCallback, useEffect, useMemo, useState, type KeyboardEvent } from 'react';
import { motion } from 'framer-motion';
import { Database, Layers, Loader2, ScanSearch, Sparkles, TriangleAlert, X, type LucideIcon } from 'lucide-react';
import { deleteItem, errorMessage, listItems, reprocessItem, searchItems } from '../lib/api';
import type { Health, Item, Kind, SearchHit } from '../lib/types';
import { KIND_META, KIND_ORDER, cn, kindMeta } from '../lib/utils';
import { EmptyState } from '../components/EmptyState';
import { ItemCard } from '../components/ItemCard';
import { SectionTitle } from '../components/SectionTitle';
import { SkeletonCard } from '../components/Skeleton';
import { UploadPanel } from '../components/UploadPanel';
import { useToast } from '../components/Toast';

type KindFilter = Kind | 'all';
type SortMode = 'newest' | 'oldest' | 'title';

const SORTS: Array<{ id: SortMode; label: string }> = [
  { id: 'newest', label: 'Newest' },
  { id: 'oldest', label: 'Oldest' },
  { id: 'title', label: 'Title' },
];

const POLL_MS = 3000;

interface LibraryViewProps {
  health: Health | null;
  healthLoading: boolean;
  query: string;
  onClearQuery: () => void;
  refreshToken: number;
  onOpenItem: (itemId: string) => void;
  onMutated: () => void;
}

export function LibraryView({
  health,
  healthLoading,
  query,
  onClearQuery,
  refreshToken,
  onOpenItem,
  onMutated,
}: LibraryViewProps) {
  const { toast } = useToast();
  const [items, setItems] = useState<Item[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [kindFilter, setKindFilter] = useState<KindFilter>('all');
  const [sort, setSort] = useState<SortMode>('newest');
  const [hits, setHits] = useState<SearchHit[]>([]);
  const [searching, setSearching] = useState(false);

  const searching$ = query.trim() !== '';

  const load = useCallback(
    async (silent = false) => {
      if (query.trim() !== '') return;
      if (!silent) setLoading(true);
      try {
        const res = await listItems({ kind: kindFilter, limit: 200 });
        setItems(res.items);
        setTotal(res.total);
      } catch (error) {
        toast(errorMessage(error), 'error');
      } finally {
        if (!silent) setLoading(false);
      }
    },
    [kindFilter, query, toast],
  );

  useEffect(() => {
    void load();
  }, [load, refreshToken]);

  // Semantic search mode, driven by the global search field in the top bar.
  useEffect(() => {
    if (!searching$) {
      setHits([]);
      setSearching(false);
      return;
    }
    let cancelled = false;
    setSearching(true);
    searchItems(query.trim(), 24)
      .then((res) => {
        if (!cancelled) setHits(res.hits);
      })
      .catch((error: unknown) => {
        if (!cancelled) toast(errorMessage(error), 'error');
      })
      .finally(() => {
        if (!cancelled) setSearching(false);
      });
    return () => {
      cancelled = true;
    };
  }, [query, searching$, refreshToken, toast]);

  // Poll while the backend is still indexing, and stop as soon as nothing is processing.
  const hasProcessing = useMemo(() => items.some((item) => item.status === 'processing'), [items]);

  useEffect(() => {
    if (!hasProcessing || searching$) return;
    const timer = window.setInterval(() => {
      void load(true);
    }, POLL_MS);
    return () => window.clearInterval(timer);
  }, [hasProcessing, searching$, load]);

  const sorted = useMemo(() => {
    const copy = [...items];
    copy.sort((a, b) => {
      if (sort === 'title') return a.title.localeCompare(b.title);
      const left = new Date(a.created_at).getTime();
      const right = new Date(b.created_at).getTime();
      return sort === 'newest' ? right - left : left - right;
    });
    return copy;
  }, [items, sort]);

  const kindCounts = useMemo(() => {
    const counts = new Map<Kind, number>();
    for (const item of items) counts.set(item.kind, (counts.get(item.kind) ?? 0) + 1);
    return counts;
  }, [items]);

  const chunkTotal = useMemo(() => items.reduce((sum, item) => sum + item.chunk_count, 0), [items]);
  const processingCount = useMemo(() => items.filter((item) => item.status === 'processing').length, [items]);

  const handleReprocess = useCallback(
    async (item: Item) => {
      try {
        await reprocessItem(item.id);
        toast(`Re-indexing “${item.title}”.`, 'success');
        onMutated();
      } catch (error) {
        toast(errorMessage(error), 'error');
      }
    },
    [onMutated, toast],
  );

  const handleDelete = useCallback(
    async (item: Item) => {
      try {
        await deleteItem(item.id);
        toast(`Deleted “${item.title}”.`, 'success');
        setItems((current) => current.filter((entry) => entry.id !== item.id));
        onMutated();
      } catch (error) {
        toast(errorMessage(error), 'error');
      }
    },
    [onMutated, toast],
  );

  const showSkeletons = loading && items.length === 0 && !searching$;

  return (
    <div className="space-y-6">
      <StatsStrip
        health={health}
        loading={healthLoading}
        fallbackItems={total}
        fallbackChunks={chunkTotal}
        processing={processingCount}
        kindCounts={kindCounts}
      />

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
        <div className="xl:order-2 xl:sticky xl:top-24 xl:self-start">
          <UploadPanel onUploaded={onMutated} />
        </div>

        <div className="min-w-0 space-y-5 xl:order-1">
          {searching$ ? (
            <div className="rounded-3xl border border-white/10 bg-white/[0.04] p-5 backdrop-blur-xl">
              <SectionTitle
                hint={`${hits.length} ${hits.length === 1 ? 'match' : 'matches'} for “${query}”`}
                right={
                  <button
                    type="button"
                    onClick={onClearQuery}
                    data-focus-ring
                    className="flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.05] px-3 py-2 text-xs font-medium text-slate-300 transition hover:border-indigo-400/40 hover:text-white"
                  >
                    <X className="h-3.5 w-3.5" aria-hidden="true" />
                    Clear search
                  </button>
                }
              >
                Semantic search
              </SectionTitle>

              <div className="mt-4 grid gap-4 sm:grid-cols-2 2xl:grid-cols-3">
                {searching
                  ? Array.from({ length: 3 }, (_, index) => <SkeletonCard key={index} />)
                  : hits.map((hit, index) => (
                      <SearchHitCard
                        key={`${hit.item_id}-${hit.chunk_idx}-${index}`}
                        hit={hit}
                        index={index}
                        onOpen={onOpenItem}
                      />
                    ))}
              </div>

              {!searching && hits.length === 0 ? (
                <div className="mt-4">
                  <EmptyState
                    compact
                    icon={ScanSearch}
                    title="Nothing matched that query"
                    description="Try different words, or search for what an item was about rather than the exact phrasing."
                  />
                </div>
              ) : null}
            </div>
          ) : (
            <>
              <div className="rounded-3xl border border-white/10 bg-white/[0.04] p-4 backdrop-blur-xl sm:p-5">
                <div className="flex flex-wrap items-center gap-2">
                  <FilterChip
                    active={kindFilter === 'all'}
                    label="All"
                    count={items.length}
                    icon={Sparkles}
                    onClick={() => setKindFilter('all')}
                  />
                  {KIND_ORDER.map((kind) => (
                    <FilterChip
                      key={kind}
                      active={kindFilter === kind}
                      label={KIND_META[kind].label}
                      count={kindCounts.get(kind) ?? 0}
                      icon={KIND_META[kind].icon}
                      onClick={() => setKindFilter(kind)}
                    />
                  ))}

                  <div className="ml-auto inline-flex shrink-0 rounded-full border border-white/10 bg-white/[0.03] p-1">
                    {SORTS.map((entry) => {
                      const active = sort === entry.id;
                      return (
                        <button
                          key={entry.id}
                          type="button"
                          onClick={() => setSort(entry.id)}
                          aria-pressed={active}
                          data-focus-ring
                          className={cn(
                            'relative rounded-full px-3 py-1.5 text-xs font-medium transition-colors',
                            active ? 'text-white' : 'text-slate-400 hover:text-white',
                          )}
                        >
                          {active ? (
                            <motion.span
                              layoutId="library-sort"
                              aria-hidden="true"
                              className="absolute inset-0 rounded-full bg-gradient-to-r from-indigo-500 to-violet-500"
                              transition={{ type: 'spring', stiffness: 420, damping: 34 }}
                            />
                          ) : null}
                          <span className="relative">{entry.label}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>

              {showSkeletons ? (
                <div className="grid gap-5 sm:grid-cols-2 2xl:grid-cols-3">
                  {Array.from({ length: 6 }, (_, index) => (
                    <SkeletonCard key={index} />
                  ))}
                </div>
              ) : sorted.length === 0 ? (
                <EmptyState
                  icon={Database}
                  title={kindFilter === 'all' ? 'Your brain is empty' : 'Nothing here yet'}
                  description={
                    kindFilter === 'all'
                      ? 'Drop in a PDF, an image, an audio clip, a video or a quick note. Everything becomes searchable and chat-ready.'
                      : `No ${KIND_META[kindFilter].plural.toLowerCase()} indexed yet. Add one from the panel, or switch back to “All”.`
                  }
                />
              ) : (
                <div className="grid gap-5 sm:grid-cols-2 2xl:grid-cols-3">
                  {sorted.map((item, index) => (
                    <ItemCard
                      key={item.id}
                      item={item}
                      index={index}
                      onOpen={(entry) => onOpenItem(entry.id)}
                      onReprocess={handleReprocess}
                      onDelete={handleDelete}
                    />
                  ))}
                </div>
              )}

              {hasProcessing ? (
                <p className="flex items-center justify-center gap-2 pt-1 text-xs text-slate-500">
                  <Loader2 className="h-3.5 w-3.5 animate-spin text-indigo-300" aria-hidden="true" />
                  Indexing in progress — this list refreshes automatically.
                </p>
              ) : null}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

interface FilterChipProps {
  active: boolean;
  label: string;
  count: number;
  icon: LucideIcon;
  onClick: () => void;
}

function FilterChip({ active, label, count, icon: Icon, onClick }: FilterChipProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      data-focus-ring
      className={cn(
        'flex items-center gap-2 rounded-full px-3.5 py-2 text-xs font-semibold transition',
        active
          ? 'bg-gradient-to-r from-indigo-500 to-violet-500 text-white shadow-[0_10px_30px_-14px_rgba(99,102,241,0.95)]'
          : 'border border-white/10 bg-white/[0.04] text-slate-300 hover:border-white/20 hover:text-white',
      )}
    >
      <Icon className="h-3.5 w-3.5" aria-hidden="true" />
      {label}
      <span className={cn('tabular-nums', active ? 'text-white/75' : 'text-slate-500')}>{count}</span>
    </button>
  );
}

interface StatsStripProps {
  health: Health | null;
  loading: boolean;
  fallbackItems: number;
  fallbackChunks: number;
  processing: number;
  kindCounts: Map<Kind, number>;
}

function StatsStrip({ health, loading, fallbackItems, fallbackChunks, processing, kindCounts }: StatsStripProps) {
  const tiles: Array<{ icon: LucideIcon; label: string; value: string; accent: string }> = [
    {
      icon: Database,
      label: 'Items',
      value: health ? String(health.items) : String(fallbackItems),
      accent: 'text-indigo-300',
    },
    {
      icon: Layers,
      label: 'Chunks',
      value: health ? String(health.chunks) : String(fallbackChunks),
      accent: 'text-violet-300',
    },
    {
      icon: Loader2,
      label: 'Indexing',
      value: String(processing),
      accent: processing > 0 ? 'text-amber-300' : 'text-slate-400',
    },
    {
      icon: health?.mode === 'gemini' ? Sparkles : TriangleAlert,
      label: 'Mode',
      value: health ? (health.mode === 'gemini' ? 'Gemini' : 'Local') : loading ? '…' : 'Offline',
      accent: health?.mode === 'gemini' ? 'text-emerald-300' : 'text-amber-300',
    },
  ];

  return (
    <div className="rounded-3xl border border-white/10 bg-white/[0.04] p-5 backdrop-blur-xl">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {tiles.map((tile) => {
          const Icon = tile.icon;
          return (
            <div key={tile.label} className="flex items-center gap-3 rounded-2xl border border-white/5 bg-white/[0.02] px-4 py-3">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-white/[0.05]">
                <Icon
                  className={cn('h-4 w-4', tile.accent, tile.label === 'Indexing' && processing > 0 && 'animate-spin')}
                  aria-hidden="true"
                />
              </span>
              <span className="min-w-0">
                <span className="block text-[0.66rem] font-medium uppercase tracking-wider text-slate-500">
                  {tile.label}
                </span>
                <span className="block truncate text-sm font-semibold text-white">{tile.value}</span>
              </span>
            </div>
          );
        })}
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-white/5 pt-4">
        {KIND_ORDER.map((kind) => {
          const meta = KIND_META[kind];
          const Icon = meta.icon;
          return (
            <span
              key={kind}
              className={cn('inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[0.7rem] font-medium', meta.badge)}
            >
              <Icon className="h-3 w-3" aria-hidden="true" />
              {meta.label}
              <span className="tabular-nums opacity-80">{kindCounts.get(kind) ?? 0}</span>
            </span>
          );
        })}
      </div>
    </div>
  );
}

interface SearchHitCardProps {
  hit: SearchHit;
  index: number;
  onOpen: (itemId: string) => void;
}

function SearchHitCard({ hit, index, onOpen }: SearchHitCardProps) {
  const meta = kindMeta(hit.kind);
  const Icon = meta.icon;

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      onOpen(hit.item_id);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.32, delay: Math.min(index * 0.03, 0.24), ease: [0.22, 1, 0.36, 1] }}
      role="button"
      tabIndex={0}
      aria-label={`Open ${hit.title}`}
      data-focus-ring
      onClick={() => onOpen(hit.item_id)}
      onKeyDown={handleKeyDown}
      className="flex cursor-pointer flex-col rounded-3xl border border-white/10 bg-white/[0.04] p-5 backdrop-blur-xl transition-all duration-300 hover:-translate-y-0.5 hover:border-white/20 hover:bg-white/[0.06] hover:shadow-[0_8px_40px_-12px_rgba(99,102,241,0.45)]"
    >
      <div className="flex items-start gap-3">
        <span className={cn('flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl', meta.tile)}>
          <Icon className="h-4 w-4" aria-hidden="true" />
        </span>
        <div className="min-w-0 flex-1">
          <h4 className="line-clamp-2 text-sm font-semibold leading-snug text-white">{hit.title}</h4>
          <p className="mt-1 text-[0.66rem] uppercase tracking-wider text-slate-500">
            {meta.label} · chunk {hit.chunk_idx}
          </p>
        </div>
      </div>
      <p className="mt-3.5 line-clamp-4 text-xs leading-relaxed text-slate-400">{hit.text}</p>
      <div className="mt-auto flex items-center justify-between pt-4 text-[0.68rem] text-slate-500">
        <span className="tabular-nums">score {hit.score.toFixed(3)}</span>
        <span className="text-indigo-300">Open item →</span>
      </div>
    </motion.div>
  );
}
