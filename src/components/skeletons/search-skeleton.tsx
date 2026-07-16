import { Skeleton } from '@/components/ui';

function ResultRow() {
  return (
    <div className="flex items-center gap-3 py-3">
      <Skeleton className="h-10 w-10 rounded-full" />
      <div className="flex flex-1 flex-col gap-1.5">
        <Skeleton className="h-4 w-40" />
        <Skeleton className="h-3 w-24" />
      </div>
    </div>
  );
}

/** Mirrors the search input + results list layout. */
export function SearchSkeleton({ count = 6 }: { count?: number }) {
  return (
    <div className="flex flex-col" aria-busy="true" aria-label="Loading search results">
      <Skeleton className="h-10 w-full rounded-md" />
      <div className="mt-2 flex flex-col divide-y divide-border">
        {Array.from({ length: count }).map((_, i) => (
          <ResultRow key={i} />
        ))}
      </div>
    </div>
  );
}
