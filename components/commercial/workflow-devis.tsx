'use client';

import { BanIcon, CheckIcon, CopyIcon, UploadIcon, XIcon } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useTransition } from 'react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import {
  LIBELLES_STATUT_DEVIS,
  TRANSITIONS_STATUT_DEVIS,
  type StatutDevis,
} from '@/lib/validation/commercial';

/** Les 4 étapes fixes affichées dans le bandeau, dans l'ordre.
 *  La 5e étape (Gagné / Perdu) est rendue séparément avec deux sous-libellés
 *  cliquables. Refus = retour brouillon avec confirmation. Annulé = bouton
 *  secondaire à droite. */
const ETAPES_FIXES = [
  'brouillon',
  'en_validation',
  'valide',
  'envoye',
] as const satisfies readonly StatutDevis[];

type EtapeFixe = (typeof ETAPES_FIXES)[number];

type EtatEtape = 'franchie' | 'courante' | 'future';

function positionHappyPath(statut: StatutDevis): number {
  if (statut === 'brouillon' || statut === 'refuse') return 0;
  if (statut === 'en_validation') return 1;
  if (statut === 'valide') return 2;
  if (statut === 'envoye') return 3;
  if (statut === 'gagne' || statut === 'perdu') return 4;
  return -1;
}

function positionEtape(etape: EtapeFixe): number {
  switch (etape) {
    case 'brouillon':
      return 0;
    case 'en_validation':
      return 1;
    case 'valide':
      return 2;
    case 'envoye':
      return 3;
  }
}

type Props = {
  devisId?: string | undefined;
  /** Numéro du devis (ex. "DEV-2026-00042"). Affiché en haut de la barre
   *  sticky pour rester visible au scroll. Omis sur un devis non encore créé. */
  numero?: string | undefined;
  statutCourant: StatutDevis;
  /** Mode lecture seule : aucun clic ne déclenche de transition. */
  readOnly?: boolean | undefined;
  action?:
    | ((id: string, nouveau: StatutDevis) => Promise<{ ok: boolean; error?: string }>)
    | undefined;
  /** Libellé du bouton « Enregistrer » (ex. "Enregistrer", "Enregistrer le devis").
   *  Si fourni, le bouton est rendu en `type="submit"` — il doit donc être
   *  monté à l'intérieur d'un <form>. Sinon le bouton n'apparaît pas. */
  enregistrerLabel?: string | undefined;
  /** Désactive le bouton Enregistrer (form en cours de soumission). */
  enregistrerDisabled?: boolean | undefined;
  /** Callback du bouton « Importer DPGF » (ouvre la zone d'import).
   *  Si non fourni, le bouton n'est pas rendu. */
  onImporterDpgf?: (() => void) | undefined;
  /** Callback du bouton « Dupliquer » (ouvre le dialog de duplication).
   *  Si non fourni, le bouton n'est pas rendu. */
  onDupliquer?: (() => void) | undefined;
};

