import { AlertTriangleIcon, ClockIcon } from 'lucide-react';
import Link from 'next/link';

import type { AlerteContrat } from '@/lib/test-sirh/collaborateurs/contrats';
import { cn } from '@/lib/utils';

/** Alerte affichable : alerte de contrat, éventuellement rattachée à un collaborateur. */
export type AlerteContratAffichee = AlerteContrat & {
  contratId?: string;
  employeId?: string;
  employeNom?: string;
};

/**
 * Liste d'alertes contractuelles (fin d'essai, fin de contrat, contrat échu sans
 * motif). Server-compatible : réutilisable dans le dossier collaborateur et le
 * tableau de bord (`lienDossier` = préfixe `/<slug>/test-sirh/collaborateurs`).
 */
export function ListeAlertesContrats({
  alertes,
  lienDossier,
  className,
}: {
  alertes: readonly AlerteContratAffichee[];
  /** Si fourni, le nom du collaborateur pointe vers `${lienDossier}/${employeId}`. */
  lienDossier?: string;
  className?: string;
}) {
  if (alertes.length === 0) return null;
  return (
    <ul className={cn('space-y-2', className)} aria-label="Alertes contrats">
      {alertes.map((a, i) => {
        const critique = a.niveau === 'critique';
        const Icone = critique ? AlertTriangleIcon : ClockIcon;
        return (
          <li
            key={`${a.contratId ?? ''}-${a.type}-${i}`}
            className={cn(
              'flex items-start gap-2 rounded-md border px-3 py-2 text-sm',
              critique
                ? 'border-rose-200 bg-rose-50/60 text-rose-800 dark:border-rose-900/50 dark:bg-rose-950/20 dark:text-rose-300'
                : 'border-amber-200 bg-amber-50/60 text-amber-900 dark:border-amber-900/50 dark:bg-amber-950/20 dark:text-amber-300',
            )}
          >
            <Icone className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
            <span className="min-w-0">
              {a.employeNom &&
                (lienDossier && a.employeId ? (
                  <Link
                    href={`${lienDossier}/${a.employeId}`}
                    className="font-medium underline-offset-2 hover:underline"
                  >
                    {a.employeNom}
                  </Link>
                ) : (
                  <span className="font-medium">{a.employeNom}</span>
                ))}
              {a.employeNom && ' — '}
              {a.message}
            </span>
          </li>
        );
      })}
    </ul>
  );
}
