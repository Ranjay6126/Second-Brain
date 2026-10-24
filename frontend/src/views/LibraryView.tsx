import { useCallback, useEffect, useMemo, useState, type KeyboardEvent } from 'react';
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
            <div className="rounded-md border border-gray-300 bg-white p-5">
              <SectionTitle
                hint={`${hits.length} ${hits.length === 1 ? 'match' : 'matches'} for “${query}”`}
                right={
                  <button
                    type="button"
                    onClick={onClearQuery}
                    data-focus-ring
                    className="flex items-center gap-2 rounded-md border border-gray-300 bg-white px-3 py-2 text-xs text-gray-700 transition-colors duration-150 hover:bg-gray-50"
                  >
                    <X className="h-3.5 w-3.5" aria-hidden="true" />
                    Clear search
                  </button>
                }
              >
                Search results
              </SectionTitle>

              <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
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
                    title="No matches"
                    description="Try different words."
                  />
                </div>
              ) : null}
            </div>
          ) : (
            <>
              <div className="rounded-md border border-gray-300 bg-white p-4 sm:p-5">
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

                  <div className="ml-auto inline-flex shrink-0 rounded-md border border-gray-300 p-1">
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
                            'rounded-md px-3 py-1.5 text-xs transition-colors duration-150',
                            active ? 'bg-gray-100 font-medium text-gray-900' : 'text-gray-600 hover:bg-gray-50',
                          )}
                        >
                          {entry.label}
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>

              {showSkeletons ? (
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  {Array.from({ length: 6 }, (_, index) => (
                    <SkeletonCard key={index} />
                  ))}
                </div>
              ) : sorted.length === 0 ? (
                <EmptyState
                  icon={Database}
                  title="No items yet"
                  description={
                    kindFilter === 'all'
                      ? 'Upload a file to get started.'
                      : `No ${KIND_META[kindFilter].plural.toLowerCase()} yet.`
                  }
                />
              ) : (
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
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
                <p className="flex items-center justify-center gap-2 pt-1 text-xs text-gray-500">
                  <Loader2 className="h-3.5 w-3.5 text-gray-500" aria-hidden="true" />
                  Indexing in progress.
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
                'flex items-center gap-2 rounded-md border px-3 py-2 text-xs transition-colors duration-150',
                active
                  ? 'border-gray-300 bg-gray-100 font-medium text-gray-900'
                  : 'border-gray-300 bg-white text-gray-600 hover:bg-gray-50',
              )}
            >
              <Icon className="h-3.5 w-3.5 text-gray-500" aria-hidden="true" />
              {label}
              <span className="tabular-nums text-gray-500">{count}</span>
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
  const tiles: Array<{ icon: LucideIcon; label: string; value: string }> = [
    {
      icon: Database,
      label: 'Items',
      value: health ? String(health.items) : String(fallbackItems),
    },
    {
      icon: Layers,
      label: 'Chunks',
      value: health ? String(health.chunks) : String(fallbackChunks),
    },
    {
      icon: Loader2,
      label: 'Indexing',
      value: String(processing),
    },
    {
      icon: health?.provider !== 'local' && health ? Sparkles : TriangleAlert,
      label: 'Mode',
      value: health
        ? health.provider === 'local'
          ? 'Local RAG'
          : health.provider
        : loading
          ? '…'
          : 'Offline',
    },
  ];

  return (
    <div className="rounded-md border border-gray-200 bg-white p-5">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {tiles.map((tile) => {
          const Icon = tile.icon;
          return (
            <div key={tile.label} className="flex items-center gap-3 rounded-md border border-gray-200 bg-gray-50 px-4 py-3">
              <Icon className="h-4 w-4 shrink-0 text-gray-500" aria-hidden="true" />
              <span className="min-w-0">
                <span className="block text-xs text-gray-500">{tile.label}</span>
                <span className="block truncate text-sm font-semibold text-gray-900">{tile.value}</span>
              </span>
            </div>
          );
        })}
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-gray-200 pt-4">
        {KIND_ORDER.map((kind) => {
          const meta = KIND_META[kind];
          const Icon = meta.icon;
          return (
            <span
              key={kind}
              className="inline-flex items-center gap-1.5 rounded-md border border-gray-300 px-2 py-1 text-xs text-gray-600"
            >
              <Icon className="h-3 w-3 text-gray-500" aria-hidden="true" />
              {meta.label}
              <span className="tabular-nums text-gray-500">{kindCounts.get(kind) ?? 0}</span>
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

function SearchHitCard({ hit, onOpen }: SearchHitCardProps) {
  const meta = kindMeta(hit.kind);
  const Icon = meta.icon;

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      onOpen(hit.item_id);
    }
  };

  return (
    <div
      role="button"
      tabIndex={0}
      aria-label={`Open ${hit.title}`}
      data-focus-ring
      onClick={() => onOpen(hit.item_id)}
      onKeyDown={handleKeyDown}
      className="flex cursor-pointer flex-col rounded-md border border-gray-300 bg-white p-4 transition-colors duration-150 hover:border-gray-400"
    >
      <div className="flex items-start gap-3">
        <Icon className="mt-0.5 h-4 w-4 shrink-0 text-gray-500" aria-hidden="true" />
        <div className="min-w-0 flex-1">
          <h4 className="line-clamp-2 text-sm font-medium leading-snug text-gray-900">{hit.title}</h4>
          <p className="mt-1 text-xs text-gray-500">
            {meta.label} · chunk {hit.chunk_idx}
          </p>
        </div>
      </div>
      <p className="mt-3 line-clamp-4 text-xs leading-relaxed text-gray-600">{hit.text}</p>
      <div className="mt-auto flex items-center justify-between pt-4 text-xs text-gray-500">
        <span className="tabular-nums">score {hit.score.toFixed(3)}</span>
        <span>Open item →</span>
      </div>
    </div>
  );
}
