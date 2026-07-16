import { Skeleton } from '@/components/ui';

function PostSkeleton() {
  return (
    <div className="flex gap-3 border-b border-border/20 px-4 py-4">
      <Skeleton className="h-8 w-8 shrink-0 rounded-full" />
      <div className="flex flex-1 flex-col gap-2">
        <div className="flex items-center gap-2">
          <Skeleton className="h-3.5 w-24" />
          <Skeleton className="h-3 w-16 opacity-50" />
        </div>
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-3/5" />
        <div className="mt-0.5 flex gap-4">
          <Skeleton className="h-3 w-7 opacity-60" />
          <Skeleton className="h-3 w-7 opacity-60" />
          <Skeleton className="h-3 w-7 opacity-60" />
        </div>
      </div>
    </div>
  );
}

export function FeedSkeleton({ count = 4 }: { count?: number }) {
  return (
    <div aria-busy="true" aria-label="Loading feed">
      {Array.from({ length: count }).map((_, i) => (
        <PostSkeleton key={i} />
      ))}
    </div>
  );
}
