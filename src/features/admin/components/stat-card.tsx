import type { ReactNode } from 'react';

import { cn } from '@/lib/utils/cn';

/**
 * A single dashboard metric. Server-renderable (no client hooks) so the
 * dashboard page can compose it directly from RPC data.
 */
export function StatCard({
  label,
  value,
  hint,
  icon,
  className,
}: {
  label: string;
  value: ReactNode;
  hint?: string;
  icon?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('rounded-2xl border border-border/30 bg-foreground/[0.02] p-4', className)}>
      <div className="flex items-center justify-between">
        <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground/60">{label}</p>
        {icon && <span className="text-muted-foreground/40">{icon}</span>}
      </div>
      <p className="mt-2 text-2xl font-semibold tabular-nums text-foreground">{value}</p>
      {hint && <p className="mt-0.5 text-xs text-muted-foreground/50">{hint}</p>}
    </div>
  );
}
