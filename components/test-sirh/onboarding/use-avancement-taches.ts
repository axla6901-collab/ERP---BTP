import { useRouter } from 'next/navigation';
import { useOptimistic, useTransition } from 'react';
import { toast } from 'sonner';

import type { ActionResult } from '@/lib/common/action-result';
import type { EtatTache } from '@/lib/test-sirh/onboarding/planification';
import type { StatutTache } from '@/lib/validation/test-sirh/enums';

/**
 * Avancement des tâches côté client (checklist, « Mes tâches », liste) :
 * mise à jour optimiste du statut, appel de la server action, toast d'erreur
 * (le statut revient alors à sa valeur serveur) puis rafraîchissement.
 */
export function useAvancementTaches<
  T extends { id: string; statut: StatutTache; dateRealisation: string | null },
>(
  taches: T[],
  today: string,
  actions: {
    basculer?: (id: string, faite: boolean) => Promise<ActionResult<EtatTache>>;
    changerStatut?: (input: {
      id: string;
      statut: StatutTache;
    }) => Promise<ActionResult<EtatTache>>;
  },
) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [optimistes, appliquer] = useOptimistic(
    taches,
    (etat: T[], maj: { id: string; statut: StatutTache }) =>
      etat.map((t) =>
        t.id === maj.id
          ? {
              ...t,
              statut: maj.statut,
              dateRealisation: maj.statut === 'faite' ? (t.dateRealisation ?? today) : null,
            }
          : t,
      ),
  );

  function executer(
    maj: { id: string; statut: StatutTache },
    appel: () => Promise<ActionResult<EtatTache>>,
  ) {
    startTransition(async () => {
      appliquer(maj);
      const r = await appel();
      if (!r.ok) {
        toast.error(r.error);
        return;
      }
      router.refresh();
    });
  }

  function basculer(id: string, faite: boolean) {
    const action = actions.basculer;
    if (!action) return;
    executer({ id, statut: faite ? 'faite' : 'a_faire' }, () => action(id, faite));
  }

  function changerStatut(id: string, statut: StatutTache) {
    const action = actions.changerStatut;
    if (!action) return;
    executer({ id, statut }, () => action({ id, statut }));
  }

  return { taches: optimistes, basculer, changerStatut, isPending };
}