export function WorkflowDevis({
  devisId,
  numero,
  statutCourant,
  readOnly = false,
  action,
  enregistrerLabel,
  enregistrerDisabled = false,
  onImporterDpgf,
  onDupliquer,
}: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const transitionsPossibles: readonly StatutDevis[] =
    TRANSITIONS_STATUT_DEVIS?.[statutCourant] ?? [];
  const posCourante = positionHappyPath(statutCourant);

  function declencher(nouveau: StatutDevis) {
    if (readOnly || !devisId || !action) return;
    if (!transitionsPossibles.includes(nouveau)) return;
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

  function handleRefuser() {
    if (
      typeof window !== 'undefined' &&
      !window.confirm('Refuser ce devis ? Il repassera en brouillon pour correction.')
    ) {
      return;
    }
    declencher('brouillon');
  }

  function etatPourEtape(etape: EtapeFixe): EtatEtape {
    const idx = positionEtape(etape);
    if (idx < posCourante) return 'franchie';
    if (idx === posCourante) {
      if (statutCourant === etape) return 'courante';
      if (statutCourant === 'refuse' && etape === 'brouillon') return 'courante';
    }
    return 'future';
  }

  function peutCliquerLabel(etape: EtapeFixe): boolean {
    if (readOnly || isPending) return false;
    if (etape === 'brouillon') return false;
    return transitionsPossibles.includes(etape);
  }

  const cinqDecidee: 'gagne' | 'perdu' | null =
    statutCourant === 'gagne' ? 'gagne' : statutCourant === 'perdu' ? 'perdu' : null;

  const peutRefuser = !readOnly && !isPending && transitionsPossibles.includes('brouillon');

  function classesEtape(etat: EtatEtape, peutCliquer: boolean): string {
    return cn(
      'inline-flex max-w-full items-center gap-1.5 truncate px-1 text-sm transition-colors',
      peutCliquer && 'cursor-pointer hover:text-blue-700',
      !peutCliquer && 'cursor-default',
      etat === 'franchie' && 'font-medium text-emerald-700',
      etat === 'courante' && 'font-semibold text-blue-700',
      etat === 'future' && peutCliquer && 'font-medium text-slate-600',
      etat === 'future' && !peutCliquer && 'font-medium text-slate-500',
    );
  }

  function classesSoulignement(etat: EtatEtape): string {
    return cn(
      'mt-2 h-0 w-full border-t-2',
      etat === 'franchie' && 'border-solid border-emerald-500',
      etat === 'courante' && 'border-solid border-blue-600',
      etat === 'future' && 'border-dashed border-slate-300',
    );
  }

  return (
    <div className="sticky top-14 z-10 -mx-4 -mt-6 border-b bg-card px-4 py-3 lg:-mx-8 lg:px-8">
      <div className="flex flex-wrap items-end gap-3">
        {numero && (
          <div className="flex shrink-0 flex-col">
            <span className="px-1 text-sm text-muted-foreground">
              Devis <span className="font-mono font-medium text-foreground">{numero}</span>
            </span>
            <div aria-hidden="true" className="mt-2 h-0 w-full border-t-2 border-transparent" />
          </div>
        )}
        <ol className="flex min-w-0 flex-1 items-end">
          {ETAPES_FIXES.map((etape) => {
            const etat = etatPourEtape(etape);
            const peutCliquer = peutCliquerLabel(etape);
            const libelle = LIBELLES_STATUT_DEVIS[etape];

            return (
              <li key={etape} className="flex min-w-0 flex-1 flex-col items-center">
                <button
                  type="button"
                  disabled={!peutCliquer}
                  onClick={() => declencher(etape)}
                  aria-current={etat === 'courante' ? 'step' : undefined}
                  className={classesEtape(etat, peutCliquer)}
                >
                  {etat === 'franchie' && (
                    <CheckIcon className="size-3.5 shrink-0 text-emerald-600" aria-hidden="true" />
                  )}
                  <span className="truncate">{libelle}</span>
                </button>
                <div aria-hidden="true" className={classesSoulignement(etat)} />
              </li>
            );
          })}

          {/* 5e étape dynamique : Gagné / Perdu */}
          <li className="flex min-w-0 flex-1 flex-col items-center">
            {cinqDecidee === 'gagne' ? (
              <>
                <div
                  aria-current="step"
                  className="inline-flex max-w-full items-center gap-1.5 truncate px-1 text-sm font-semibold text-emerald-700"
                >
                  <CheckIcon className="size-3.5 shrink-0 text-emerald-600" aria-hidden="true" />
                  <span className="truncate">Gagné</span>
                </div>
                <div
                  aria-hidden="true"
                  className="mt-2 h-0 w-full border-t-2 border-solid border-emerald-500"
                />
              </>
            ) : cinqDecidee === 'perdu' ? (
              <>
                <div
                  aria-current="step"
                  className="inline-flex max-w-full items-center gap-1.5 truncate px-1 text-sm font-semibold text-red-700"
                >
                  <XIcon className="size-3.5 shrink-0 text-red-600" aria-hidden="true" />
                  <span className="truncate">Perdu</span>
                </div>
                <div
                  aria-hidden="true"
                  className="mt-2 h-0 w-full border-t-2 border-solid border-red-500"
                />
              </>
            ) : (
              <>
                <div className="inline-flex max-w-full items-center gap-1 text-sm">
                  <button
                    type="button"
                    disabled={readOnly || !transitionsPossibles.includes('gagne') || isPending}
                    onClick={() => declencher('gagne')}
                    className={cn(
                      'px-1 transition-colors',
                      !readOnly && transitionsPossibles.includes('gagne')
                        ? 'cursor-pointer font-medium text-slate-600 hover:text-emerald-700'
                        : 'cursor-default font-medium text-slate-500',
                    )}
                  >
                    Gagné
                  </button>
                  <span aria-hidden="true" className="text-slate-300">
                    /
                  </span>
                  <button
                    type="button"
                    disabled={readOnly || !transitionsPossibles.includes('perdu') || isPending}
                    onClick={() => declencher('perdu')}
                    className={cn(
                      'px-1 transition-colors',
                      !readOnly && transitionsPossibles.includes('perdu')
                        ? 'cursor-pointer font-medium text-slate-600 hover:text-red-700'
                        : 'cursor-default font-medium text-slate-500',
                    )}
                  >
                    Perdu
                  </button>
                </div>
                <div
                  aria-hidden="true"
                  className="mt-2 h-0 w-full border-t-2 border-dashed border-slate-300"
                />
              </>
            )}
          </li>
        </ol>

        {/* Toolbar d'actions à droite, ordre : Importer DPGF · Dupliquer · Enregistrer · Refuser · Annulé */}
        <div className="flex shrink-0 flex-wrap items-center gap-2 pb-0.5">
          {onImporterDpgf && (
            <Button
              variant="outline"
              size="sm"
              type="button"
              onClick={onImporterDpgf}
              disabled={isPending}
              className="gap-1.5 border-orange-400 bg-white text-orange-600 hover:bg-orange-50 hover:text-orange-700"
            >
              <UploadIcon className="size-4" aria-hidden="true" />
              Importer DPGF
            </Button>
          )}
          {onDupliquer && (
            <Button
              variant="outline"
              size="sm"
              type="button"
              onClick={onDupliquer}
              disabled={isPending}
              className="gap-1.5"
            >
              <CopyIcon className="size-4" aria-hidden="true" />
              Dupliquer
            </Button>
          )}
          {enregistrerLabel && (
            <Button size="sm" type="submit" disabled={isPending || enregistrerDisabled}>
              {enregistrerLabel}
            </Button>
          )}
          {peutRefuser && (
            <Button
              variant="outline"
              size="sm"
              type="button"
              onClick={handleRefuser}
              disabled={isPending}
              className="gap-1.5 border-red-400 bg-white text-red-600 hover:bg-red-50 hover:text-red-700"
            >
              <XIcon className="size-4" aria-hidden="true" />
              Refuser
            </Button>
          )}
          {statutCourant === 'annule' && (
            <span className="inline-flex items-center gap-1.5 rounded-md border border-red-400 bg-red-50 px-3 py-1.5 text-sm font-medium text-red-700">
              <BanIcon className="size-4" aria-hidden="true" />
              Annulé
            </span>
          )}
          {!readOnly && transitionsPossibles.includes('annule') && (
            <Button
              variant="outline"
              size="sm"
              type="button"
              onClick={() => declencher('annule')}
              disabled={isPending}
              className="gap-1.5 border-red-400 bg-white text-red-600 hover:bg-red-50 hover:text-red-700"
            >
              <BanIcon className="size-4" aria-hidden="true" />
              Annulé
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
