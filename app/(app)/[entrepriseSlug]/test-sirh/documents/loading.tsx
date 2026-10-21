/** Skeleton de la GED RH (bandeau + rail des dossiers + tableau). */
export default function Loading() {
  return (
    <div className="space-y-4">
      <div className="h-12 w-full animate-pulse rounded bg-muted/60" />
      <div className="flex flex-col gap-5 lg:flex-row lg:items-start">
        <div className="space-y-2 rounded-xl border p-4 lg:w-72 lg:shrink-0">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="h-6 w-full animate-pulse rounded bg-muted/60" />
          ))}
        </div>
        <div className="min-w-0 flex-1 rounded-xl border">
          {Array.from({ length: 7 }).map((_, i) => (
            <div key={i} className="flex items-center gap-4 border-b p-3 last:border-0">
              <div className="h-4 w-48 animate-pulse rounded bg-muted/60" />
              <div className="h-4 w-28 animate-pulse rounded bg-muted/60" />
              <div className="h-4 w-24 animate-pulse rounded bg-muted/60" />
              <div className="ml-auto h-4 w-16 animate-pulse rounded bg-muted/60" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
