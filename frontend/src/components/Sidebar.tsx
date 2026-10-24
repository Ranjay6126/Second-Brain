import { Brain, Database, Library, MessageSquare, TrendingUp, type LucideIcon } from 'lucide-react';
import type { Health } from '../lib/types';
import { cn } from '../lib/utils';

export type Tab = 'library' | 'chat' | 'insights';

interface NavEntry {
  id: Tab;
  label: string;
  hint: string;
  icon: LucideIcon;
}

const NAV: NavEntry[] = [
  { id: 'library', label: 'Library', hint: 'Everything you saved', icon: Library },
  { id: 'chat', label: 'Chat', hint: 'Ask your own knowledge', icon: MessageSquare },
  { id: 'insights', label: 'Insights', hint: 'Growth, tags & storage', icon: TrendingUp },
];

interface SidebarProps {
  tab: Tab;
  onTabChange: (tab: Tab) => void;
  health: Health | null;
}

export function Sidebar({ tab, onTabChange, health }: SidebarProps) {
  return (
    <>
      {/* Desktop rail */}
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-56 flex-col border-r border-gray-300 bg-white md:flex">
        <div className="flex items-center gap-2 border-b border-gray-200 px-4 py-4">
          <Brain className="h-5 w-5 shrink-0 text-gray-500" aria-hidden="true" />
          <p className="truncate text-sm font-semibold text-gray-900">Second Brain</p>
        </div>

        <nav className="flex-1 space-y-1 p-3" aria-label="Primary">
          {NAV.map((entry) => {
            const active = tab === entry.id;
            const Icon = entry.icon;
            return (
              <button
                key={entry.id}
                type="button"
                onClick={() => onTabChange(entry.id)}
                aria-current={active ? 'page' : undefined}
                data-focus-ring
                className={cn(
                  'flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-sm text-gray-700 transition-colors duration-150',
                  active ? 'bg-gray-100 font-medium text-gray-900' : 'hover:bg-gray-100',
                )}
              >
                <Icon className="h-4 w-4 shrink-0 text-gray-500" aria-hidden="true" />
                <span className="flex-1 truncate">{entry.label}</span>
              </button>
            );
          })}
        </nav>

        <div className="border-t border-gray-200 p-3">
          <div className="flex items-center gap-2 text-xs font-medium text-gray-500">
            <Database className="h-3.5 w-3.5" aria-hidden="true" />
            Backend
          </div>
          <p className="mt-2 text-sm font-medium text-gray-900">
            {health ? (health.provider === 'local' ? 'Local RAG' : health.provider) : '—'}
          </p>
          <p className="mt-0.5 text-xs text-gray-500">
            {health ? `${health.items} items · ${health.chunks} chunks` : 'connecting…'}
          </p>
        </div>
      </aside>

      {/* Mobile bottom bar */}
      <nav
        aria-label="Primary"
        className="fixed inset-x-0 bottom-0 z-40 flex items-stretch justify-around border-t border-gray-200 bg-white px-2 pb-1 pt-1 md:hidden"
      >
        {NAV.map((entry) => {
          const active = tab === entry.id;
          const Icon = entry.icon;
          return (
            <button
              key={entry.id}
              type="button"
              onClick={() => onTabChange(entry.id)}
              aria-current={active ? 'page' : undefined}
              data-focus-ring
              className={cn(
                'flex flex-1 flex-col items-center gap-1 rounded-md px-2 py-1.5 text-xs transition-colors duration-150',
                active ? 'font-medium text-gray-900' : 'text-gray-500',
              )}
            >
              <Icon className="h-5 w-5" aria-hidden="true" />
              {entry.label}
            </button>
          );
        })}
      </nav>
    </>
  );
}
