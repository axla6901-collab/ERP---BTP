/**
 * Skeleton pour le module Catalogue : conserve la nav d'onglets visible
 * pendant que le sous-contenu (liste articles, dashboard, etc.) charge.
 */
export default function Loading() {
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="h-6 w-40 animate-pulse rounded bg-muted" />
        <div className="h-9 w-32 animate-pulse rounded bg-muted" />
      </div>
      <div className="rounded-md border">
        <div className="border-b bg-muted/40 p-3">
          <div className="h-4 w-full animate-pulse rounded bg-muted/60" />
        </div>
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="flex items-center gap-4 border-b p-3 last:border-0">
            <div className="h-4 w-16 animate-pulse rounded bg-muted/60" />
            <div className="h-4 w-48 animate-pulse rounded bg-muted/60" />
            <div className="h-4 w-24 animate-pulse rounded bg-muted/60" />
            <div className="ml-auto h-4 w-20 animate-pulse rounded bg-muted/60" />
          </div>
        ))}
      </div>
    </div>
  );
}
