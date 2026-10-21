/** Skeleton du pipeline d'une offre (bandeau + KPI + colonnes du kanban). */
export default function Loading() {
  return (
    <div className="space-y-5">
      <div className="h-12 w-full animate-pulse rounded bg-muted/60" />
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-20 animate-pulse rounded-xl border bg-muted/40" />
        ))}
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-5">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="space-y-2 rounded-xl border bg-muted/30 p-2">
            <div className="h-5 w-28 animate-pulse rounded bg-muted" />
            {Array.from({ length: 2 }).map((__, j) => (
              <div key={j} className="h-24 animate-pulse rounded-lg border bg-card" />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
