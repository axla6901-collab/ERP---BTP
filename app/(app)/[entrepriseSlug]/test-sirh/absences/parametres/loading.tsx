/** Skeleton des paramètres des absences (bandeau + onglets + trois sections). */
export default function Loading() {
  return (
    <div className="space-y-4">
      <div className="h-12 w-full animate-pulse rounded bg-muted/60" />
      <div className="flex gap-2 border-b pb-2">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-6 w-24 animate-pulse rounded bg-muted" />
        ))}
      </div>
      {Array.from({ length: 3 }).map((_, s) => (
        <div key={s} className="overflow-hidden rounded-xl border">
          <div className="space-y-2 px-5 py-3">
            <div className="h-4 w-40 animate-pulse rounded bg-muted" />
            <div className="h-3 w-72 animate-pulse rounded bg-muted/60" />
          </div>
          <div className="border-t px-5 py-4">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="flex items-center gap-4 py-2">
                <div className="h-4 w-40 animate-pulse rounded bg-muted/60" />
                <div className="h-4 w-24 animate-pulse rounded bg-muted/60" />
                <div className="ml-auto h-4 w-16 animate-pulse rounded bg-muted/60" />
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
