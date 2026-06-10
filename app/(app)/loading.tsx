/**
 * Loading skeleton générique pour les routes /(app)/*.
 * Next.js l'affiche instantanément pendant que la page principale rend
 * ses Server Components (récupération DB + render). Le résultat perçu :
 * la navigation paraît immédiate (la coque apparaît tout de suite),
 * le contenu se révèle ensuite.
 */
export default function Loading() {
  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <div className="h-8 w-48 animate-pulse rounded bg-muted" />
        <div className="h-4 w-72 animate-pulse rounded bg-muted/60" />
      </div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="rounded-lg border p-4">
            <div className="mb-3 h-5 w-32 animate-pulse rounded bg-muted" />
            <div className="space-y-2">
              <div className="h-3 w-full animate-pulse rounded bg-muted/60" />
              <div className="h-3 w-3/4 animate-pulse rounded bg-muted/60" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
