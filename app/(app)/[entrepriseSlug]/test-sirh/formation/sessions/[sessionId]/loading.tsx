/** Skeleton de la fiche session (bandeau + participants + rail). */
export default function Loading() {
  return (
    <div className="space-y-5">
      <div className="h-12 w-full animate-pulse rounded bg-muted/60" />
      <div className="flex flex-col gap-5 lg:flex-row lg:items-start">
        <div className="h-80 min-w-0 flex-1 animate-pulse rounded-xl border bg-muted/40" />
        <div className="h-80 animate-pulse rounded-xl border bg-muted/40 lg:w-80 lg:shrink-0" />
      </div>
    </div>
  );
}
