import { StatGrid } from '@/components/ui/stat-card';

/** Skeleton de la rubrique Onboarding › Processus (bandeau + onglets + KPI + cartes). */
export default function Loading() {
  return (
    <div className="space-y-4">
      <div className="h-12 w-full animate-pulse rounded bg-muted/60" />
      <div className="flex gap-2 border-b pb-2">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="h-6 w-20 animate-pulse rounded bg-muted" />
        ))}
      </div>
      <StatGrid>
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-20 animate-pulse rounded-xl border bg-muted/40" />
        ))}
      </StatGrid>
      <div className="flex flex-wrap gap-2">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-6 w-24 animate-pulse rounded-full bg-muted" />
        ))}
      </div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="space-y-3 rounded-xl border p-4">
            <div className="h-4 w-24 animate-pulse rounded bg-muted/60" />
            <div className="h-4 w-40 animate-pulse rounded bg-muted/60" />
            <div className="h-1.5 w-full animate-pulse rounded-full bg-muted" />
            <div className="h-4 w-32 animate-pulse rounded bg-muted/60" />
          </div>
        ))}
      </div>
    </div>
  );
}
