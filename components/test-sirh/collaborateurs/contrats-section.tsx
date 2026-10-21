'use client';

import { CalendarX2Icon, PencilIcon, PlusIcon } from 'lucide-react';
import { useMemo, useState } from 'react';

import { BoutonConfirmation } from '@/components/test-sirh/bouton-confirmation';
import { SirhVide } from '@/components/test-sirh/sirh-bloc';
import { Button } from '@/components/ui/button';
import type { ActionResult } from '@/lib/common/action-result';
import { alertesContrats, estRemplace, etatVersion } from '@/lib/test-sirh/collaborateurs/contrats';
import type { ResultatEnregistrementContrat } from '@/lib/test-sirh/collaborateurs/contrats-actions';
import type {
  ContratEditable,
  PrefillFicheRh,
} from '@/lib/test-sirh/collaborateurs/saisie-contrat';
import { formatDateFr, formatEuro, formatNombre } from '@/lib/test-sirh/format';
import type { ContratInput, TerminerContratInput } from '@/lib/validation/test-sirh/collaborateurs';
import {
  LIBELLES_CATEGORIE_PROFESSIONNELLE,
  LIBELLES_MOTIF_FIN_CONTRAT,
  LIBELLES_TEMPS_TRAVAIL,
} from '@/lib/validation/test-sirh/enums';
import { cn } from '@/lib/utils';

import { ListeAlertesContrats } from './alertes-contrats';
import { EtatVersionBadge, TypeContratBadge } from './badges';
import { ContratDialog, type OptionsContrat } from './contrat-dialog';
import { TerminerContratDialog, type ContratATerminer } from './terminer-contrat-dialog';

/** Version de contrat affichée (rémunération `null` sans le droit PAIE). */
export type ContratLigneUI = ContratEditable & {
  posteIntitule: string | null;
  societeLibelle: string | null;
  siteNom: string | null;
};

type Props = {
  employeId: string;
  contrats: ContratLigneUI[];
  today: string;
  peutGerer: boolean;
  /** Droit PAIE : colonne et champs de rémunération. */
  avecRemuneration: boolean;
  options: OptionsContrat;
  prefill: PrefillFicheRh | null;
  actions: {
    enregistrer: (input: ContratInput) => Promise<ActionResult<ResultatEnregistrementContrat>>;
    terminer: (input: TerminerContratInput) => Promise<ActionResult>;
    supprimer: (id: string) => Promise<ActionResult>;
  };
};

function libelleTempsTravail(c: ContratLigneUI): string {
  if (c.tempsTravail === 'forfait_jours') {
    return c.joursForfait ? `Forfait ${c.joursForfait} j/an` : LIBELLES_TEMPS_TRAVAIL.forfait_jours;
  }
  const heures = c.heuresHebdo ? ` · ${formatNombre(c.heuresHebdo)} h/sem.` : '';
  return `${LIBELLES_TEMPS_TRAVAIL[c.tempsTravail]}${heures}`;
}

function classification(c: ContratLigneUI): string | null {
  const parts = [
    c.categorie ? LIBELLES_CATEGORIE_PROFESSIONNELLE[c.categorie] : null,
    c.niveau,
    c.coefficient ? `coef. ${c.coefficient}` : null,
  ].filter(Boolean);
  return parts.length > 0 ? parts.join(' · ') : null;
}

/**
 * Historique des versions de contrat du collaborateur : version en cours mise en
 * évidence, alertes (fin d'essai, fin de contrat, contrat échu sans motif),
 * ajout / modification / fin / suppression (gestion).
 */
