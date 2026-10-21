'use client';

import { CheckIcon, PlusIcon } from 'lucide-react';
import { useMemo, useState, useTransition } from 'react';
import { toast } from 'sonner';

import type { OptionListe } from '@/components/test-sirh/option-select';
import { SirhVide } from '@/components/test-sirh/sirh-bloc';
import { PastilleCouleur } from '@/components/test-sirh/statut-badges';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { SegmentedControl } from '@/components/ui/segmented-control';
import type { ActionResult } from '@/lib/common/action-result';
import {
  formatHeure,
  formatJourCourt,
  formatMinutes,
  formatNombre,
  nomComplet,
} from '@/lib/test-sirh/format';
import {
  formatEcartMinutes,
  totauxFeuille,
  type BadgeageCalcule,
  type FeuilleTemps,
  type LigneFeuille,
} from '@/lib/test-sirh/temps/feuille-temps';
import { cn } from '@/lib/utils';
import { LIBELLES_LIEU_TRAVAIL } from '@/lib/validation/test-sirh/enums';
import type { BadgeageInput, ValidationSemaineInput } from '@/lib/validation/test-sirh/temps';

import { BadgeageDialog } from './badgeage-dialog';

export type ActionsFeuilleTemps = {
  enregistrer: (input: BadgeageInput) => Promise<ActionResult<{ id: string }>>;
  supprimer: (id: string) => Promise<ActionResult>;
  valider: (id: string) => Promise<ActionResult>;
  validerSemaine: (input: ValidationSemaineInput) => Promise<ActionResult<{ nbValides: number }>>;
};

type Props = {
  feuille: FeuilleTemps;
  /** Date du jour (ISO, calculée côté serveur) : colonne mise en évidence. */
  today: string;
  /** Saisie / modification / suppression des badgeages. */
  peutSaisir?: boolean;
  /** Validation des badgeages. */
  peutValider?: boolean;
  /** Gestionnaire RH : peut valider ses propres badgeages. */
  peutGerer?: boolean;
  /** Fiche employé de l'utilisateur (un valideur non RH ne valide pas la sienne). */
  monEmployeId?: string | null;
  employes?: readonly OptionListe[];
  chantiers?: readonly OptionListe[];
  actions?: ActionsFeuilleTemps;
  /** Masque le filtre d'affichage (vue d'un seul collaborateur). */
  sansFiltre?: boolean;
  /** Message affiché quand la feuille ne contient aucun collaborateur. */
  messageVide?: string;
};

type Filtre = 'tous' | 'badges' | 'a_valider';

function classeEcart(minutes: number | null): string {
  if (minutes === null || minutes === 0) return 'text-muted-foreground';
  return minutes > 0
    ? 'text-emerald-700 dark:text-emerald-300'
    : 'text-rose-700 dark:text-rose-300';
}

/**
 * Feuille de temps hebdomadaire (Factorial attendance/WorkedTime) : une ligne par
 * collaborateur, une colonne par jour ; badgeages, temps travaillé, théorique de
 * l'horaire et écarts. Saisie en modale, validation unitaire ou à la semaine.
 */
