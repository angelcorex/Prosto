import { Hash } from 'lucide-react';

/** Channel chat skeleton shown while the page loads. */
export default function ChannelLoading() {
  return (
    <div className="deferred-skeleton flex min-w-0 flex-1 flex-col overflow-hidden">
      <div className="flex h-14 shrink-0 items-center gap-2 border-b border-border/20 px-4">
        <Hash className="h-5 w-5 text-muted-foreground/50" />
        <div className="h-3.5 w-28 animate-skeleton rounded" />
      </div>
      <div className="flex flex-1 flex-col justify-end gap-5 px-4 py-4">
        {Array.from({ length: 7 }).map((_, i) => (
          <div key={i} className="flex items-start gap-3">
            <div className="h-10 w-10 shrink-0 animate-skeleton rounded-full" />
            <div className="flex min-w-0 flex-1 flex-col gap-1.5">
              <div className="h-3 w-32 animate-skeleton rounded" />
              <div className="h-3 animate-skeleton rounded" style={{ width: `${40 + ((i * 17) % 50)}%` }} />
            </div>
          </div>
        ))}
      </div>
      <div className="px-4 pb-4">
        <div className="h-11 w-full animate-skeleton rounded-xl" />
      </div>
    </div>
  );
}
