import type { ReactNode } from 'react';
import { cn } from '../lib/utils';
import type { LucideIcon } from 'lucide-react';

interface EmptyStateProps {
  icon: LucideIcon;
  title: string;
  description?: ReactNode;
  action?: ReactNode;
  children?: ReactNode;
  className?: string;
  compact?: boolean;
}

export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  children,
  className,
  compact = false,
}: EmptyStateProps) {
  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center rounded-3xl border border-white/10 bg-white/[0.03] text-center backdrop-blur-xl',
        compact ? 'px-6 py-10' : 'px-6 py-16',
        className,
      )}
    >
      <div className="relative">
        <div
          aria-hidden="true"
          className="absolute inset-0 -z-10 rounded-3xl bg-gradient-to-br from-indigo-500/40 to-violet-500/40 blur-2xl"
        />
        <div className="flex h-14 w-14 items-center justify-center rounded-2xl border border-white/10 bg-gradient-to-br from-indigo-500/25 to-violet-500/25">
          <Icon className="h-6 w-6 text-indigo-200" aria-hidden="true" />
        </div>
      </div>
      <h3 className="mt-5 text-base font-semibold text-white">{title}</h3>
      <span
        aria-hidden="true"
        className="mx-auto mt-2.5 block h-[3px] w-12 rounded-full bg-gradient-to-r from-indigo-500 to-violet-500"
      />
      {description ? (
        <p className="mt-3 max-w-md text-sm leading-relaxed text-slate-400">{description}</p>
      ) : null}
      {action ? <div className="mt-5">{action}</div> : null}
      {children ? <div className="mt-6 w-full">{children}</div> : null}
    </div>
  );
}
