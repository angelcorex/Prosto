import { Skeleton } from '@/components/ui';

function MsgBubble({ own, lines = 1 }: { own?: boolean; lines?: number }) {
  return (
    <div className={`flex gap-3 ${own ? 'flex-row-reverse' : ''} mt-5 px-4`}>
      {!own && <Skeleton className="h-9 w-9 shrink-0 rounded-full" />}
      <div className={`flex flex-col gap-1.5 ${own ? 'items-end' : ''}`}>
        {!own && <Skeleton className="h-3 w-20" />}
        <Skeleton className={`h-9 ${own ? 'w-44' : 'w-56'} rounded-2xl`} />
        {lines > 1 && <Skeleton className={`h-5 ${own ? 'w-32' : 'w-36'} rounded-2xl`} />}
      </div>
    </div>
  );
}

export default function ConversationLoading() {
  return (
    <div className="deferred-skeleton flex h-full min-w-0 flex-1 flex-col" aria-busy="true">
      {/* Header */}
      <div className="flex h-14 shrink-0 items-center gap-3 border-b border-border/20 px-4">
        <Skeleton className="h-7 w-7 rounded-full" />
        <div className="flex flex-col gap-1.5">
          <Skeleton className="h-3.5 w-28" />
          <Skeleton className="h-3 w-16 opacity-50" />
        </div>
      </div>
      {/* Messages */}
      <div className="flex flex-1 flex-col justify-end overflow-hidden pb-2">
        <MsgBubble />
        <MsgBubble own lines={2} />
        <MsgBubble lines={2} />
        <MsgBubble own />
        <MsgBubble />
        <MsgBubble own />
        <MsgBubble lines={2} />
      </div>
      {/* Input */}
      <div className="shrink-0 px-4 pb-4 pt-2">
        <Skeleton className="h-10 w-full rounded-xl" />
      </div>
    </div>
  );
}
