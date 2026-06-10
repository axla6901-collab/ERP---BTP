'use client';

import { StarIcon } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useTransition } from 'react';
import { toast } from 'sonner';

import { cn } from '@/lib/utils';

type Resultat = { ok: boolean; error?: string };

/**
 * Bouton étoile « favori » (catalogue, maquette 07). Bascule immédiate et
 * réversible (pas de confirmation) ; `router.refresh()` recharge les données.
 * `data-no-row-nav` n'est pas requis (un `<button>` est déjà exclu de la
 * navigation ligne du DataTable), mais on garde l'intention explicite.
 */
export function FavoriToggle({
  favori,
  action,
}: {
  favori: boolean;
  action: (favori: boolean) => Promise<Resultat>;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const cible = !favori;

  return (
    <button
      type="button"
      data-no-row-nav
      aria-pressed={favori}
      aria-label={favori ? 'Retirer des favoris' : 'Ajouter aux favoris'}
      title={favori ? 'Retirer des favoris' : 'Ajouter aux favoris'}
      disabled={isPending}
      onClick={() =>
        startTransition(async () => {
          const res = await action(cible);
          if (res.ok) {
            toast.success(cible ? 'Ajouté aux favoris' : 'Retiré des favoris');
            router.refresh();
          } else {
            toast.error(res.error ?? 'Impossible de modifier le favori.');
          }
        })
      }
      className={cn(
        'mx-auto inline-flex size-7 items-center justify-center rounded transition-colors hover:bg-muted disabled:opacity-50',
        favori ? 'text-amber-500' : 'text-muted-foreground hover:text-amber-500',
      )}
    >
      <StarIcon className={cn('size-4', favori && 'fill-amber-400')} aria-hidden="true" />
    </button>
  );
}
