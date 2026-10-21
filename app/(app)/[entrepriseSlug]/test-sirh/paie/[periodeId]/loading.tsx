/** Skeleton de la préparation de paie (bandeau + indicateurs + variables par collaborateur). */
export default function Loading() {
  return (
    <div className="space-y-4">
      <div className="h-12 w-full animate-pulse rounded bg-muted/60" />
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-20 animate-pulse rounded-xl border bg-muted/40" />
        ))}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <div className="h-8 w-64 animate-pulse rounded-lg bg-muted/60" />
        <div className="ml-auto h-8 w-72 animate-pulse rounded bg-muted/60" />
      </div>
      {Array.from({ length: 3 }).map((_, i) => (
        <div key={i} className="rounded-xl border">
          <div className="h-10 border-b px-4 py-2">
            <div className="h-4 w-48 animate-pulse rounded bg-muted/60" />
          </div>
          {Array.from({ length: 3 }).map((__, j) => (
            <div key={j} className="flex items-center gap-4 border-b p-3 last:border-0">
              <div className="h-4 w-28 animate-pulse rounded bg-muted/60" />
              <div className="h-4 w-56 animate-pulse rounded bg-muted/60" />
              <div className="ml-auto h-4 w-20 animate-pulse rounded bg-muted/60" />
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}
