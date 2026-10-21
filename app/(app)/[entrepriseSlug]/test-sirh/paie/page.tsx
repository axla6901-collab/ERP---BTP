import Link from 'next/link';

import { PageToolbar } from '@/components/layout/page-toolbar';
import { PeriodesSection } from '@/components/test-sirh/paie/periodes-section';
import { buttonVariants } from '@/components/ui/button';
import { StatCard, StatGrid } from '@/components/ui/stat-card';
import { aujourdhuiIso } from '@/lib/test-sirh/calendrier';
import { baseSirh, exigerContexteSirhPage } from '@/lib/test-sirh/contexte';
import { formatEuroArrondi, formatNombre } from '@/lib/test-sirh/format';
import {
  libellePeriode,
  memeMois,
  moisDeLaDate,
  proposerNouvellePeriode,
} from '@/lib/test-sirh/paie/periodes';
import { creerPeriodePaie } from '@/lib/test-sirh/paie/periodes-actions';
import { listerPeriodesPaie } from '@/lib/test-sirh/paie/queries';
import { ROLES_SIRH_PAIE } from '@/lib/test-sirh/permissions';
import { LIBELLES_STATUT_PERIODE_PAIE } from '@/lib/validation/test-sirh/enums';
import type { PeriodePaieInput } from '@/lib/validation/test-sirh/paie';

/**
 * Test SIRH › Paie : périodes mensuelles (Factorial payroll/PolicyPeriod,
 * compensations/PayrollRun) et accès à la préparation de paie.
 */
export default async function PaiePage() {
  const ctx = await exigerContexteSirhPage(ROLES_SIRH_PAIE);
  const periodes = await listerPeriodesPaie();
  const today = aujourdhuiIso();
  const base = baseSirh(ctx);
  const cheminPaie = `${base}/paie`;

  const courante = periodes.find((p) => memeMois(p, moisDeLaDate(today))) ?? null;
  const nonCloturees = periodes.filter((p) => p.statut !== 'cloturee').length;
  const proposition = proposerNouvellePeriode(periodes, today);

  return (
    <div className="space-y-4">
      <PageToolbar
        title="Paie"
        subtitle={`${periodes.length} période${periodes.length > 1 ? 's' : ''} · ${nonCloturees} non clôturée${nonCloturees > 1 ? 's' : ''}`}
        backHref={base}
        backLabel="Test SIRH"
        actions={
          courante ? (
            <Link
              href={`${cheminPaie}/${courante.id}`}
              className={buttonVariants({ variant: 'outline', size: 'sm' })}
            >
              Préparer la paie de {libellePeriode(courante).toLowerCase()}
            </Link>
          ) : null
        }
      />

      <StatGrid>
        <StatCard
          label="Période du mois"
          value={libellePeriode(moisDeLaDate(today))}
          tone={courante ? (courante.statut === 'cloturee' ? 'emerald' : 'sky') : 'amber'}
          hint={courante ? LIBELLES_STATUT_PERIODE_PAIE[courante.statut] : 'à créer'}
        />
        <StatCard
          label="Variables du mois"
          value={formatNombre(courante?.nbVariables ?? 0)}
          hint={`${courante?.nbEmployes ?? 0} collaborateur${(courante?.nbEmployes ?? 0) > 1 ? 's' : ''}`}
        />
        <StatCard
          label="Montants du mois"
          value={formatEuroArrondi(courante?.montantTotal ?? 0)}
          hint="primes, frais, indemnités…"
        />
        <StatCard
          label="Périodes non clôturées"
          value={nonCloturees}
          tone={nonCloturees > 1 ? 'amber' : 'default'}
          hint="ouvertes ou en contrôle"
        />
      </StatGrid>

      <PeriodesSection
        periodes={periodes}
        cheminPaie={cheminPaie}
        proposition={proposition}
        actions={{
          creer: async (input: PeriodePaieInput) => {
            'use server';
            return creerPeriodePaie(input);
          },
        }}
      />
    </div>
  );
}
