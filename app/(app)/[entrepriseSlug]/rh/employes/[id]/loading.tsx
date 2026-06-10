/**
 * Skeleton dédié au dossier employé (form en sections + 3 listes filles).
 */
export default function Loading() {
  return (
    <div className="space-y-6">
      <div className="h-6 w-72 animate-pulse rounded bg-muted" />
      {Array.from({ length: 4 }).map((_, i) => (
        <div key={i} className="rounded-md border p-4">
          <div className="mb-3 h-4 w-40 animate-pulse rounded bg-muted" />
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {Array.from({ length: 6 }).map((_, j) => (
              <div key={j} className="space-y-2">
                <div className="h-3 w-20 animate-pulse rounded bg-muted/60" />
                <div className="h-8 w-full animate-pulse rounded bg-muted/40" />
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
