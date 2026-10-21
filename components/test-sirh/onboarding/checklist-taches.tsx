'use client';

import { PencilIcon, PlusIcon } from 'lucide-react';
import { useMemo, useState } from 'react';

import { BoutonConfirmation } from '@/components/test-sirh/bouton-confirmation';
import {
  OptionSelect,
  optionsDepuisEnum,
  type OptionListe,
} from '@/components/test-sirh/option-select';
import { SirhVide } from '@/components/test-sirh/sirh-bloc';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import type { ActionResult } from '@/lib/common/action-result';
import { formatDateFr } from '@/lib/test-sirh/format';
import { estTacheEnRetard, type EtatTache } from '@/lib/test-sirh/onboarding/planification';
import type { TacheLigne } from '@/lib/test-sirh/onboarding/types';
import { cn } from '@/lib/utils';
import {
  LIBELLES_STATUT_TACHE,
  STATUTS_TACHE,
  type StatutTache,
} from '@/lib/validation/test-sirh/enums';
import type { StatutTacheInput, TacheInput } from '@/lib/validation/test-sirh/onboarding';

import { ResponsableBadge, StatutTacheBadge } from './badges-onboarding';
import { TacheDialog } from './tache-dialog';
import { useAvancementTaches } from './use-avancement-taches';

const OPTIONS_STATUT = optionsDepuisEnum(STATUTS_TACHE, LIBELLES_STATUT_TACHE);

/** Valeurs de formulaire d'une tâche existante. */
export function versTacheInput(t: TacheLigne): Partial<TacheInput> {
  return {
    id: t.id,
    processusId: t.processusId,
    employeId: t.employeId,
    libelle: t.libelle,
    description: t.description,
    responsable: t.responsable,
    assigneA: t.assigneA,
    echeance: t.echeance,
  };
}

type Props = {
  processusId: string;
  /** Processus en cours : l'ajout de tâches est possible. */
  processusOuvert: boolean;
  taches: TacheLigne[];
  today: string;
  peutGerer: boolean;
  /** Utilisateur courant : il peut cocher les tâches qui lui sont assignées. */
  utilisateurId: string;
  utilisateurs: readonly OptionListe[];
  actions: {
    basculer: (id: string, faite: boolean) => Promise<ActionResult<EtatTache>>;
    changerStatut: (input: StatutTacheInput) => Promise<ActionResult<EtatTache>>;
    enregistrer: (input: TacheInput) => Promise<ActionResult<{ id: string }>>;
    supprimer: (id: string) => Promise<ActionResult>;
  };
};

/**
 * Checklist d'un processus : cocher / décocher (faite aujourd'hui / à faire),
 * statut, assignation, échéance (en rose si dépassée), ajout ad hoc,
 * suppression. Les non-gestionnaires ne cochent que leurs tâches assignées.
 */
export function ChecklistTaches({
  processusId,
  processusOuvert,
  taches,
  today,
  peutGerer,
  utilisateurId,
  utilisateurs,
  actions,
}: Props) {
  const [dialogOuvert, setDialogOuvert] = useState(false);
  const [editee, setEditee] = useState<TacheLigne | null>(null);
  const avancement = useAvancementTaches(taches, today, {
    basculer: actions.basculer,
    changerStatut: actions.changerStatut,
  });

  // Objet stable : la modale ne se réinitialise pas à chaque rendu du parent.
  const valeursEditees = useMemo(() => (editee ? versTacheInput(editee) : null), [editee]);

  function ouvrir(t: TacheLigne | null) {
    setEditee(t);
    setDialogOuvert(true);
  }

  return (
    <div className="space-y-3">
      {avancement.taches.length === 0 ? (
        <SirhVide>Aucune tâche dans ce processus.</SirhVide>
      ) : (
        <ul className="divide-y overflow-hidden rounded-md border">
          {avancement.taches.map((t) => {
            const enRetard = estTacheEnRetard(t, today);
            const faite = t.statut === 'faite';
            const annulee = t.statut === 'annulee';
            const peutCocher = peutGerer || t.assigneA === utilisateurId;
            return (
              <li
                key={t.id}
                data-testid={`tache-${t.id}`}
                className={cn(
                  'flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-start',
                  enRetard && 'bg-rose-50/70 dark:bg-rose-950/20',
                )}
              >
                <div className="flex min-w-0 flex-1 items-start gap-3">
                  <input
                    type="checkbox"
                    className="mt-0.5 size-4 shrink-0 cursor-pointer accent-amber-600 disabled:cursor-not-allowed"
                    checked={faite}
                    disabled={!peutCocher || annulee}
                    onChange={(e) => avancement.basculer(t.id, e.target.checked)}
                    aria-label={`Tâche faite : ${t.libelle}`}
                    title={
                      peutCocher ? undefined : 'Seule la personne assignée ou les RH peuvent cocher'
                    }
                  />
                  <div className="min-w-0 flex-1">
                    <p
                      className={cn(
                        'text-sm font-medium',
                        (faite || annulee) && 'text-muted-foreground',
                        faite && 'line-through',
                      )}
                    >
                      {t.libelle}
                    </p>
                    {t.description && (
                      <p className="whitespace-pre-line text-xs text-muted-foreground">
                        {t.description}
                      </p>
                    )}
                    <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                      <ResponsableBadge responsable={t.responsable} />
                      <span>{t.assigneLabel ?? 'Non assignée'}</span>
                      {faite && t.dateRealisation && (
                        <span>· faite le {formatDateFr(t.dateRealisation)}</span>
                      )}
                      {(annulee || t.statut === 'en_cours') && !peutGerer && (
                        <StatutTacheBadge statut={t.statut} />
                      )}
                    </div>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-2 pl-7 sm:pl-0">
                  <div className="text-xs tabular-nums sm:w-28 sm:text-right">
                    <span className="block text-muted-foreground">Échéance</span>
                    <span
                      className={cn(enRetard && 'font-medium text-rose-700 dark:text-rose-300')}
                    >
                      {formatDateFr(t.echeance)}
                    </span>
                    {enRetard && (
                      <Badge tone="rose" className="ml-1 sm:ml-0 sm:mt-0.5">
                        En retard
                      </Badge>
                    )}
                  </div>
                  {peutGerer && (
                    <div className="flex items-center gap-1">
                      <OptionSelect
                        options={OPTIONS_STATUT}
                        value={t.statut}
                        onChange={(v) => v && avancement.changerStatut(t.id, v as StatutTache)}
                        autoriserAucune={false}
                        className="h-7 w-28 text-xs"
                        aria-label={`Statut de ${t.libelle}`}
                      />
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 w-7 p-0"
                        onClick={() => ouvrir(t)}
                        title="Modifier"
                        aria-label={`Modifier ${t.libelle}`}
                      >
                        <PencilIcon className="size-3.5" />
                      </Button>
                      <BoutonConfirmation
                        libelle="Supprimer"
                        question="Supprimer cette tâche ?"
                        libelleConfirmer="Supprimer"
                        messageSucces="Tâche supprimée"
                        onConfirm={() => actions.supprimer(t.id)}
                      />
                    </div>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {peutGerer && processusOuvert && (
        <Button variant="outline" size="sm" onClick={() => ouvrir(null)}>
          <PlusIcon className="mr-1 size-4" /> Ajouter une tâche
        </Button>
      )}

      {peutGerer && (
        <TacheDialog
          open={dialogOuvert}
          onOpenChange={setDialogOuvert}
          tache={valeursEditees}
          processusId={processusId}
          utilisateurs={utilisateurs}
          onSubmit={actions.enregistrer}
        />
      )}
    </div>
  );
}
