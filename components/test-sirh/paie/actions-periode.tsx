'use client';

import { BoutonConfirmation } from '@/components/test-sirh/bouton-confirmation';
import type { ActionResult } from '@/lib/common/action-result';
import { transitionsPeriode } from '@/lib/test-sirh/paie/periodes';
import type { StatutPeriodePaie } from '@/lib/validation/test-sirh/enums';
import type { StatutPeriodeInput } from '@/lib/validation/test-sirh/paie';

const MESSAGES_SUCCES: Record<StatutPeriodePaie, string> = {
  ouverte: 'Période rouverte à la saisie',
  en_controle: 'Période passée en contrôle',
  cloturee: 'Période clôturée',
};

/**
 * Boutons de cycle de vie d'une période (bandeau de la préparation de paie) :
 * passer en contrôle, revenir en saisie, clôturer, rouvrir (gestionnaires RH),
 * supprimer une période ouverte vide.
 */
export function ActionsPeriode({
  periodeId,
  statut,
  peutGerer,
  supprimable,
  cheminPaie,
  actions,
}: {
  periodeId: string;
  statut: StatutPeriodePaie;
  peutGerer: boolean;
  /** Période ouverte sans variable : suppression proposée. */
  supprimable: boolean;
  cheminPaie: string;
  actions: {
    changerStatut: (input: StatutPeriodeInput) => Promise<ActionResult>;
    supprimer: (id: string) => Promise<ActionResult>;
  };
}) {
  const transitions = transitionsPeriode(statut, { peutGerer });
  return (
    <div className="flex flex-wrap items-center gap-2">
      {supprimable && (
        <BoutonConfirmation
          libelle="Supprimer la période"
          question="Supprimer cette période vide ?"
          libelleConfirmer="Supprimer"
          messageSucces="Période supprimée"
          redirection={cheminPaie}
          onConfirm={() => actions.supprimer(periodeId)}
        />
      )}
      {transitions.map((t) => (
        <BoutonConfirmation
          key={t.vers}
          libelle={t.libelle}
          question={t.question}
          libelleConfirmer={t.libelle}
          messageSucces={MESSAGES_SUCCES[t.vers]}
          variante="default"
          onConfirm={() => actions.changerStatut({ id: periodeId, statut: t.vers })}
        />
      ))}
    </div>
  );
}
