import { Skeleton } from '@/components/ui';

export default function SearchLoading() {
  return (
    <div className="deferred-skeleton flex h-full flex-col" aria-busy="true">
      <div className="border-b border-border/20 px-4 py-3">
        <Skeleton className="h-8 w-full rounded-lg" />
      </div>
      <div className="flex flex-col py-1">
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="flex items-center gap-3 px-4 py-3">
            <Skeleton className="h-9 w-9 shrink-0 rounded-full" />
            <div className="flex flex-1 flex-col gap-1.5">
              <Skeleton className="h-3.5 w-36" />
              <Skeleton className="h-3 w-20 opacity-50" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
