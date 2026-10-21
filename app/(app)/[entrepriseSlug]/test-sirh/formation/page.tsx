import { PageToolbar } from '@/components/layout/page-toolbar';
import { CatalogueSection } from '@/components/test-sirh/formation/catalogue-section';
import { OngletsFormation } from '@/components/test-sirh/formation/onglets-formation';
import { StatCard, StatGrid } from '@/components/ui/stat-card';
import { baseSirh, exigerContexteSirhPage } from '@/lib/test-sirh/contexte';
import { enregistrerFormation, supprimerFormation } from '@/lib/test-sirh/formation/catalogue';
import { kpiFormation, listerFormations } from '@/lib/test-sirh/formation/queries';
import { formatEuroArrondi, formatHeures } from '@/lib/test-sirh/format';
import { peutGererSirh, ROLES_SIRH_LECTURE } from '@/lib/test-sirh/permissions';

/** Test SIRH › Formation › Catalogue (Factorial trainings/Training + Category). */
export default async function FormationCataloguePage() {
  const ctx = await exigerContexteSirhPage(ROLES_SIRH_LECTURE);
  const [formations, kpi] = await Promise.all([listerFormations(), kpiFormation()]);
  const base = baseSirh(ctx);
  const actives = formations.filter((f) => f.actif).length;

  return (
    <div className="space-y-4">
      <PageToolbar
        title="Formation"
        subtitle={`${formations.length} formation${formations.length > 1 ? 's' : ''} au catalogue · ${actives} active${actives > 1 ? 's' : ''}`}
        backHref={base}
        backLabel="Test SIRH"
      />
      <OngletsFormation base={base} actif="catalogue" />

      <StatGrid>
        <StatCard
          label={`Heures de formation ${kpi.annee}`}
          value={formatHeures(kpi.heuresAnnee)}
          hint={`${kpi.participantsAnnee} participation${kpi.participantsAnnee > 1 ? 's' : ''} · ${kpi.sessionsAnnee} session${kpi.sessionsAnnee > 1 ? 's' : ''}`}
        />
        <StatCard label={`Coût HT ${kpi.annee}`} value={formatEuroArrondi(kpi.coutAnnee)} />
        <StatCard label="Sessions à venir" value={kpi.sessionsAVenir} tone="sky" />
        <StatCard
          label="Recyclages à prévoir"
          value={kpi.recyclagesAPrevoir}
          hint={
            kpi.qualificationsExpirees > 0
              ? `dont ${kpi.qualificationsExpirees} expirée${kpi.qualificationsExpirees > 1 ? 's' : ''}`
              : 'Échéance sous 90 jours'
          }
          tone={
            kpi.qualificationsExpirees > 0
              ? 'rose'
              : kpi.recyclagesAPrevoir > 0
                ? 'amber'
                : 'default'
          }
        />
      </StatGrid>

      <CatalogueSection
        formations={formations.map((f) => ({
          id: f.id,
          code: f.code,
          intitule: f.intitule,
          categorie: f.categorie,
          organisme: f.organisme,
          modalite: f.modalite,
          dureeHeures: f.dureeHeures,
          coutHt: f.coutHt,
          obligatoire: f.obligatoire,
          validiteMois: f.validiteMois,
          description: f.description,
          actif: f.actif,
          nbSessions: f.nbSessions,
        }))}
        peutGerer={peutGererSirh(ctx.utilisateur.role)}
        actions={{
          enregistrer: async (input) => {
            'use server';
            return enregistrerFormation(input);
          },
          supprimer: async (id) => {
            'use server';
            return supprimerFormation(id);
          },
        }}
      />
    </div>
  );
}