export function FeuilleTempsTable({
  feuille,
  today,
  peutSaisir = false,
  peutValider = false,
  peutGerer = false,
  monEmployeId = null,
  employes = [],
  chantiers = [],
  actions,
  sansFiltre = false,
  messageVide = 'Aucun collaborateur pour ces critères.',
}: Props) {
  const [isPending, startTransition] = useTransition();
  const [filtre, setFiltre] = useState<Filtre>('tous');
  const [dialogOuvert, setDialogOuvert] = useState(false);
  const [edite, setEdite] = useState<Partial<BadgeageInput> | null>(null);

  const saisie = peutSaisir && Boolean(actions);
  const validation = peutValider && Boolean(actions);

  const lignes = useMemo(() => {
    if (filtre === 'badges') return feuille.lignes.filter((l) => l.nbBadgeages > 0);
    if (filtre === 'a_valider') return feuille.lignes.filter((l) => l.nbNonValides > 0);
    return feuille.lignes;
  }, [feuille.lignes, filtre]);
  const totaux = useMemo(() => totauxFeuille(lignes), [lignes]);

  function peutValiderEmploye(employeId: string): boolean {
    return validation && (peutGerer || employeId !== monEmployeId);
  }

  function ouvrirCreation(employeId: string, date: string) {
    setEdite({ employeId, dateBadgeage: date });
    setDialogOuvert(true);
  }

  function ouvrirEdition(b: BadgeageCalcule) {
    setEdite({
      id: b.id,
      employeId: b.employeId,
      dateBadgeage: b.dateBadgeage,
      heureDebut: b.heureDebut,
      heureFin: b.heureFin,
      pauseMinutes: b.pauseMinutes,
      lieu: b.lieu,
      chantierId: b.chantierId,
      commentaire: b.commentaire,
    });
    setDialogOuvert(true);
  }

  function valider(id: string) {
    if (!actions) return;
    startTransition(async () => {
      const r = await actions.valider(id);
      if (r.ok) {
        toast.success('Badgeage validé');
      } else {
        toast.error(r.error);
      }
    });
  }

  function validerSemaine(l: LigneFeuille) {
    if (!actions) return;
    startTransition(async () => {
      const r = await actions.validerSemaine({ employeId: l.employe.id, lundi: feuille.lundi });
      if (r.ok) {
        toast.success(
          r.data.nbValides > 1
            ? `${r.data.nbValides} badgeages validés`
            : `${r.data.nbValides} badgeage validé`,
        );
      } else {
        toast.error(r.error);
      }
    });
  }

  return (
    <div className="space-y-3">
      {!sansFiltre && (
        <div className="flex flex-wrap items-center justify-between gap-2">
          <SegmentedControl<Filtre>
            aria-label="Collaborateurs affichés"
            value={filtre}
            onChange={setFiltre}
            options={[
              { value: 'tous', label: `Tous (${feuille.lignes.length})` },
              { value: 'badges', label: 'Avec badgeages' },
              { value: 'a_valider', label: 'À valider' },
            ]}
          />
          <p className="text-xs text-muted-foreground">
            Théorique = horaire du collaborateur (ou horaire par défaut), hors fériés chômés et
            absences approuvées.
          </p>
        </div>
      )}

      {lignes.length === 0 ? (
        <SirhVide>
          {feuille.lignes.length === 0
            ? messageVide
            : 'Aucun collaborateur ne correspond à ce filtre.'}
        </SirhVide>
      ) : (
        <div className="overflow-x-auto rounded-xl border bg-card shadow-sm">
          <table className="w-full min-w-[1000px] text-sm">
            <thead className="bg-muted/40 text-left text-xs uppercase tracking-widest text-muted-foreground">
              <tr>
                <th className="px-3 py-2 font-medium">Collaborateur</th>
                {feuille.jours.map((jour) => (
                  <th
                    key={jour}
                    className={cn(
                      'px-2 py-2 font-medium',
                      jour === today && 'bg-amber-100/60 text-amber-800 dark:bg-amber-900/30',
                    )}
                  >
                    {formatJourCourt(jour)}
                  </th>
                ))}
                <th className="px-3 py-2 text-right font-medium">Total</th>
                <th className="px-3 py-2 text-right font-medium">Écart</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {lignes.map((l) => {
                const nom = nomComplet(l.employe.prenom, l.employe.nom);
                return (
                  <tr key={l.employe.id} className="align-top">
                    <td className="px-3 py-2">
                      <div className="font-medium">
                        {`${l.employe.nom} ${l.employe.prenom}`.trim()}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {[l.employe.matricule, l.employe.horaireNom ?? 'Sans horaire']
                          .filter(Boolean)
                          .join(' · ')}
                      </div>
                      <div className="mt-1 flex flex-wrap items-center gap-1">
                        {l.semaineValidee && (
                          <Badge tone="emerald" shape="pill">
                            Semaine validée
                          </Badge>
                        )}
                        {l.nbEnCours > 0 && (
                          <Badge tone="amber" shape="pill">
                            {l.nbEnCours} en cours
                          </Badge>
                        )}
                        {l.nbNonValides > 0 && peutValiderEmploye(l.employe.id) && (
                          <Button
                            type="button"
                            size="xs"
                            variant="outline"
                            disabled={isPending}
                            onClick={() => validerSemaine(l)}
                            aria-label={`Valider la semaine de ${nom}`}
                          >
                            Valider la semaine ({l.nbNonValides})
                          </Button>
                        )}
                        {l.nbNonValides > 0 && !peutValiderEmploye(l.employe.id) && (
                          <Badge tone="neutral" shape="pill">
                            {l.nbNonValides} à valider
                          </Badge>
                        )}
                      </div>
                    </td>

                    {l.jours.map((j) => (
                      <td
                        key={j.date}
                        className={cn(
                          'px-2 py-2',
                          j.date === today && 'bg-amber-50/60 dark:bg-amber-950/20',
                          j.ferie && 'bg-muted/40',
                        )}
                      >
                        <div className="flex min-w-[96px] flex-col gap-1">
                          {j.ferie && (
                            <span
                              className="truncate text-xs text-muted-foreground"
                              title={j.ferie}
                            >
                              Férié
                            </span>
                          )}
                          {j.absences.map((a, i) => (
                            <span
                              key={`${a.code}-${i}`}
                              className="inline-flex items-center gap-1 text-xs"
                              title={a.libelle}
                            >
                              <PastilleCouleur couleur={a.couleur} />
                              {a.code}
                              {a.fraction < 1 && <span className="text-muted-foreground">½</span>}
                            </span>
                          ))}
                          {j.badgeages.map((b) => (
                            <CelluleBadgeage
                              key={b.id}
                              badgeage={b}
                              editable={saisie}
                              validable={!b.valide && !b.enCours && peutValiderEmploye(b.employeId)}
                              disabled={isPending}
                              onEditer={() => ouvrirEdition(b)}
                              onValider={() => valider(b.id)}
                            />
                          ))}
                          {(j.badgeages.length > 0 || (j.minutesTheoriques ?? 0) > 0) && (
                            <span className="text-xs tabular-nums">
                              <span className="font-medium">
                                {formatMinutes(j.minutesTravaillees)}
                              </span>
                              {j.minutesTheoriques !== null && (
                                <span className="text-muted-foreground">
                                  {' '}
                                  / {formatMinutes(j.minutesTheoriques)}
                                </span>
                              )}
                            </span>
                          )}
                          {saisie && (
                            <button
                              type="button"
                              onClick={() => ouvrirCreation(l.employe.id, j.date)}
                              className="inline-flex w-fit items-center rounded px-1 text-xs text-muted-foreground hover:bg-muted hover:text-foreground"
                              aria-label={`Ajouter un badgeage pour ${nom} le ${formatJourCourt(j.date)}`}
                              title="Ajouter un badgeage"
                            >
                              <PlusIcon className="size-3.5" />
                            </button>
                          )}
                        </div>
                      </td>
                    ))}

                    <td className="whitespace-nowrap px-3 py-2 text-right tabular-nums">
                      <div className="font-medium">{formatMinutes(l.minutesTravaillees)}</div>
                      {l.minutesTheoriques !== null && (
                        <div className="text-xs text-muted-foreground">
                          / {formatMinutes(l.minutesTheoriques)}
                        </div>
                      )}
                    </td>
                    <td
                      className={cn(
                        'whitespace-nowrap px-3 py-2 text-right font-medium tabular-nums',
                        classeEcart(l.ecartMinutes),
                      )}
                    >
                      {formatEcartMinutes(l.ecartMinutes)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
            {lignes.length > 1 && (
              <tfoot className="border-t bg-muted/20 text-sm">
                <tr>
                  <td className="px-3 py-2 font-medium" colSpan={8}>
                    Total · {totaux.nbEmployes} collaborateur{totaux.nbEmployes > 1 ? 's' : ''} ·{' '}
                    {formatNombre(totaux.nbBadgeages)} badgeage{totaux.nbBadgeages > 1 ? 's' : ''}
                  </td>
                  <td className="whitespace-nowrap px-3 py-2 text-right font-medium tabular-nums">
                    {formatMinutes(totaux.minutesTravaillees)}
                    <div className="text-xs font-normal text-muted-foreground">
                      / {formatMinutes(totaux.minutesTheoriques)}
                    </div>
                  </td>
                  <td
                    className={cn(
                      'whitespace-nowrap px-3 py-2 text-right font-medium tabular-nums',
                      classeEcart(totaux.ecartMinutes),
                    )}
                  >
                    {formatEcartMinutes(totaux.ecartMinutes)}
                  </td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      )}

      {saisie && actions && (
        <BadgeageDialog
          open={dialogOuvert}
          onOpenChange={setDialogOuvert}
          badgeage={edite}
          employes={employes}
          chantiers={chantiers}
          onSubmit={actions.enregistrer}
          onSupprimer={actions.supprimer}
        />
      )}
    </div>
  );
}

/** Un badgeage dans une cellule jour : horaires, pause, lieu, chantier, état de validation. */
function CelluleBadgeage({
  badgeage: b,
  editable,
  validable,
  disabled,
  onEditer,
  onValider,
}: {
  badgeage: BadgeageCalcule;
  editable: boolean;
  validable: boolean;
  disabled: boolean;
  onEditer: () => void;
  onValider: () => void;
}) {
  const horaires = `${formatHeure(b.heureDebut)} – ${b.enCours ? 'en cours' : formatHeure(b.heureFin)}`;
  const lieu = LIBELLES_LIEU_TRAVAIL[b.lieu];
  const contenu = (
    <>
      <span
        className={cn(
          'block whitespace-nowrap font-medium tabular-nums',
          b.enCours && 'text-amber-700 dark:text-amber-300',
        )}
      >
        {horaires}
      </span>
      {b.pauseMinutes > 0 && (
        <span className="block whitespace-nowrap text-muted-foreground">
          pause {b.pauseMinutes} min
        </span>
      )}
      <span className="block max-w-[140px] truncate text-muted-foreground" title={lieu}>
        {lieu}
      </span>
      {b.chantierLabel && (
        <span className="block max-w-[140px] truncate" title={b.chantierLabel}>
          {b.chantierLabel}
        </span>
      )}
    </>
  );

  return (
    <div
      className={cn(
        'flex items-start gap-1 rounded-md border px-1.5 py-1 text-xs',
        b.valide
          ? 'border-emerald-200 bg-emerald-50/50 dark:border-emerald-900/50 dark:bg-emerald-950/20'
          : 'bg-background',
      )}
    >
      {editable ? (
        <button
          type="button"
          onClick={onEditer}
          className="min-w-0 flex-1 text-left hover:underline"
          title={b.commentaire ?? 'Modifier le badgeage'}
        >
          {contenu}
        </button>
      ) : (
        <div className="min-w-0 flex-1" title={b.commentaire ?? undefined}>
          {contenu}
        </div>
      )}
      {b.valide ? (
        <CheckIcon className="mt-0.5 size-3.5 shrink-0 text-emerald-600" aria-label="Validé" />
      ) : (
        validable && (
          <button
            type="button"
            onClick={onValider}
            disabled={disabled}
            className="mt-0.5 shrink-0 rounded text-muted-foreground hover:text-emerald-700 disabled:opacity-50"
            aria-label={`Valider le badgeage ${horaires}`}
            title="Valider ce badgeage"
          >
            <CheckIcon className="size-3.5" />
          </button>
        )
      )}
    </div>
  );
}
