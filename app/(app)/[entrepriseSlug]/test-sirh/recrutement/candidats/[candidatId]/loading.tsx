/** Skeleton de la fiche candidat (bandeau + sections principales + rail). */
export default function Loading() {
  return (
    <div className="space-y-5">
      <div className="h-12 w-full animate-pulse rounded bg-muted/60" />
      <div className="flex flex-col gap-5 lg:flex-row lg:items-start">
        <div className="min-w-0 flex-1 space-y-5">
          <div className="h-40 animate-pulse rounded-xl border bg-muted/30" />
          <div className="h-56 animate-pulse rounded-xl border bg-muted/30" />
        </div>
        <div className="space-y-5 lg:w-80 lg:shrink-0">
          <div className="h-36 animate-pulse rounded-xl border bg-muted/30" />
          <div className="h-36 animate-pulse rounded-xl border bg-muted/30" />
        </div>
      </div>
    </div>
  );
}
