import { Skeleton } from '@/components/ui';

function Bubble({ align }: { align: 'start' | 'end' }) {
  return (
    <div className={align === 'end' ? 'flex justify-end' : 'flex justify-start'}>
      <Skeleton className={align === 'end' ? 'h-10 w-48 rounded-lg' : 'h-10 w-56 rounded-lg'} />
    </div>
  );
}

/** Mirrors the conversation thread layout (alternating message bubbles). */
export function MessagesSkeleton({ count = 6 }: { count?: number }) {
  return (
    <div className="flex flex-col gap-3" aria-busy="true" aria-label="Loading messages">
      {Array.from({ length: count }).map((_, i) => (
        <Bubble key={i} align={i % 2 === 0 ? 'start' : 'end'} />
      ))}
    </div>
  );
}
