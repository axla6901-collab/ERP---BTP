/** Skeleton de la rubrique Absences (bandeau + onglets + KPI + filtres + tableau). */
export default function Loading() {
  return (
    <div className="space-y-4">
      <div className="h-12 w-full animate-pulse rounded bg-muted/60" />
      <div className="flex gap-2 border-b pb-2">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-6 w-24 animate-pulse rounded bg-muted" />
        ))}
      </div>
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-24 animate-pulse rounded-xl bg-muted/60" />
        ))}
      </div>
      <div className="flex flex-wrap gap-2 rounded-xl border p-4">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="h-6 w-20 animate-pulse rounded-full bg-muted" />
        ))}
      </div>
      <div className="rounded-xl border">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="flex items-center gap-4 border-b p-3 last:border-0">
            <div className="h-4 w-36 animate-pulse rounded bg-muted/60" />
            <div className="h-4 w-28 animate-pulse rounded bg-muted/60" />
            <div className="h-4 w-40 animate-pulse rounded bg-muted/60" />
            <div className="ml-auto h-4 w-16 animate-pulse rounded bg-muted/60" />
          </div>
        ))}
      </div>
    </div>
  );
}
