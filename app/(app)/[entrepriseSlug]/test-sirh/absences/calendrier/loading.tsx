/** Skeleton du calendrier d'équipe (bandeau + onglets + filtres + grille mensuelle). */
export default function Loading() {
  return (
    <div className="space-y-4">
      <div className="h-12 w-full animate-pulse rounded bg-muted/60" />
      <div className="flex gap-2 border-b pb-2">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-6 w-24 animate-pulse rounded bg-muted" />
        ))}
      </div>
      <div className="flex flex-wrap gap-3">
        <div className="h-8 w-56 animate-pulse rounded bg-muted/60" />
        <div className="h-8 w-56 animate-pulse rounded bg-muted/60" />
      </div>
      <div className="overflow-hidden rounded-xl border">
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="flex items-center gap-1 border-b p-2 last:border-0">
            <div className="h-4 w-40 shrink-0 animate-pulse rounded bg-muted/60" />
            <div className="h-6 flex-1 animate-pulse rounded bg-muted/40" />
          </div>
        ))}
      </div>
    </div>
  );
}
