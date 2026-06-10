export default function Loading() {
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="h-6 w-64 animate-pulse rounded bg-muted" />
        <div className="h-5 w-36 animate-pulse rounded bg-muted/60" />
      </div>
      <div className="flex gap-3 rounded-md border p-3">
        <div className="h-9 w-24 animate-pulse rounded bg-muted/40" />
        <div className="h-9 w-24 animate-pulse rounded bg-muted/40" />
        <div className="h-9 w-20 animate-pulse rounded bg-muted/40" />
      </div>
      <div className="rounded-md border">
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="flex items-center gap-4 border-b p-3 last:border-0">
            <div className="h-4 w-20 animate-pulse rounded bg-muted/60" />
            <div className="h-4 w-40 animate-pulse rounded bg-muted/60" />
            <div className="h-4 w-48 animate-pulse rounded bg-muted/60" />
            <div className="h-4 w-16 animate-pulse rounded bg-muted/60" />
            <div className="ml-auto h-4 w-12 animate-pulse rounded bg-muted/60" />
          </div>
        ))}
      </div>
    </div>
  );
}
