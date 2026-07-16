import { Skeleton } from '@/components/ui';

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
      </div>
    </div>
  );
}

export default function ProfileLoading() {
  return (
    <div className="deferred-skeleton mx-auto w-full max-w-2xl md:pb-10" aria-busy="true">
      {/* Banner */}
      <Skeleton className="h-36 w-full sm:h-44" />
      {/* Avatar row — positioned over banner */}
      <div className="px-4">
        <div className="-mt-10 mb-3">
          <Skeleton className="h-20 w-20 rounded-full ring-2 ring-background" />
        </div>
        <Skeleton className="mb-1.5 h-5 w-40" />
        <Skeleton className="mb-2 h-3.5 w-28 opacity-60" />
        <Skeleton className="mb-3 h-4 w-3/4 opacity-70" />
        <div className="flex gap-4">
          <Skeleton className="h-3.5 w-20 opacity-60" />
          <Skeleton className="h-3.5 w-20 opacity-60" />
        </div>
      </div>
      {/* Posts */}
      <div className="mt-4">
        {Array.from({ length: 3 }).map((_, i) => <PostSkeleton key={i} />)}
      </div>
    </div>
  );
}
