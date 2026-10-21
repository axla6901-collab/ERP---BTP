'use client';

import { CheckCircle2Icon } from 'lucide-react';

import { BoutonConfirmation } from '@/components/test-sirh/bouton-confirmation';
import type { ActionResult } from '@/lib/common/action-result';
import type { StatutProcessus } from '@/lib/validation/test-sirh/enums';
import type { StatutProcessusInput } from '@/lib/validation/test-sirh/onboarding';

type ChangerStatut = (input: StatutProcessusInput) => Promise<ActionResult<unknown>>;

function avertissementTaches(ouvertes: number): string {
  if (ouvertes === 0) return '';
  return ` ${ouvertes} tâche${ouvertes > 1 ? 's' : ''} ouverte${ouvertes > 1 ? 's' : ''} ser${
    ouvertes > 1 ? 'ont annulées' : 'a annulée'
  }.`;
}

/**
 * Actions du bandeau d'une fiche processus : Terminer / Annuler (processus en
 * cours — les tâches encore ouvertes passent « annulées ») ou Rouvrir.
 */
export function ActionsProcessus({
  processusId,
  statut,
  ouvertes,
  changerStatut,
}: {
  processusId: string;
  statut: StatutProcessus;
  /** Tâches encore ouvertes (à faire / en cours). */
  ouvertes: number;
  changerStatut: ChangerStatut;
}) {
  if (statut !== 'en_cours') {
    return (
      <BoutonConfirmation
        libelle="Rouvrir"
        question="Rouvrir ce processus ?"
        libelleConfirmer="Rouvrir"
        messageSucces="Processus rouvert"
        variante="default"
        onConfirm={() => changerStatut({ id: processusId, statut: 'en_cours' })}
      />
    );
  }
  return (
    <>
      <BoutonConfirmation
        libelle="Terminer"
        question={`Terminer ce processus ?${avertissementTaches(ouvertes)}`}
        libelleConfirmer="Terminer"
        messageSucces="Processus terminé"
        variante="default"
        onConfirm={() => changerStatut({ id: processusId, statut: 'termine' })}
      />
      <BoutonConfirmation
        libelle="Annuler le processus"
        question={`Annuler ce processus ?${avertissementTaches(ouvertes)}`}
        libelleConfirmer="Annuler le processus"
        messageSucces="Processus annulé"
        onConfirm={() => changerStatut({ id: processusId, statut: 'annule' })}
      />
    </>
  );
}

/** Encart proposé quand toutes les tâches d'un processus en cours sont faites. */
export function PropositionTerminer({
  processusId,
  changerStatut,
}: {
  processusId: string;
  changerStatut: ChangerStatut;
}) {
  return (
    <div
      role="status"
      className="flex flex-wrap items-center gap-3 rounded-xl border border-emerald-200 bg-emerald-50/60 px-4 py-3 text-sm text-emerald-800 dark:border-emerald-900/50 dark:bg-emerald-950/20 dark:text-emerald-300"
    >
      <CheckCircle2Icon className="size-4 shrink-0" />
      <span className="flex-1">
        Toutes les tâches sont faites : le processus peut être terminé.
      </span>
      <BoutonConfirmation
        libelle="Terminer le processus"
        question="Clôturer ce processus ?"
        libelleConfirmer="Terminer"
        messageSucces="Processus terminé"
        variante="default"
        onConfirm={() => changerStatut({ id: processusId, statut: 'termine' })}
      />
    </div>
  );
}

/** Zone dangereuse : suppression du processus et de ses tâches. */
export function SuppressionProcessus({
  supprimer,
  redirection,
}: {
  supprimer: () => Promise<ActionResult>;
  /** Liste des processus (après suppression). */
  redirection: string;
}) {
  return (
    <section className="rounded-xl border border-destructive/30 bg-card p-5">
      <h2 className="font-semibold text-destructive">Zone dangereuse</h2>
      <p className="mb-3 text-xs text-muted-foreground">
        Supprime le processus et toutes ses tâches. Pour simplement l’arrêter, utilisez plutôt «
        Annuler le processus ».
      </p>
      <BoutonConfirmation
        libelle="Supprimer le processus"
        question="Supprimer ce processus et ses tâches ?"
        libelleConfirmer="Supprimer"
        messageSucces="Processus supprimé"
        redirection={redirection}
        onConfirm={supprimer}
      />
    </section>
  );
}
