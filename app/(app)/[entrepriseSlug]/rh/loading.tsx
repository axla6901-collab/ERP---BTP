export default function Loading() {
  return (
    <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="h-24 animate-pulse rounded bg-muted/60" />
        ))}
      </div>
      <div className="rounded-md border">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="flex items-center gap-4 border-b p-3 last:border-0">
            <div className="h-4 w-16 animate-pulse rounded bg-muted/60" />
            <div className="h-4 w-48 animate-pulse rounded bg-muted/60" />
            <div className="h-4 w-32 animate-pulse rounded bg-muted/60" />
            <div className="ml-auto h-4 w-24 animate-pulse rounded bg-muted/60" />
          </div>
        ))}
      </div>
    </div>
  );
}
