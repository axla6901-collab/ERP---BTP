'use client';

import { useRouter } from 'next/navigation';
import { useTransition } from 'react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import {
  LIBELLES_STATUT_DEVIS,
  TRANSITIONS_STATUT_DEVIS,
  type StatutDevis,
} from '@/lib/validation/commercial';

/** Style du bouton selon la cible de transition.
 *  - valide/gagne        = action positive (default)
 *  - refuse/perdu/annule = action négative (destructive)
 *  - autres              = neutre (outline) */
function variantePour(t: StatutDevis): 'default' | 'destructive' | 'outline' {
  if (t === 'valide' || t === 'gagne') return 'default';
  if (t === 'refuse' || t === 'perdu' || t === 'annule') return 'destructive';
  return 'outline';
}

type Props = {
  devisId: string;
  statutCourant: StatutDevis;
  action: (
    id: string,
    nouveau: StatutDevis,
  ) => Promise<{ ok: boolean; error?: string }>;
};

export function ChangerStatut({ devisId, statutCourant, action }: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  // Fallback `[]` défensif : si statutCourant n'est pas dans la table
  // (statut DB inconnu ou import vide pendant HMR), on affiche le message
  // "statut final" plutôt que de crasher.
  const transitionsPossibles: readonly StatutDevis[] =
    TRANSITIONS_STATUT_DEVIS?.[statutCourant] ?? [];

  if (transitionsPossibles.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        Statut final : aucune transition possible.
      </p>
    );
  }

  function handle(nouveau: StatutDevis) {
    startTransition(async () => {
      const r = await action(devisId, nouveau);
      if (r.ok) {
        toast.success(`Statut → ${LIBELLES_STATUT_DEVIS[nouveau]}`);
        router.refresh();
      } else {
        toast.error(r.error ?? 'Erreur');
      }
    });
  }

  return (
    <div className="flex flex-wrap gap-2">
      {transitionsPossibles.map((t) => (
        <Button
          key={t}
          variant={variantePour(t)}
          size="sm"
          onClick={() => handle(t)}
          disabled={isPending}
        >
          Passer à « {LIBELLES_STATUT_DEVIS[t]} »
        </Button>
      ))}
    </div>
  );
}
