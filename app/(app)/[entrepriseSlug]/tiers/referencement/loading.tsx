export default function Loading() {
  return (
    <div className="space-y-6">
      <div className="h-8 w-72 animate-pulse rounded-md bg-muted/40" />
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="h-24 animate-pulse rounded-xl border bg-muted/40" />
        ))}
      </div>
      <div className="h-64 animate-pulse rounded-xl border bg-muted/40" />
    </div>
  );
}
