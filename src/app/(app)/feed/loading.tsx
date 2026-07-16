import { Skeleton } from '@/components/ui';

/** Matches the new flat-feed layout (border-b dividers, 2-col avatar + content). */
function PostSkeleton() {
  return (
    <div className="flex gap-3 border-b border-border/20 px-4 py-4">
      <Skeleton className="h-8 w-8 shrink-0 rounded-full" />
      <div className="flex flex-1 flex-col gap-2">
        <div className="flex items-center gap-2">
          <Skeleton className="h-3.5 w-24" />
          <Skeleton className="h-3 w-16 opacity-60" />
        </div>
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-3/5" />
        <div className="mt-1 flex gap-4">
          <Skeleton className="h-3 w-7" />
          <Skeleton className="h-3 w-7" />
          <Skeleton className="h-3 w-7" />
        </div>
      </div>
    </div>
  );
}

export default function FeedLoading() {
  return (
    <div className="deferred-skeleton mx-auto w-full max-w-2xl" aria-busy="true">
      {/* Compose — matches the real compose box */}
      <div className="flex gap-3 border-b border-border/20 px-4 py-3.5">
        <Skeleton className="h-8 w-8 shrink-0 rounded-full" />
        <div className="flex-1 py-1">
          <Skeleton className="h-4 w-2/3" />
        </div>
      </div>
      {/* Tabs — pill style */}
      <div className="flex items-center gap-1 border-b border-border/20 px-4 py-2.5">
        <Skeleton className="h-6 w-16 rounded-full" />
        <Skeleton className="h-6 w-20 rounded-full opacity-50" />
      </div>
      {/* Posts */}
      {Array.from({ length: 5 }).map((_, i) => <PostSkeleton key={i} />)}
    </div>
  );
}
