import { notFound } from 'next/navigation';

import { PageToolbar } from '@/components/layout/page-toolbar';
import { ActionsPeriode } from '@/components/test-sirh/paie/actions-periode';
import { PreparationPaie } from '@/components/test-sirh/paie/preparation-paie';
import { StatutPeriodeBadge } from '@/components/test-sirh/paie/statut-periode-badge';
import { StatCard, StatGrid } from '@/components/ui/stat-card';
import { baseSirh, exigerContexteSirhPage } from '@/lib/test-sirh/contexte';
import { formatEuro, formatHeures, formatNombre } from '@/lib/test-sirh/format';
import { resumeImport } from '@/lib/test-sirh/paie/generation';
import { libellePeriode, periodeModifiable } from '@/lib/test-sirh/paie/periodes';
import {
  changerStatutPeriodePaie,
  supprimerPeriodePaie,
} from '@/lib/test-sirh/paie/periodes-actions';
import { chargerPreparationPaie } from '@/lib/test-sirh/paie/queries';
import {
  enregistrerVariablePaie,
  importerElementsValides,
  supprimerVariablePaie,
} from '@/lib/test-sirh/paie/variables';
import { peutGererSirh, ROLES_SIRH_PAIE } from '@/lib/test-sirh/permissions';
import { listerEmployesOptions } from '@/lib/test-sirh/referentiels';
import type { StatutPeriodeInput, VariablePaieInput } from '@/lib/validation/test-sirh/paie';

/**
 * Test SIRH › Paie › Préparation d'une période : variables par collaborateur,
 * import des éléments validés, synthèse et export CSV (Factorial payroll/Supplement,
 * payroll_integrations_base/Code).
 */
export default async function PreparationPaiePage({
  params,
}: {
  params: Promise<{ entrepriseSlug: string; periodeId: string }>;
}) {
  const ctx = await exigerContexteSirhPage(ROLES_SIRH_PAIE);
  const { periodeId } = await params;
  const [preparation, employes] = await Promise.all([
    chargerPreparationPaie(periodeId),
    listerEmployesOptions({ inclureInactifs: true }),
  ]);
  if (!preparation) notFound();

  const { periode, totaux, aImporter } = preparation;
  const base = baseSirh(ctx);
  const cheminPaie = `${base}/paie`;
  const nbAImporter = aImporter.absence + aImporter.heures_sup + aImporter.note_frais;

  return (
    <div className="space-y-4">
      <PageToolbar
        title={`Paie — ${libellePeriode(periode)}`}
        subtitle={
          <span className="inline-flex items-center gap-2">
            <StatutPeriodeBadge statut={periode.statut} />
            {`${formatNombre(totaux.nbVariables)} variable${totaux.nbVariables > 1 ? 's' : ''} · ${formatNombre(totaux.nbEmployes)} collaborateur${totaux.nbEmployes > 1 ? 's' : ''}`}
          </span>
        }
        backHref={cheminPaie}
        backLabel="Paie"
        actions={
          <ActionsPeriode
            periodeId={periode.id}
            statut={periode.statut}
            peutGerer={peutGererSirh(ctx.utilisateur.role)}
            supprimable={periode.statut === 'ouverte' && totaux.nbVariables === 0}
            cheminPaie={cheminPaie}
            actions={{
              changerStatut: async (input: StatutPeriodeInput) => {
                'use server';
                return changerStatutPeriodePaie(input);
              },
              supprimer: async (id: string) => {
                'use server';
                return supprimerPeriodePaie(id);
              },
            }}
          />
        }
      />

      <StatGrid>
        <StatCard
          label="Collaborateurs"
          value={formatNombre(totaux.nbEmployes)}
          hint="avec au moins une variable"
        />
        <StatCard
          label="Heures sup. à payer"
          value={formatHeures(totaux.heuresSup)}
          hint={`${formatNombre(totaux.nbVariables)} variable${totaux.nbVariables > 1 ? 's' : ''} au total`}
        />
        <StatCard
          label="Montants saisis"
          value={formatEuro(totaux.montantTotal)}
          hint="primes, frais, retenues…"
        />
        <StatCard
          label="Éléments à importer"
          value={periodeModifiable(periode.statut) ? nbAImporter : '—'}
          tone={periodeModifiable(periode.statut) && nbAImporter > 0 ? 'amber' : 'default'}
          hint={periodeModifiable(periode.statut) ? resumeImport(aImporter) : 'période clôturée'}
        />
      </StatGrid>

      <PreparationPaie
        periode={{
          id: periode.id,
          annee: periode.annee,
          mois: periode.mois,
          statut: periode.statut,
        }}
        variables={preparation.variables}
        synthese={preparation.synthese}
        csv={preparation.csv}
        aImporter={aImporter}
        employes={employes.map((e) => ({
          id: e.id,
          label: e.actif ? e.label : `${e.label} (sorti)`,
        }))}
        actions={{
          enregistrer: async (input: VariablePaieInput) => {
            'use server';
            return enregistrerVariablePaie(input);
          },
          supprimer: async (id: string) => {
            'use server';
            return supprimerVariablePaie(id);
          },
          importer: async (id: string) => {
            'use server';
            return importerElementsValides(id);
          },
        }}
      />
    </div>
  );
}
