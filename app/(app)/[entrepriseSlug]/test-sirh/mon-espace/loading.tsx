/** Skeleton de Mon espace (colonne principale + rail profil / annonces). */
export default function Loading() {
  return (
    <div className="space-y-5">
      <div className="h-12 w-full animate-pulse rounded bg-muted/60" />
      <div className="flex flex-col gap-5 lg:flex-row">
        <div className="flex-1 space-y-5">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-40 animate-pulse rounded-xl bg-muted/40" />
          ))}
        </div>
        <div className="space-y-5 lg:w-80">
          <div className="h-56 animate-pulse rounded-xl bg-muted/40" />
          <div className="h-40 animate-pulse rounded-xl bg-muted/40" />
        </div>
      </div>
    </div>
  );
}
