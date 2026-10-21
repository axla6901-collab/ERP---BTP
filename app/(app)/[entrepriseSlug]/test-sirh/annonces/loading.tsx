/** Skeleton de la page Annonces (bandeau + fil d'actualité). */
export default function Loading() {
  return (
    <div className="space-y-4">
      <div className="h-12 w-full animate-pulse rounded bg-muted/60" />
      <div className="flex flex-wrap gap-2">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="h-6 w-24 animate-pulse rounded-full bg-muted" />
        ))}
      </div>
      {Array.from({ length: 4 }).map((_, i) => (
        <div key={i} className="space-y-2 rounded-xl border p-4">
          <div className="flex gap-2">
            <div className="h-5 w-20 animate-pulse rounded bg-muted" />
            <div className="h-5 w-24 animate-pulse rounded bg-muted/60" />
          </div>
          <div className="h-5 w-2/3 animate-pulse rounded bg-muted/60" />
          <div className="h-4 w-full animate-pulse rounded bg-muted/40" />
          <div className="h-4 w-5/6 animate-pulse rounded bg-muted/40" />
        </div>
      ))}
    </div>
  );
}
