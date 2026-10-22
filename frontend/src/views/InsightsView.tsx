import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { motion } from 'framer-motion';
import {
  CalendarDays,
  FolderOpen,
  HardDrive,
  Hash,
  PieChart,
  Sparkles,
  TrendingUp,
  type LucideIcon,
} from 'lucide-react';
import { errorMessage, listItems } from '../lib/api';
import type { Health, Item, Kind } from '../lib/types';
import {
  KIND_META,
  KIND_ORDER,
  cn,
  dayKey,
  dayKeyFromDate,
  formatBytes,
  shortDayLabel,
} from '../lib/utils';
import { EmptyState } from '../components/EmptyState';
import { SectionTitle } from '../components/SectionTitle';
import { Skeleton } from '../components/Skeleton';
import { useToast } from '../components/Toast';

const DAYS = 14;
const BAR_MAX_HEIGHT = 132;

interface InsightsViewProps {
  health: Health | null;
  refreshToken: number;
}

export function InsightsView({ health, refreshToken }: InsightsViewProps) {
  const { toast } = useToast();
  const [items, setItems] = useState<Item[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await listItems({ limit: 500 });
      setItems(res.items);
    } catch (error) {
      toast(errorMessage(error), 'error');
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    void load();
  }, [load, refreshToken]);

  const perKind = useMemo(() => {
    const map = new Map<Kind, { count: number; bytes: number }>();
    for (const kind of KIND_ORDER) map.set(kind, { count: 0, bytes: 0 });
    for (const item of items) {
      const entry = map.get(item.kind);
      if (!entry) continue;
      entry.count += 1;
      entry.bytes += item.size_bytes;
    }
    return map;
  }, [items]);

  const maxKindCount = useMemo(
    () => Math.max(1, ...KIND_ORDER.map((kind) => perKind.get(kind)?.count ?? 0)),
    [perKind],
  );

  const days = useMemo(() => {
    const buckets: Array<{ key: string; count: number }> = [];
    const today = new Date();
    for (let offset = DAYS - 1; offset >= 0; offset -= 1) {
      const date = new Date(today.getFullYear(), today.getMonth(), today.getDate() - offset);
      buckets.push({ key: dayKeyFromDate(date), count: 0 });
    }
    const indexByKey = new Map(buckets.map((bucket, index) => [bucket.key, index]));
    for (const item of items) {
      const index = indexByKey.get(dayKey(item.created_at));
      if (index !== undefined) buckets[index].count += 1;
    }
    return buckets;
  }, [items]);

  const maxDayCount = useMemo(() => Math.max(1, ...days.map((day) => day.count)), [days]);

  const topTags = useMemo(() => {
    const counts = new Map<string, number>();
    for (const item of items) {
      for (const tag of item.tags) {
        const key = tag.trim();
        if (key === '') continue;
        counts.set(key, (counts.get(key) ?? 0) + 1);
      }
    }
    return [...counts.entries()]
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      .slice(0, 12)
      .map(([tag, count]) => ({ tag, count }));
  }, [items]);

  const storage = useMemo(() => {
    const total = items.reduce((sum, item) => sum + item.size_bytes, 0);
    const largest = items.reduce<Item | null>(
      (current, item) => (current === null || item.size_bytes > current.size_bytes ? item : current),
      null,
    );
    const segments = KIND_ORDER.map((kind) => ({
      kind,
      bytes: perKind.get(kind)?.bytes ?? 0,
      percent: total > 0 ? ((perKind.get(kind)?.bytes ?? 0) / total) * 100 : 0,
    })).filter((segment) => segment.bytes > 0);
    return { total, largest, segments, average: items.length > 0 ? total / items.length : 0 };
  }, [items, perKind]);

  const maxTagCount = Math.max(1, ...topTags.map((entry) => entry.count));
  const uniqueTagCount = useMemo(
    () => new Set(items.flatMap((item) => item.tags.map((tag) => tag.trim()).filter((tag) => tag !== ''))).size,
    [items],
  );

  if (loading && items.length === 0) {
    return (
      <div className="space-y-5">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 4 }, (_, index) => (
            <Skeleton key={index} className="h-20 rounded-3xl" />
          ))}
        </div>
        <div className="grid gap-5 lg:grid-cols-2">
          {Array.from({ length: 4 }, (_, index) => (
            <Skeleton key={index} className="h-72 rounded-3xl" />
          ))}
        </div>
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <EmptyState
        icon={PieChart}
        title="No insights yet"
        description="Once you start saving notes, documents and media, this page fills up with distribution, growth and storage analytics."
      />
    );
  }

  return (
    <div className="space-y-5">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <SummaryTile
          icon={FolderOpen}
          label="Items"
          value={health ? String(health.items) : String(items.length)}
          hint={`${items.length} loaded`}
          accent="text-indigo-300"
        />
        <SummaryTile
          icon={Sparkles}
          label="Chunks"
          value={health ? String(health.chunks) : String(items.reduce((sum, item) => sum + item.chunk_count, 0))}
          hint="indexed passages"
          accent="text-violet-300"
        />
        <SummaryTile
          icon={HardDrive}
          label="Storage"
          value={formatBytes(storage.total)}
          hint={storage.largest ? `largest: ${formatBytes(storage.largest.size_bytes)}` : 'no files'}
          accent="text-sky-300"
        />
        <SummaryTile
          icon={Hash}
          label="Unique tags"
          value={String(uniqueTagCount)}
          hint={topTags.length > 0 ? `top: #${topTags[0].tag}` : 'no tags yet'}
          accent="text-emerald-300"
        />
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        <Panel>
          <SectionTitle hint={`${items.length} items by media type`}>Distribution by kind</SectionTitle>
          <div className="mt-5 space-y-4">
            {KIND_ORDER.map((kind) => {
              const meta = KIND_META[kind];
              const Icon = meta.icon;
              const count = perKind.get(kind)?.count ?? 0;
              const percent = (count / maxKindCount) * 100;
              return (
                <div key={kind}>
                  <div className="flex items-center justify-between gap-3 text-xs">
                    <span className="flex items-center gap-2 font-medium text-slate-300">
                      <Icon className="h-3.5 w-3.5" aria-hidden="true" />
                      {meta.plural}
                    </span>
                    <span className="tabular-nums text-slate-400">
                      {count}
                      <span className="ml-1.5 text-slate-600">{formatBytes(perKind.get(kind)?.bytes ?? 0)}</span>
                    </span>
                  </div>
                  <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-white/[0.06]">
                    <motion.div
                      className={cn('h-full rounded-full', meta.bar)}
                      initial={{ width: 0 }}
                      animate={{ width: `${percent}%` }}
                      transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </Panel>

        <Panel>
          <SectionTitle hint={`Added per day · last ${DAYS} days`}>Growth</SectionTitle>
          <div className="mt-6 flex h-44 items-end gap-1.5">
            {days.map((day, index) => {
              const height = day.count === 0 ? 3 : Math.max(6, (day.count / maxDayCount) * BAR_MAX_HEIGHT);
              return (
                <div key={day.key} className="flex min-w-0 flex-1 flex-col items-center justify-end gap-2">
                  <motion.div
                    initial={{ height: 0 }}
                    animate={{ height }}
                    transition={{ duration: 0.5, delay: index * 0.02, ease: [0.22, 1, 0.36, 1] }}
                    title={`${day.count} ${day.count === 1 ? 'item' : 'items'} on ${shortDayLabel(day.key)}`}
                    className={cn(
                      'w-full rounded-t-lg',
                      day.count === 0
                        ? 'bg-white/10'
                        : 'bg-gradient-to-t from-indigo-500 to-violet-400 shadow-[0_0_20px_-6px_rgba(129,140,248,0.8)]',
                    )}
                  />
                  <span
                    className={cn(
                      'w-full truncate text-center text-[0.58rem] text-slate-500',
                      index % 2 === 1 && 'hidden sm:block',
                    )}
                  >
                    {shortDayLabel(day.key)}
                  </span>
                </div>
              );
            })}
          </div>
        </Panel>

        <Panel>
          <SectionTitle hint={topTags.length > 0 ? `${topTags.length} most used` : 'no tags yet'}>
            Top tags
          </SectionTitle>
          {topTags.length === 0 ? (
            <p className="mt-5 text-xs text-slate-500">
              Tag your items while uploading to see your recurring themes here.
            </p>
          ) : (
            <div className="mt-5 flex flex-wrap gap-2">
              {topTags.map((entry) => {
                const scale = 0.75 + (entry.count / maxTagCount) * 0.75;
                return (
                  <span
                    key={entry.tag}
                    style={{ fontSize: `${scale}rem` }}
                    className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/[0.05] px-3 py-1.5 text-slate-200 transition hover:border-indigo-400/40 hover:text-white"
                  >
                    #{entry.tag}
                    <span className="text-[0.68rem] tabular-nums text-indigo-300">{entry.count}</span>
                  </span>
                );
              })}
            </div>
          )}
        </Panel>

        <Panel>
          <SectionTitle hint="total bytes held by the backend">Storage</SectionTitle>
          <div className="mt-5 space-y-4">
            <div className="flex items-end justify-between gap-4">
              <div>
                <p className="text-2xl font-semibold tracking-tight text-white">{formatBytes(storage.total)}</p>
                <p className="mt-1 text-xs text-slate-500">
                  across {items.length} {items.length === 1 ? 'item' : 'items'} · avg {formatBytes(storage.average)}
                </p>
              </div>
              <TrendingUp className="h-5 w-5 shrink-0 text-indigo-300" aria-hidden="true" />
            </div>

            {storage.segments.length > 0 ? (
              <>
                <div className="flex h-3 w-full overflow-hidden rounded-full bg-white/[0.06]">
                  {storage.segments.map((segment) => (
                    <div
                      key={segment.kind}
                      title={`${KIND_META[segment.kind].label}: ${formatBytes(segment.bytes)}`}
                      style={{ width: `${segment.percent}%` }}
                      className={cn('h-full', KIND_META[segment.kind].bar)}
                    />
                  ))}
                </div>
                <div className="flex flex-wrap gap-x-4 gap-y-2">
                  {storage.segments.map((segment) => (
                    <span key={segment.kind} className="flex items-center gap-2 text-[0.7rem] text-slate-400">
                      <span
                        className={cn('h-2.5 w-2.5 rounded-full', KIND_META[segment.kind].bar)}
                        aria-hidden="true"
                      />
                      {KIND_META[segment.kind].label}
                      <span className="tabular-nums text-slate-500">{formatBytes(segment.bytes)}</span>
                    </span>
                  ))}
                </div>
              </>
            ) : null}

            {storage.largest ? (
              <div className="flex items-center gap-3 rounded-2xl border border-white/10 bg-white/[0.03] px-3.5 py-3">
                <CalendarDays className="h-4 w-4 shrink-0 text-slate-400" aria-hidden="true" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-xs text-slate-200" title={storage.largest.title}>
                    Largest: {storage.largest.title}
                  </span>
                  <span className="block text-[0.68rem] text-slate-500">
                    {formatBytes(storage.largest.size_bytes)} · {KIND_META[storage.largest.kind].label}
                  </span>
                </span>
              </div>
            ) : null}
          </div>
        </Panel>
      </div>
    </div>
  );
}

function Panel({ children }: { children: ReactNode }) {
  return <div className="rounded-3xl border border-white/10 bg-white/[0.04] p-5 backdrop-blur-xl">{children}</div>;
}

interface SummaryTileProps {
  icon: LucideIcon;
  label: string;
  value: string;
  hint: string;
  accent: string;
}

function SummaryTile({ icon: Icon, label, value, hint, accent }: SummaryTileProps) {
  return (
    <div className="rounded-3xl border border-white/10 bg-white/[0.04] p-5 backdrop-blur-xl">
      <div className="flex items-center gap-2 text-[0.66rem] font-medium uppercase tracking-wider text-slate-500">
        <Icon className={cn('h-3.5 w-3.5', accent)} aria-hidden="true" />
        {label}
      </div>
      <p className="mt-2 text-xl font-semibold tracking-tight text-white">{value}</p>
      <span
        aria-hidden="true"
        className="mt-2.5 block h-[3px] w-12 rounded-full bg-gradient-to-r from-indigo-500 to-violet-500"
      />
      <p className="mt-2 truncate text-[0.68rem] text-slate-500">{hint}</p>
    </div>
  );
}
