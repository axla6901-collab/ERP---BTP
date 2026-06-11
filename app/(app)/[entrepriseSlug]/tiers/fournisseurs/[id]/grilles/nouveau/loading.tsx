/**
 * Skeleton pour la création d'une grille tarifaire : en-tête + tableau de
 * lignes. Évite le blanc pendant la 1re compilation Turbopack et les
 * requêtes parallèles (fournisseur + articles + unités).
 */
export default function Loading() {
  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <div className="h-6 w-72 animate-pulse rounded bg-muted" />
        <div className="h-4 w-96 animate-pulse rounded bg-muted/60" />
      </div>

      <div className="grid gap-4 rounded-md border bg-card p-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="space-y-1 lg:col-span-2">
          <div className="h-3 w-20 animate-pulse rounded bg-muted/60" />
          <div className="h-9 w-full animate-pulse rounded bg-muted/40" />
        </div>
        <div className="space-y-1">
          <div className="h-3 w-32 animate-pulse rounded bg-muted/60" />
          <div className="h-9 w-full animate-pulse rounded bg-muted/40" />
        </div>
        <div className="space-y-1">
          <div className="h-3 w-32 animate-pulse rounded bg-muted/60" />
          <div className="h-9 w-full animate-pulse rounded bg-muted/40" />
        </div>
      </div>

      <div className="rounded-md border">
        <div className="border-b bg-muted/40 p-3">
          <div className="h-4 w-full animate-pulse rounded bg-muted/60" />
        </div>
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="flex items-center gap-3 border-b p-3 last:border-0">
            <div className="h-9 w-[35%] animate-pulse rounded bg-muted/40" />
            <div className="h-9 w-[12%] animate-pulse rounded bg-muted/40" />
            <div className="h-9 w-[10%] animate-pulse rounded bg-muted/40" />
            <div className="h-9 w-[15%] animate-pulse rounded bg-muted/40" />
            <div className="h-9 w-[10%] animate-pulse rounded bg-muted/40" />
            <div className="h-9 flex-1 animate-pulse rounded bg-muted/40" />
          </div>
        ))}
      </div>
    </div>
  );
}
