import { Skeleton } from '@/components/ui';

export default function FriendsLoading() {
  return (
    <div className="deferred-skeleton mx-auto w-full max-w-2xl">
      <div className="flex items-center gap-3 border-b border-border/30 px-4 py-3.5">
        <Skeleton className="h-5 w-5 rounded-md" />
        <Skeleton className="h-5 w-24" />
      </div>
      <div className="flex gap-2 border-b border-border/20 px-3 py-2">
        <Skeleton className="h-8 w-16 rounded-lg" />
        <Skeleton className="h-8 w-20 rounded-lg" />
      </div>
      <div className="space-y-1 px-3 py-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="flex items-center gap-3 px-2 py-2">
            <Skeleton className="h-10 w-10 rounded-full" />
            <div className="flex-1">
              <Skeleton className="h-4 w-32" />
              <Skeleton className="mt-1.5 h-3 w-20" />
            </div>
            <Skeleton className="h-9 w-9 rounded-full" />
          </div>
        ))}
      </div>
    </div>
  );
}
