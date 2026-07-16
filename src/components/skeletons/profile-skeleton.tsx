import { Card, Skeleton } from '@/components/ui';
import { FeedSkeleton } from './feed-skeleton';

/** Mirrors the profile header + content layout. */
export function ProfileSkeleton() {
  return (
    <div className="flex flex-col gap-4" aria-busy="true" aria-label="Loading profile">
      <Card className="p-6">
        <div className="flex items-center gap-4">
          <Skeleton className="h-20 w-20 rounded-full" />
          <div className="flex flex-1 flex-col gap-2">
            <Skeleton className="h-6 w-48" />
            <Skeleton className="h-4 w-32" />
          </div>
        </div>
        <div className="mt-4 flex flex-col gap-2">
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-3/4" />
        </div>
      </Card>
      <FeedSkeleton count={3} />
    </div>
  );
}
