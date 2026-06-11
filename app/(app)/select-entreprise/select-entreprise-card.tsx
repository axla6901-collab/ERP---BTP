'use client';

import { Building2Icon, StarIcon } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useTransition } from 'react';

export function SelectEntrepriseCard({
  slug,
  raisonSociale,
  isDefault,
}: {
  slug: string;
  raisonSociale: string;
  isDefault: boolean;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  function handleClick() {
    startTransition(async () => {
      const res = await fetch('/api/entreprise/switch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ slug }),
      });
      if (!res.ok) return;
      router.push(`/${slug}/dashboard`);
      router.refresh();
    });
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={isPending}
      className="flex items-center gap-3 rounded-md border bg-card px-4 py-3 text-left transition-colors hover:bg-muted disabled:opacity-50"
    >
      <Building2Icon className="size-5 shrink-0 text-muted-foreground" />
      <div className="min-w-0 flex-1">
        <div className="truncate font-medium">{raisonSociale}</div>
        <div className="truncate text-xs text-muted-foreground">{slug}</div>
      </div>
      {isDefault && (
        <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-xs text-primary">
          <StarIcon className="size-3" />
          Par défaut
        </span>
      )}
    </button>
  );
}
