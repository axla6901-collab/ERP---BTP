export default function AdministrationLoading() {
  return (
    <div className="space-y-4">
      <div className="h-24 animate-pulse rounded-md border bg-muted/40" />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {[1, 2, 3].map((i) => (
          <div key={i} className="h-32 animate-pulse rounded-md border bg-muted/40" />
        ))}
      </div>
    </div>
  );
}
