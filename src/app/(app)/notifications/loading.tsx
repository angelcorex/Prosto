import { Skeleton } from '@/components/ui';

export default function NotificationsLoading() {
  return (
    <div className="deferred-skeleton mx-auto w-full max-w-2xl" aria-busy="true">
      <div className="border-b border-border/20 px-4 py-3.5">
        <Skeleton className="h-4 w-32" />
      </div>
      <div className="py-1">
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="flex items-center gap-3 px-4 py-3">
            <Skeleton className="h-9 w-9 shrink-0 rounded-full" />
            <div className="flex-1">
              <Skeleton className="mb-1.5 h-3.5 w-52" />
              <Skeleton className="h-3 w-16 opacity-50" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
