/** Skeleton de l'onglet Modèles (bandeau + onglets + blocs de modèles). */
export default function Loading() {
  return (
    <div className="space-y-4">
      <div className="h-12 w-full animate-pulse rounded bg-muted/60" />
      <div className="flex gap-2 border-b pb-2">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="h-6 w-20 animate-pulse rounded bg-muted" />
        ))}
      </div>
      {Array.from({ length: 2 }).map((_, i) => (
        <div key={i} className="rounded-xl border">
          <div className="flex items-center justify-between border-b px-5 py-3">
            <div className="h-4 w-48 animate-pulse rounded bg-muted/60" />
            <div className="h-7 w-32 animate-pulse rounded bg-muted" />
          </div>
          {Array.from({ length: 5 }).map((__, j) => (
            <div key={j} className="flex items-center gap-4 border-b px-5 py-2.5 last:border-0">
              <div className="h-4 w-6 animate-pulse rounded bg-muted/60" />
              <div className="h-4 w-64 animate-pulse rounded bg-muted/60" />
              <div className="ml-auto h-4 w-12 animate-pulse rounded bg-muted/60" />
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}
