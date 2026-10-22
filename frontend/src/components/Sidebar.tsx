import { motion } from 'framer-motion';
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
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 flex-col border-r border-white/10 bg-white/[0.03] backdrop-blur-2xl md:flex">
        <div className="flex items-center gap-3 px-5 pb-6 pt-6">
          <div className="relative">
            <div
              aria-hidden="true"
              className="absolute inset-0 rounded-2xl bg-gradient-to-br from-indigo-500 to-violet-500 blur-md opacity-60"
            />
            <div className="relative flex h-10 w-10 items-center justify-center rounded-2xl bg-gradient-to-br from-indigo-500 to-violet-500 shadow-[0_8px_30px_-8px_rgba(99,102,241,0.9)]">
              <Brain className="h-5 w-5 text-white" aria-hidden="true" />
            </div>
          </div>
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold tracking-tight text-white">Second Brain</p>
            <p className="truncate text-[0.7rem] text-slate-400">Multimodal knowledge</p>
          </div>
        </div>

        <nav className="flex-1 space-y-1.5 px-3" aria-label="Primary">
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
                  'group relative flex w-full items-center gap-3 rounded-2xl px-3 py-2.5 text-left text-sm font-medium transition-colors',
                  active ? 'text-white' : 'text-slate-400 hover:text-white',
                )}
              >
                {active ? (
                  <motion.span
                    layoutId="sidebar-active"
                    aria-hidden="true"
                    className="absolute inset-0 rounded-2xl border border-indigo-400/30 bg-gradient-to-r from-indigo-500/25 to-violet-500/20"
                    transition={{ type: 'spring', stiffness: 420, damping: 34 }}
                  />
                ) : (
                  <span
                    aria-hidden="true"
                    className="absolute inset-0 rounded-2xl opacity-0 transition-opacity group-hover:bg-white/5 group-hover:opacity-100"
                  />
                )}
                <Icon className={cn('relative h-4 w-4 shrink-0', active && 'text-indigo-200')} aria-hidden="true" />
                <span className="relative flex-1 truncate">{entry.label}</span>
              </button>
            );
          })}
        </nav>

        <div className="px-4 pb-5">
          <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-3">
            <div className="flex items-center gap-2 text-[0.7rem] font-medium uppercase tracking-wider text-slate-500">
              <Database className="h-3.5 w-3.5" aria-hidden="true" />
              Backend
            </div>
            <div className="mt-2 flex items-baseline gap-2">
              <span
                className={cn(
                  'text-sm font-semibold',
                  health?.mode === 'gemini' ? 'text-emerald-300' : 'text-amber-300',
                )}
              >
                {health ? (health.mode === 'gemini' ? 'Gemini' : 'Local') : '—'}
              </span>
              <span className="text-[0.7rem] text-slate-500">
                {health ? `${health.items} items · ${health.chunks} chunks` : 'connecting…'}
              </span>
            </div>
            <p className="mt-1.5 truncate text-[0.68rem] text-slate-500" title={health?.embed_model}>
              {health ? `emb: ${health.embed_model}` : ''}
            </p>
          </div>
        </div>
      </aside>

      {/* Mobile bottom bar */}
      <nav
        aria-label="Primary"
        className="fixed inset-x-0 bottom-0 z-40 flex items-stretch justify-around gap-1 border-t border-white/10 bg-void-900/85 px-2 pb-[max(env(safe-area-inset-bottom),0.25rem)] pt-1.5 backdrop-blur-2xl md:hidden"
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
                'flex flex-1 flex-col items-center gap-1 rounded-2xl px-2 py-2 text-[0.62rem] font-medium transition-colors',
                active
                  ? 'bg-gradient-to-b from-indigo-500/25 to-violet-500/10 text-white'
                  : 'text-slate-400 hover:text-white',
              )}
            >
              <Icon className={cn('h-5 w-5', active && 'text-indigo-200')} aria-hidden="true" />
              {entry.label}
            </button>
          );
        })}
      </nav>
    </>
  );
}
