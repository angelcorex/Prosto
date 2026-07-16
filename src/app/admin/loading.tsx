export default function AdminLoading() {
  return (
    <div className="animate-pulse">
      <div className="mb-6 space-y-2">
        <div className="h-6 w-40 rounded-lg bg-foreground/[0.06]" />
        <div className="h-4 w-64 rounded-lg bg-foreground/[0.04]" />
      </div>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-24 rounded-2xl border border-border/30 bg-foreground/[0.02]" />
        ))}
      </div>
      <div className="mt-4 h-56 rounded-2xl border border-border/30 bg-foreground/[0.02]" />
    </div>
  );
}
