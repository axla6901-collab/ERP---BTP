/** Skeleton du dossier collaborateur (bandeau + suite de sections). */
export default function Loading() {
  return (
    <div className="space-y-5">
      <div className="h-14 w-full animate-pulse rounded bg-muted/60" />
      {Array.from({ length: 4 }).map((_, i) => (
        <section key={i} className="overflow-hidden rounded-xl border bg-card">
          <div className="px-5 py-3">
            <div className="h-4 w-32 animate-pulse rounded bg-orange-100 dark:bg-orange-950/40" />
          </div>
          <div className="space-y-2 border-t px-5 py-4">
            <div className="h-4 w-2/3 animate-pulse rounded bg-muted/60" />
            <div className="h-4 w-1/2 animate-pulse rounded bg-muted/60" />
            <div className="h-4 w-3/5 animate-pulse rounded bg-muted/60" />
          </div>
        </section>
      ))}
    </div>
  );
}
