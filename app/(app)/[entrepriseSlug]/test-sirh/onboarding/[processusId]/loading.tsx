/** Skeleton de la fiche processus (bandeau + checklist + rail de synthèse). */
export default function Loading() {
  return (
    <div className="space-y-5">
      <div className="h-12 w-full animate-pulse rounded bg-muted/60" />
      <div className="flex flex-col gap-5 lg:flex-row lg:items-start">
        <div className="min-w-0 flex-1 rounded-xl border">
          <div className="border-b px-5 py-3">
            <div className="h-4 w-32 animate-pulse rounded bg-muted/60" />
          </div>
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="flex items-center gap-3 border-b px-5 py-3 last:border-0">
              <div className="size-4 animate-pulse rounded bg-muted" />
              <div className="h-4 w-56 animate-pulse rounded bg-muted/60" />
              <div className="ml-auto h-4 w-20 animate-pulse rounded bg-muted/60" />
            </div>
          ))}
        </div>
        <div className="space-y-3 rounded-xl border p-5 lg:w-80 lg:shrink-0">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="h-4 w-full animate-pulse rounded bg-muted/60" />
          ))}
        </div>
      </div>
    </div>
  );
}
