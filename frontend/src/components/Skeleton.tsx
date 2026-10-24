import { cn } from '../lib/utils';

export function Skeleton({ className }: { className?: string }) {
  return <div aria-hidden="true" className={cn('skeleton rounded', className)} />;
}

/** Placeholder matching the shape of an `ItemCard`. */
export function SkeletonCard() {
  return (
    <div className="rounded-md border border-gray-200 bg-white p-4">
      <div className="flex items-start gap-3">
        <Skeleton className="h-11 w-11 rounded" />
        <div className="flex-1 space-y-2">
          <Skeleton className="h-4 w-3/4" />
          <Skeleton className="h-3 w-1/3" />
        </div>
      </div>
      <div className="mt-4 space-y-2">
        <Skeleton className="h-3 w-full" />
        <Skeleton className="h-3 w-11/12" />
        <Skeleton className="h-3 w-2/3" />
      </div>
      <div className="mt-4 flex gap-2">
        <Skeleton className="h-6 w-16 rounded" />
        <Skeleton className="h-6 w-20 rounded" />
      </div>
      <div className="mt-5 flex items-center justify-between">
        <Skeleton className="h-3 w-24" />
        <Skeleton className="h-3 w-16" />
      </div>
    </div>
  );
}

/** Placeholder matching a conversation row in the chat rail. */
export function SkeletonConversationRow() {
  return (
    <div className="rounded-md border border-gray-200 p-3">
      <Skeleton className="h-3.5 w-2/3" />
      <Skeleton className="mt-3 h-3 w-1/3" />
    </div>
  );
}

/** Placeholder for the item detail drawer body. */
export function SkeletonDetail() {
  return (
    <div className="space-y-5">
      <div className="flex items-start gap-4">
        <Skeleton className="h-14 w-14 rounded" />
        <div className="flex-1 space-y-3">
          <Skeleton className="h-5 w-2/3" />
          <Skeleton className="h-3 w-1/2" />
        </div>
      </div>
      <Skeleton className="h-24 w-full rounded" />
      <div className="space-y-2">
        <Skeleton className="h-3 w-full" />
        <Skeleton className="h-3 w-full" />
        <Skeleton className="h-3 w-4/5" />
      </div>
    </div>
  );
}
