/**
 * Skeleton dédié à la matrice de saisie : reproduit la grille mensuelle
 * pour que le passage d'écran soit perceptiblement instantané.
 */
export default function Loading() {
  const jours = Array.from({ length: 31 });
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="h-6 w-56 animate-pulse rounded bg-muted" />
        <div className="h-9 w-40 animate-pulse rounded bg-muted/60" />
      </div>
      <div className="overflow-hidden rounded-md border">
        <div className="border-b bg-muted/30 p-2">
          <div className="flex gap-1">
            <div className="h-5 w-[11%] animate-pulse rounded bg-muted" />
            <div className="h-5 w-[5%] animate-pulse rounded bg-muted" />
            <div className="h-5 w-[16%] animate-pulse rounded bg-muted" />
            {jours.slice(0, 28).map((_, i) => (
              <div
                key={i}
                className="h-5 animate-pulse rounded bg-muted"
                style={{ width: 'calc(64% / 28)' }}
              />
            ))}
          </div>
        </div>
        {Array.from({ length: 5 }).map((_, row) => (
          <div key={row} className="flex gap-1 border-b p-1.5 last:border-0">
            <div className="h-6 w-[11%] animate-pulse rounded bg-muted/60" />
            <div className="h-6 w-[5%] animate-pulse rounded bg-muted/60" />
            <div className="h-6 w-[16%] animate-pulse rounded bg-muted/60" />
            {jours.slice(0, 28).map((_, i) => (
              <div
                key={i}
                className="h-6 animate-pulse rounded bg-muted/30"
                style={{ width: 'calc(64% / 28)' }}
              />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
