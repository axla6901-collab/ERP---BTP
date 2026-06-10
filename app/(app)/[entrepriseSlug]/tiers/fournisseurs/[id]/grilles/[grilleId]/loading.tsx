/**
 * Skeleton pour l'édition d'une grille tarifaire existante.
 * Même structure que la création (en-tête + tableau de lignes).
 */
export default function Loading() {
  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <div className="h-6 w-72 animate-pulse rounded bg-muted" />
        <div className="h-4 w-80 animate-pulse rounded bg-muted/60" />
      </div>

      <div className="grid gap-4 rounded-md border bg-card p-4 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="space-y-1">
            <div className="h-3 w-24 animate-pulse rounded bg-muted/60" />
            <div className="h-9 w-full animate-pulse rounded bg-muted/40" />
          </div>
        ))}
      </div>

      <div className="rounded-md border">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="flex items-center gap-3 border-b p-3 last:border-0">
            <div className="h-9 flex-1 animate-pulse rounded bg-muted/40" />
            <div className="h-9 w-20 animate-pulse rounded bg-muted/40" />
            <div className="h-9 w-16 animate-pulse rounded bg-muted/40" />
          </div>
        ))}
      </div>
    </div>
  );
}
