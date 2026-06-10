export default function Loading() {
  return (
    <div className="space-y-3">
      <div className="flex items-baseline justify-between">
        <div className="h-6 w-64 animate-pulse rounded bg-muted" />
        <div className="h-3 w-48 animate-pulse rounded bg-muted" />
      </div>
      <div className="h-[78vh] animate-pulse rounded-lg border bg-muted/30" />
    </div>
  );
}
