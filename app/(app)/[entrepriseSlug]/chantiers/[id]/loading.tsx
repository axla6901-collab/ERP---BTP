export default function Loading() {
  return (
    <div className="space-y-6">
      <div className="flex items-baseline justify-between">
        <div className="h-6 w-72 animate-pulse rounded bg-muted" />
        <div className="h-5 w-20 animate-pulse rounded-full bg-muted/60" />
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        {Array.from({ length: 2 }).map((_, i) => (
          <div key={i} className="rounded-md border p-4">
            <div className="mb-2 h-4 w-24 animate-pulse rounded bg-muted/60" />
            <div className="h-6 w-32 animate-pulse rounded bg-muted" />
          </div>
        ))}
      </div>
      <div className="rounded-md border p-4">
        <div className="mb-3 h-4 w-32 animate-pulse rounded bg-muted/60" />
        <div className="flex gap-2">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="h-8 w-32 animate-pulse rounded bg-muted/40" />
          ))}
        </div>
      </div>
    </div>
  );
}