export function ContratsSection({
  employeId,
  contrats,
  today,
  peutGerer,
  avecRemuneration,
  options,
  prefill,
  actions,
}: Props) {
  const [edition, setEdition] = useState<{ contrat: ContratLigneUI | null } | null>(null);
  const [aTerminer, setATerminer] = useState<ContratATerminer | null>(null);

  const alertes = useMemo(() => alertesContrats(contrats, today), [contrats, today]);
  const tries = useMemo(
    () => [...contrats].sort((a, b) => b.dateDebut.localeCompare(a.dateDebut)),
    [contrats],
  );

  return (
    <div className="space-y-4">
      <ListeAlertesContrats alertes={alertes} />

      {peutGerer && (
        <div className="flex justify-end">
          <Button size="sm" onClick={() => setEdition({ contrat: null })}>
            <PlusIcon className="mr-1 size-4" /> Nouveau contrat
          </Button>
        </div>
      )}

      {tries.length === 0 ? (
        <SirhVide>
          Aucun contrat enregistré dans le SIRH.
          {peutGerer && prefill
            ? ' Créez la première version (pré-remplissable depuis la fiche RH).'
            : ''}
        </SirhVide>
      ) : (
        <div className="overflow-x-auto rounded-md border">
          <table className="w-full text-sm">
            <thead className="bg-muted/40 text-left text-xs uppercase tracking-widest text-muted-foreground">
              <tr>
                <th className="px-3 py-2 font-medium">Période</th>
                <th className="px-3 py-2 font-medium">Contrat</th>
                <th className="px-3 py-2 font-medium">Poste</th>
                <th className="px-3 py-2 font-medium">Temps de travail</th>
                {avecRemuneration && <th className="px-3 py-2 font-medium">Rémunération</th>}
                <th className="px-3 py-2 font-medium">État</th>
                {peutGerer && <th className="px-3 py-2" />}
              </tr>
            </thead>
            <tbody className="divide-y">
              {tries.map((c) => {
                const etat = etatVersion(c, contrats, today);
                const terminable = !c.motifFin && !estRemplace(c, contrats);
                const classif = classification(c);
                return (
                  <tr
                    key={c.id}
                    className={cn(
                      etat === 'en_cours' && 'bg-amber-50/60 dark:bg-amber-950/20',
                      (etat === 'remplacee' || etat === 'terminee') && 'text-muted-foreground',
                    )}
                    aria-current={etat === 'en_cours' ? 'true' : undefined}
                  >
                    <td className="whitespace-nowrap px-3 py-2 tabular-nums">
                      {formatDateFr(c.dateDebut)} → {c.dateFin ? formatDateFr(c.dateFin) : '…'}
                      {c.dateFinPeriodeEssai && (
                        <span className="block text-xs text-muted-foreground">
                          Essai jusqu’au {formatDateFr(c.dateFinPeriodeEssai)}
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-2">
                      <TypeContratBadge type={c.typeContrat} />
                      {c.motifRecours && (
                        <span className="mt-0.5 block max-w-[16rem] truncate text-xs text-muted-foreground">
                          {c.motifRecours}
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-2">
                      <span className={etat === 'en_cours' ? 'font-medium' : undefined}>
                        {c.intitulePoste ?? c.posteIntitule ?? '—'}
                      </span>
                      {classif && (
                        <span className="block text-xs text-muted-foreground">{classif}</span>
                      )}
                    </td>
                    <td className="px-3 py-2">{libelleTempsTravail(c)}</td>
                    {avecRemuneration && (
                      <td className="whitespace-nowrap px-3 py-2 tabular-nums">
                        {c.salaireBrutMensuel ? (
                          <span className="block">{formatEuro(c.salaireBrutMensuel)} / mois</span>
                        ) : null}
                        {c.tauxHoraireBrut ? (
                          <span className="block text-xs text-muted-foreground">
                            {formatEuro(c.tauxHoraireBrut)} / h
                          </span>
                        ) : null}
                        {!c.salaireBrutMensuel && !c.tauxHoraireBrut && '—'}
                      </td>
                    )}
                    <td className="px-3 py-2">
                      <EtatVersionBadge etat={etat} />
                      {c.motifFin && (
                        <span className="mt-0.5 block text-xs text-muted-foreground">
                          {LIBELLES_MOTIF_FIN_CONTRAT[c.motifFin]}
                        </span>
                      )}
                    </td>
                    {peutGerer && (
                      <td className="px-3 py-2">
                        <div className="flex items-center justify-end gap-1">
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 w-7 p-0"
                            onClick={() => setEdition({ contrat: c })}
                            title="Modifier"
                            aria-label={`Modifier le contrat du ${formatDateFr(c.dateDebut)}`}
                          >
                            <PencilIcon className="size-3.5" />
                          </Button>
                          {terminable && (
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() =>
                                setATerminer({
                                  id: c.id,
                                  typeContrat: c.typeContrat,
                                  dateDebut: c.dateDebut,
                                  dateFin: c.dateFin,
                                })
                              }
                            >
                              <CalendarX2Icon className="mr-1 size-3.5" /> Terminer
                            </Button>
                          )}
                          <BoutonConfirmation
                            libelle="Supprimer"
                            question="Supprimer cette version ?"
                            libelleConfirmer="Supprimer"
                            messageSucces="Version supprimée"
                            onConfirm={() => actions.supprimer(c.id)}
                          />
                        </div>
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {peutGerer && (
        <>
          <ContratDialog
            open={edition !== null}
            onOpenChange={(o) => {
              if (!o) setEdition(null);
            }}
            employeId={employeId}
            contrat={edition?.contrat ?? null}
            today={today}
            avecRemuneration={avecRemuneration}
            options={options}
            prefill={prefill}
            onSubmit={actions.enregistrer}
          />
          <TerminerContratDialog
            open={aTerminer !== null}
            onOpenChange={(o) => {
              if (!o) setATerminer(null);
            }}
            contrat={aTerminer}
            today={today}
            onSubmit={actions.terminer}
          />
        </>
      )}
    </div>
  );
}
