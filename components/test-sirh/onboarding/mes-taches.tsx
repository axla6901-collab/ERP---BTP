'use client';

import Link from 'next/link';
import type { ReactNode } from 'react';

import { SirhVide } from '@/components/test-sirh/sirh-bloc';
import { Badge } from '@/components/ui/badge';
import type { ActionResult } from '@/lib/common/action-result';
import { formatDateFr } from '@/lib/test-sirh/format';
import { estTacheEnRetard, type EtatTache } from '@/lib/test-sirh/onboarding/planification';
import type { TacheLigne } from '@/lib/test-sirh/onboarding/types';
import { cn } from '@/lib/utils';

import { ResponsableBadge } from './badges-onboarding';
import { useAvancementTaches } from './use-avancement-taches';

/**
 * Liste compacte de tâches (« Mon espace », tableau de bord, dossier
 * collaborateur) : cocher / décocher, échéance en rose si dépassée, lien vers
 * le processus si `baseProcessus` est fourni (rôles ayant accès à l'onboarding).
 *
 * Par défaut toutes les tâches sont cochables (liste de l'utilisateur). Pour
 * la liste d'un tiers, passer `utilisateurId` (+ `peutGerer`) : seules les
 * tâches assignées à l'utilisateur restent cochables pour un non-gestionnaire.
 */
export function MesTaches({
  taches,
  today,
  basculer,
  baseProcessus = null,
  vide = 'Aucune tâche en attente.',
  limite,
  utilisateurId = null,
  peutGerer = false,
}: {
  /** Typiquement `listerMesTaches()` (ou `listerTachesEmploye(id)`). */
  taches: TacheLigne[];
  today: string;
  /** Wrapper de `basculerTache`. */
  basculer: (id: string, faite: boolean) => Promise<ActionResult<EtatTache>>;
  /** `/<slug>/test-sirh/onboarding` ; null = pas de lien vers la fiche processus. */
  baseProcessus?: string | null;
  vide?: ReactNode;
  /** Nombre maximal de tâches affichées. */
  limite?: number;
  /** Utilisateur courant : restreint le cochage à ses tâches (sauf gestionnaire). */
  utilisateurId?: string | null;
  peutGerer?: boolean;
}) {
  const avancement = useAvancementTaches(taches, today, { basculer });
  const affichees = limite !== undefined ? avancement.taches.slice(0, limite) : avancement.taches;
  const peutCocher = (t: TacheLigne) =>
    t.statut !== 'annulee' && (peutGerer || utilisateurId === null || t.assigneA === utilisateurId);

  if (affichees.length === 0) return <SirhVide>{vide}</SirhVide>;

  return (
    <ul className="divide-y overflow-hidden rounded-md border">
      {affichees.map((t) => {
        const enRetard = estTacheEnRetard(t, today);
        const faite = t.statut === 'faite';
        const contexte = [
          t.processusLibelle,
          t.employeNom && !t.processusLibelle ? t.employeNom : null,
        ]
          .filter(Boolean)
          .join(' · ');
        return (
          <li
            key={t.id}
            className={cn(
              'flex items-start gap-3 px-3 py-2',
              enRetard && 'bg-rose-50/70 dark:bg-rose-950/20',
            )}
          >
            <input
              type="checkbox"
              className="mt-0.5 size-4 shrink-0 cursor-pointer accent-amber-600 disabled:cursor-not-allowed"
              checked={faite}
              disabled={!peutCocher(t)}
              onChange={(e) => avancement.basculer(t.id, e.target.checked)}
              aria-label={`Tâche faite : ${t.libelle}`}
            />
            <div className="min-w-0 flex-1">
              <p
                className={cn(
                  'truncate text-sm font-medium',
                  faite && 'text-muted-foreground line-through',
                )}
              >
                {t.libelle}
              </p>
              {contexte &&
                (baseProcessus && t.processusId ? (
                  <Link
                    href={`${baseProcessus}/${t.processusId}`}
                    className="block truncate text-xs text-muted-foreground hover:text-foreground hover:underline"
                  >
                    {contexte}
                  </Link>
                ) : (
                  <p className="truncate text-xs text-muted-foreground">{contexte}</p>
                ))}
            </div>
            <div className="flex shrink-0 flex-col items-end gap-1 text-xs">
              <ResponsableBadge responsable={t.responsable} />
              <span
                className={cn(
                  'tabular-nums',
                  enRetard
                    ? 'font-medium text-rose-700 dark:text-rose-300'
                    : 'text-muted-foreground',
                )}
              >
                {t.echeance ? formatDateFr(t.echeance) : 'Sans échéance'}
              </span>
              {enRetard && <Badge tone="rose">En retard</Badge>}
            </div>
          </li>
        );
      })}
    </ul>
  );
}
