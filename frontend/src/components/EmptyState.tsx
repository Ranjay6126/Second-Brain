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
        'flex flex-col items-center justify-center rounded-md border border-gray-300 bg-white text-center',
        compact ? 'px-6 py-10' : 'px-6 py-16',
        className,
      )}
    >
      <Icon className="h-5 w-5 text-gray-500" aria-hidden="true" />
      <h3 className="mt-3 text-lg font-semibold text-gray-900">{title}</h3>
      {description ? (
        <p className="mt-2 max-w-md text-sm leading-relaxed text-gray-600">{description}</p>
      ) : null}
      {action ? <div className="mt-4">{action}</div> : null}
      {children ? <div className="mt-5 w-full">{children}</div> : null}
    </div>
  );
}
