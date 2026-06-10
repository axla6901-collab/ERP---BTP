/**
 * Skeleton minimal pour les pages d'auth (login, signup, etc.).
 * Affiché instantanément à la navigation.
 */
export default function Loading() {
  return (
    <div className="rounded-lg border bg-card p-6 shadow-sm">
      <div className="mb-2 h-7 w-40 animate-pulse rounded bg-muted" />
      <div className="mb-6 h-4 w-56 animate-pulse rounded bg-muted/60" />
      <div className="space-y-3">
        <div className="h-9 animate-pulse rounded bg-muted/60" />
        <div className="h-9 animate-pulse rounded bg-muted/60" />
        <div className="h-9 animate-pulse rounded bg-muted/60" />
      </div>
    </div>
  );
}
