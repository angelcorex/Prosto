import { Card, Skeleton } from '@/components/ui';

function SettingRow() {
  return (
    <div className="flex items-center justify-between py-4">
      <div className="flex flex-col gap-1.5">
        <Skeleton className="h-4 w-40" />
        <Skeleton className="h-3 w-56" />
      </div>
      <Skeleton className="h-8 w-16 rounded-md" />
    </div>
  );
}

/** Mirrors the grouped settings sections layout. */
export function SettingsSkeleton({ count = 5 }: { count?: number }) {
  return (
    <Card className="p-6" aria-busy="true" aria-label="Loading settings">
      <Skeleton className="h-6 w-32" />
      <div className="mt-2 flex flex-col divide-y divide-border">
        {Array.from({ length: count }).map((_, i) => (
          <SettingRow key={i} />
        ))}
      </div>
    </Card>
  );
}
