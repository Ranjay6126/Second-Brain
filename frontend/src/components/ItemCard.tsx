import { useEffect, useRef, useState, type KeyboardEvent, type MouseEvent } from 'react';
import { motion } from 'framer-motion';
import {
  Eye,
  Layers,
  Loader2,
  MoreVertical,
  RefreshCw,
  Trash2,
  TriangleAlert,
  type LucideIcon,
} from 'lucide-react';
import type { Item } from '../lib/types';
import { cn, kindMeta, relativeTime } from '../lib/utils';

interface ItemCardProps {
  item: Item;
  index?: number;
  onOpen: (item: Item) => void;
  onReprocess: (item: Item) => void;
  onDelete: (item: Item) => void;
}

export function ItemCard({ item, index = 0, onOpen, onReprocess, onDelete }: ItemCardProps) {
  const meta = kindMeta(item.kind);
  const Icon = meta.icon;
  const [menuOpen, setMenuOpen] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!menuOpen) return;

    const handlePointer = (event: globalThis.MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setMenuOpen(false);
        setConfirming(false);
      }
    };
    const handleKey = (event: globalThis.KeyboardEvent) => {
      if (event.key === 'Escape') {
        setMenuOpen(false);
        setConfirming(false);
      }
    };

    document.addEventListener('mousedown', handlePointer);
    document.addEventListener('keydown', handleKey);
    return () => {
      document.removeEventListener('mousedown', handlePointer);
      document.removeEventListener('keydown', handleKey);
    };
  }, [menuOpen]);

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      onOpen(item);
    }
  };

  const stop = (event: MouseEvent) => {
    event.stopPropagation();
  };

  const closeMenu = () => {
    setMenuOpen(false);
    setConfirming(false);
  };

  const snippet = item.summary?.trim() ?? '';

  return (
    <motion.div
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.34, delay: Math.min(index * 0.03, 0.28), ease: [0.22, 1, 0.36, 1] }}
      role="button"
      tabIndex={0}
      aria-label={`Open ${item.title}`}
      data-focus-ring
      onClick={() => onOpen(item)}
      onKeyDown={handleKeyDown}
      className="group relative flex h-full cursor-pointer flex-col rounded-3xl border border-white/10 bg-white/[0.04] p-5 backdrop-blur-xl transition-all duration-300 hover:-translate-y-0.5 hover:border-white/20 hover:bg-white/[0.06] hover:shadow-[0_8px_40px_-12px_rgba(99,102,241,0.45)]"
    >
      <div className="flex items-start gap-3">
        <div className={cn('flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl', meta.tile)}>
          <Icon className="h-5 w-5" aria-hidden="true" />
        </div>
        <div className="min-w-0 flex-1">
          <h4 className="line-clamp-2 text-sm font-semibold leading-snug text-white" title={item.title}>
            {item.title}
          </h4>
          <p className="mt-1 text-[0.68rem] uppercase tracking-wider text-slate-500">
            {meta.label}
            {item.mime ? ` · ${item.mime.split('/')[1] ?? ''}` : ''}
          </p>
        </div>

        <div className="relative shrink-0" ref={menuRef} onClick={stop}>
          <button
            type="button"
            aria-label={`Actions for ${item.title}`}
            aria-haspopup="menu"
            aria-expanded={menuOpen}
            data-focus-ring
            onClick={() => {
              setMenuOpen((open) => !open);
              setConfirming(false);
            }}
            className="rounded-full p-1.5 text-slate-400 transition hover:bg-white/10 hover:text-white"
          >
            <MoreVertical className="h-4 w-4" aria-hidden="true" />
          </button>

          {menuOpen ? (
            <motion.div
              role="menu"
              initial={{ opacity: 0, y: -6, scale: 0.97 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              transition={{ duration: 0.16, ease: [0.22, 1, 0.36, 1] }}
              className="absolute right-0 top-9 z-20 w-52 overflow-hidden rounded-2xl border border-white/10 bg-void-850/95 p-1.5 shadow-[0_20px_60px_-20px_rgba(2,6,23,0.95)] backdrop-blur-2xl"
            >
              {confirming ? (
                <div className="p-2">
                  <p className="text-xs leading-snug text-slate-300">Delete this item permanently?</p>
                  <div className="mt-2.5 flex gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        closeMenu();
                        onDelete(item);
                      }}
                      className="flex-1 rounded-full bg-rose-500/90 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-rose-500"
                    >
                      Delete
                    </button>
                    <button
                      type="button"
                      onClick={() => setConfirming(false)}
                      className="flex-1 rounded-full border border-white/10 bg-white/[0.05] px-3 py-1.5 text-xs font-medium text-slate-300 transition hover:bg-white/10 hover:text-white"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (
                <>
                  <MenuButton
                    icon={Eye}
                    label="Open"
                    onClick={() => {
                      closeMenu();
                      onOpen(item);
                    }}
                  />
                  <MenuButton
                    icon={RefreshCw}
                    label="Reprocess"
                    onClick={() => {
                      closeMenu();
                      onReprocess(item);
                    }}
                  />
                  <MenuButton icon={Trash2} label="Delete" danger onClick={() => setConfirming(true)} />
                </>
              )}
            </motion.div>
          ) : null}
        </div>
      </div>

      <p className="mt-3.5 line-clamp-2 min-h-[2.4rem] text-xs leading-relaxed text-slate-400">
        {snippet !== '' ? snippet : 'No summary yet — open the item to see its contents.'}
      </p>

      {item.tags.length > 0 ? (
        <div className="mt-3 flex flex-wrap items-center gap-1.5">
          {item.tags.slice(0, 3).map((tag) => (
            <span
              key={tag}
              className="max-w-[9rem] truncate rounded-full border border-white/10 bg-white/[0.05] px-2.5 py-1 text-[0.68rem] text-slate-300"
            >
              #{tag}
            </span>
          ))}
          {item.tags.length > 3 ? (
            <span className="rounded-full bg-white/[0.05] px-2 py-1 text-[0.68rem] text-slate-500">
              +{item.tags.length - 3}
            </span>
          ) : null}
        </div>
      ) : null}

      <div className="mt-auto flex items-center justify-between gap-2 pt-4">
        <div className="flex items-center gap-2 text-[0.68rem] text-slate-500">
          <span>{relativeTime(item.created_at)}</span>
          <span aria-hidden="true">·</span>
          <span className="inline-flex items-center gap-1">
            <Layers className="h-3 w-3" aria-hidden="true" />
            {item.chunk_count} {item.chunk_count === 1 ? 'chunk' : 'chunks'}
          </span>
        </div>
        <StatusBadge item={item} />
      </div>
    </motion.div>
  );
}

