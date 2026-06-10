/** Squelette du dashboard chantier-first (timeline + fiche chantier). */
export default function DashboardLoading() {
  return (
    <div className="space-y-6 animate-pulse">
      {/* Timeline */}
      <section className="rounded-xl border bg-card shadow-sm">
        <div className="flex items-center justify-between border-b px-5 py-3">
          <div className="space-y-2">
            <div className="h-4 w-40 rounded bg-muted" />
            <div className="h-3 w-28 rounded bg-muted" />
          </div>
          <div className="h-7 w-36 rounded bg-muted" />
        </div>
        <div className="space-y-3 px-5 py-4">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="flex items-center gap-3">
              <div className="h-3 w-[140px] shrink-0 rounded bg-muted" />
              <div className="h-7 flex-1 rounded-md bg-muted" style={{ marginLeft: `${i * 8}%` }} />
            </div>
          ))}
        </div>
      </section>

      {/* Fiche chantier */}
      <section className="rounded-xl border bg-card shadow-sm">
        <div className="border-b px-5 py-3">
          <div className="h-5 w-56 rounded bg-muted" />
        </div>
        <div className="h-10 border-b" />
        <div className="grid grid-cols-1 gap-6 p-6 lg:grid-cols-3">
          <div className="space-y-4 lg:col-span-2">
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="h-24 rounded-lg border bg-muted/40" />
              ))}
            </div>
            <div className="h-48 rounded-lg border bg-muted/30" />
          </div>
          <div className="space-y-4">
            <div className="h-56 rounded-lg border bg-muted/30" />
            <div className="h-40 rounded-lg border bg-muted/30" />
          </div>
        </div>
      </section>
    </div>
  );
}
