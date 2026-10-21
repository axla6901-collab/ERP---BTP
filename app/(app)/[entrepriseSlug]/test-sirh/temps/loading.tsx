/** Skeleton de la feuille de temps (bandeau + onglets + indicateurs + grille hebdomadaire). */
export default function Loading() {
  return (
    <div className="space-y-4">
      <div className="h-12 w-full animate-pulse rounded bg-muted/60" />
      <div className="flex gap-2 border-b pb-2">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="h-6 w-24 animate-pulse rounded bg-muted" />
        ))}
      </div>
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-20 animate-pulse rounded-xl border bg-muted/40" />
        ))}
      </div>
      <div className="flex flex-col gap-2 sm:flex-row">
        <div className="h-8 w-56 animate-pulse rounded bg-muted/60" />
        <div className="h-8 w-56 animate-pulse rounded bg-muted/60" />
      </div>
      <div className="rounded-xl border">
        <div className="h-9 border-b bg-muted/40" />
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="flex items-start gap-3 border-b p-3 last:border-0">
            <div className="h-8 w-40 animate-pulse rounded bg-muted/60" />
            {Array.from({ length: 7 }).map((__, j) => (
              <div key={j} className="h-12 flex-1 animate-pulse rounded bg-muted/40" />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
