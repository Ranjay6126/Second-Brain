import { useEffect, useRef, useState, type KeyboardEvent, type MouseEvent } from 'react';
import {
  Eye,
  Layers,
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

export function ItemCard({ item, onOpen, onReprocess, onDelete }: ItemCardProps) {
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
    <div
      role="button"
      tabIndex={0}
      aria-label={`Open ${item.title}`}
      data-focus-ring
      onClick={() => onOpen(item)}
      onKeyDown={handleKeyDown}
      className="relative flex h-full cursor-pointer flex-col rounded-md border border-gray-300 bg-white p-4 transition-colors duration-150 hover:border-gray-400"
    >
      <div className="flex items-start gap-2">
        <Icon className="mt-0.5 h-4 w-4 shrink-0 text-gray-500" aria-hidden="true" />
        <div className="min-w-0 flex-1">
          <h4 className="line-clamp-2 text-sm font-medium leading-snug text-gray-900" title={item.title}>
            {item.title}
          </h4>
          <p className="mt-1 text-xs text-gray-500">
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
            className="rounded-md p-1.5 text-gray-500 transition-colors duration-150 hover:bg-gray-100 hover:text-gray-700"
          >
            <MoreVertical className="h-4 w-4" aria-hidden="true" />
          </button>

          {menuOpen ? (
            <div
              role="menu"
              className="absolute right-0 top-9 z-20 w-52 overflow-hidden rounded-md border border-gray-300 bg-white p-1.5"
            >
              {confirming ? (
                <div className="p-2">
                  <p className="text-xs leading-snug text-gray-600">Delete this item permanently?</p>
                  <div className="mt-2.5 flex gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        closeMenu();
                        onDelete(item);
                      }}
                      className="flex-1 rounded-md border border-red-300 px-3 py-1.5 text-xs text-red-600 transition-colors duration-150 hover:bg-red-50"
                    >
                      Delete
                    </button>
                    <button
                      type="button"
                      onClick={() => setConfirming(false)}
                      className="flex-1 rounded-md border border-gray-300 bg-white px-3 py-1.5 text-xs text-gray-700 transition-colors duration-150 hover:bg-gray-50"
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
            </div>
          ) : null}
        </div>
      </div>

      <p className="mt-3.5 line-clamp-2 min-h-[2.4rem] text-xs leading-relaxed text-gray-600">
        {snippet !== '' ? snippet : 'No summary yet — open the item to see its contents.'}
      </p>

      {item.tags.length > 0 ? (
        <div className="mt-3 flex flex-wrap items-center gap-1.5">
          {item.tags.slice(0, 3).map((tag) => (
            <span
              key={tag}
              className="max-w-[9rem] truncate rounded-md border border-gray-200 bg-gray-50 px-2.5 py-1 text-xs text-gray-600"
            >
              #{tag}
            </span>
          ))}
          {item.tags.length > 3 ? (
            <span className="rounded-md bg-gray-100 px-2 py-1 text-xs text-gray-500">
              +{item.tags.length - 3}
            </span>
          ) : null}
        </div>
      ) : null}

      <div className="mt-auto flex items-center justify-between gap-2 pt-4">
        <div className="flex items-center gap-2 text-xs text-gray-500">
          <span>{relativeTime(item.created_at)}</span>
          <span aria-hidden="true">·</span>
          <span className="inline-flex items-center gap-1">
            <Layers className="h-3 w-3" aria-hidden="true" />
            {item.chunk_count} {item.chunk_count === 1 ? 'chunk' : 'chunks'}
          </span>
        </div>
        <StatusBadge item={item} />
      </div>
    </div>
  );
}

function StatusBadge({ item }: { item: Item }) {
  if (item.status === 'processing') {
    return (
      <span
        className="inline-flex shrink-0 items-center rounded-md border border-blue-300 px-2 py-1 text-xs text-blue-700"
        title={item.status}
      >
        Indexing…
      </span>
    );
  }

  if (item.status === 'failed') {
    return (
      <span
        className="inline-flex shrink-0 items-center gap-1 rounded-md border border-red-300 px-2 py-1 text-xs text-red-700"
        title={item.error ?? 'Processing failed'}
      >
        <TriangleAlert className="h-3.5 w-3.5" aria-hidden="true" />
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
        'flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-left text-xs transition-colors duration-150',
        danger ? 'text-red-600 hover:bg-red-50' : 'text-gray-700 hover:bg-gray-100',
      )}
    >
      <Icon className="h-3.5 w-3.5" aria-hidden="true" />
      {label}
    </button>
  );
}
