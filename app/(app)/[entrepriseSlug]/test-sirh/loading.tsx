/** Skeleton du tableau de bord Test SIRH (bandeau, 3 rangées de KPI, deux colonnes). */
export default function Loading() {
  return (
    <div className="space-y-5">
      <div className="h-12 w-full animate-pulse rounded bg-muted/60" />
      {Array.from({ length: 3 }).map((_, r) => (
        <div key={r} className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          {Array.from({ length: 4 }).map((__, i) => (
            <div key={i} className="h-24 animate-pulse rounded-xl bg-muted/60" />
          ))}
        </div>
      ))}
      <div className="flex flex-col gap-5 lg:flex-row">
        <div className="h-72 flex-1 animate-pulse rounded-xl bg-muted/40" />
        <div className="h-72 animate-pulse rounded-xl bg-muted/40 lg:w-96" />
      </div>
    </div>
  );
}
