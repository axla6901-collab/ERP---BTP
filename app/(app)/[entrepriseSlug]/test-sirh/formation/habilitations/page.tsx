import { PageToolbar } from '@/components/layout/page-toolbar';
import { HabilitationsTable } from '@/components/test-sirh/formation/habilitations-table';
import { OngletsFormation } from '@/components/test-sirh/formation/onglets-formation';
import { StatCard, StatGrid } from '@/components/ui/stat-card';
import { baseSirh, exigerContexteSirhPage } from '@/lib/test-sirh/contexte';
import { inscrireEmployes } from '@/lib/test-sirh/formation/inscriptions';
import {
  listerQualifications,
  listerSessionsAVenirOptions,
} from '@/lib/test-sirh/formation/queries';
import { peutGererSirh, ROLES_SIRH_LECTURE } from '@/lib/test-sirh/permissions';
import { listerEquipesOptions } from '@/lib/test-sirh/referentiels';

/** Test SIRH › Formation › Habilitations & recyclages (validité des qualifications). */
export default async function FormationHabilitationsPage() {
  const ctx = await exigerContexteSirhPage(ROLES_SIRH_LECTURE);
  const [qualifications, sessionsAVenir, equipes] = await Promise.all([
    listerQualifications(),
    listerSessionsAVenirOptions(),
    listerEquipesOptions(),
  ]);
  const base = baseSirh(ctx);

  const expirees = qualifications.filter((q) => q.statut === 'expiree');
  const aRecycler = qualifications.filter((q) => q.statut === 'a_recycler');
  const planifies = qualifications.filter(
    (q) => q.recyclagePlanifie !== null && q.statut !== 'valide',
  ).length;
  const formations = [
    ...new Map(qualifications.map((q) => [q.formationId, q.formationIntitule])).entries(),
  ]
    .map(([id, label]) => ({ id, label }))
    .sort((a, b) => a.label.localeCompare(b.label, 'fr'));

  return (
    <div className="space-y-4">
      <PageToolbar
        title="Formation"
        subtitle={`Habilitations & recyclages · ${qualifications.length} qualification${qualifications.length > 1 ? 's' : ''}`}
        backHref={base}
        backLabel="Test SIRH"
      />
      <OngletsFormation base={base} actif="habilitations" />

      <StatGrid>
        <StatCard
          label="Qualifications valides"
          value={qualifications.length - expirees.length - aRecycler.length}
          tone="emerald"
        />
        <StatCard
          label="À recycler (≤ 90 j)"
          value={aRecycler.length}
          tone={aRecycler.length > 0 ? 'amber' : 'default'}
        />
        <StatCard
          label="Expirées"
          value={expirees.length}
          tone={expirees.length > 0 ? 'rose' : 'default'}
        />
        <StatCard label="Recyclages programmés" value={planifies} tone="sky" />
      </StatGrid>

      <HabilitationsTable
        qualifications={qualifications}
        formations={formations}
        equipes={equipes}
        sessionsAVenir={sessionsAVenir.map((s) => ({
          id: s.id,
          formationId: s.formationId,
          dateDebut: s.dateDebut,
          dateFin: s.dateFin,
          lieu: s.lieu,
          placesRestantes: s.placesRestantes,
        }))}
        base={base}
        peutGerer={peutGererSirh(ctx.utilisateur.role)}
        inscrire={async (input) => {
          'use server';
          return inscrireEmployes(input);
        }}
      />
    </div>
  );
}