function StatusBadge({ item }: { item: Item }) {
  if (item.status === 'processing') {
    return (
      <span
        className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-indigo-400/25 bg-indigo-500/10 px-2.5 py-1 text-[0.66rem] font-medium text-indigo-200"
        title={item.status}
      >
        <Loader2 className="h-3 w-3 animate-spin" aria-hidden="true" />
        Indexing…
      </span>
    );
  }

  if (item.status === 'failed') {
    return (
      <span
        className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-rose-400/30 bg-rose-500/10 px-2.5 py-1 text-[0.66rem] font-medium text-rose-200"
        title={item.error ?? 'Processing failed'}
      >
        <TriangleAlert className="h-3 w-3" aria-hidden="true" />
        Failed
      </span>
    );
  }

  return null;
}

interface MenuButtonProps {
  icon: LucideIcon;
  label: string;
  onClick: () => void;
  danger?: boolean;
}

function MenuButton({ icon: Icon, label, onClick, danger = false }: MenuButtonProps) {
  return (
    <button
      type="button"
      role="menuitem"
      onClick={onClick}
      className={cn(
        'flex w-full items-center gap-2.5 rounded-xl px-2.5 py-2 text-left text-xs font-medium transition',
        danger ? 'text-rose-300 hover:bg-rose-500/15' : 'text-slate-300 hover:bg-white/10 hover:text-white',
      )}
    >
      <Icon className="h-3.5 w-3.5" aria-hidden="true" />
      {label}
    </button>
  );
}
