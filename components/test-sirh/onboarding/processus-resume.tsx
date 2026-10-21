import Link from 'next/link';
import type { ReactNode } from 'react';

import { SirhVide } from '@/components/test-sirh/sirh-bloc';
import { Badge } from '@/components/ui/badge';
import { formatDateFr } from '@/lib/test-sirh/format';
import { libelleDateReference } from '@/lib/test-sirh/onboarding/planification';
import type { ProcessusLigne } from '@/lib/test-sirh/onboarding/types';

import { BarreProgression, StatutProcessusBadge, TypeProcessusBadge } from './badges-onboarding';

/**
 * Résumé compact des processus d'un collaborateur (dossier collaborateur,
 * « Mon espace ») — server-compatible. Typiquement `listerProcessusEmploye(id)`.
 */
export function ProcessusResume({
  processus,
  today,
  baseFiches = null,
  vide = 'Aucun processus d’onboarding ou de départ.',
}: {
  processus: ProcessusLigne[];
  today: string;
  /** `/<slug>/test-sirh/onboarding` ; null = pas de lien vers la fiche. */
  baseFiches?: string | null;
  vide?: ReactNode;
}) {
  if (processus.length === 0) return <SirhVide>{vide}</SirhVide>;

  return (
    <ul className="divide-y overflow-hidden rounded-md border">
      {processus.map((p) => {
        const enRetardEcheance = p.prochaineEcheance !== null && p.prochaineEcheance < today;
        return (
          <li key={p.id} className="space-y-2 px-4 py-3">
            <div className="flex flex-wrap items-center gap-2">
              <TypeProcessusBadge type={p.typeProcessus} />
              <StatutProcessusBadge statut={p.statut} />
              {p.enRetard > 0 && (
                <Badge tone="rose" shape="pill">
                  {p.enRetard} en retard
                </Badge>
              )}
            </div>
            {baseFiches ? (
              <Link
                href={`${baseFiches}/${p.id}`}
                className="block truncate text-sm font-medium hover:underline"
              >
                {p.libelle}
              </Link>
            ) : (
              <p className="truncate text-sm font-medium">{p.libelle}</p>
            )}
            <BarreProgression faites={p.faites} total={p.total} pourcent={p.pourcent} />
            <p className="text-xs text-muted-foreground">
              {libelleDateReference(p.typeProcessus)} : {formatDateFr(p.dateReference)}
              {p.prochaineEcheance && (
                <>
                  {' · prochaine échéance '}
                  <span
                    className={
                      enRetardEcheance ? 'font-medium text-rose-700 dark:text-rose-300' : undefined
                    }
                  >
                    {formatDateFr(p.prochaineEcheance)}
                  </span>
                </>
              )}
            </p>
          </li>
        );
      })}
    </ul>
  );
}
