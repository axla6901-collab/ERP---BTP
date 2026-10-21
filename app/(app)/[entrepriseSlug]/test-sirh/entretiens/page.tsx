import { PageToolbar } from '@/components/layout/page-toolbar';
import { CampagnesSection } from '@/components/test-sirh/entretiens/campagnes-section';
import { OngletsEntretiens } from '@/components/test-sirh/entretiens/onglets-entretiens';
import { StatCard, StatGrid } from '@/components/ui/stat-card';
import {
  changerStatutCampagne,
  enregistrerCampagne,
  lancerCampagne,
  supprimerCampagne,
} from '@/lib/test-sirh/entretiens/campagnes';
import { kpiEntretiens, listerCampagnes } from '@/lib/test-sirh/entretiens/queries';
import { baseSirh, exigerContexteSirhPage } from '@/lib/test-sirh/contexte';
import { peutGererSirh, ROLES_SIRH_LECTURE } from '@/lib/test-sirh/permissions';
import { listerEquipesOptions, listerSitesOptions } from '@/lib/test-sirh/referentiels';

/** Test SIRH › Entretiens & objectifs › Campagnes (Factorial performance/ReviewProcess). */
export default async function EntretiensCampagnesPage() {
  const ctx = await exigerContexteSirhPage(ROLES_SIRH_LECTURE);
  const peutGerer = peutGererSirh(ctx.utilisateur.role);
  const [campagnes, kpi, sites, equipes] = await Promise.all([
    listerCampagnes(),
    kpiEntretiens(),
    peutGerer ? listerSitesOptions() : Promise.resolve([]),
    peutGerer ? listerEquipesOptions() : Promise.resolve([]),
  ]);
  const base = baseSirh(ctx);
  const enCours = campagnes.filter((c) => c.statut === 'en_cours').length;

  return (
    <div className="space-y-4">
      <PageToolbar
        title="Entretiens & objectifs"
        subtitle={`${campagnes.length} campagne${campagnes.length > 1 ? 's' : ''} · ${enCours} en cours`}
        backHref={base}
        backLabel="Test SIRH"
      />
      <OngletsEntretiens base={base} actif="campagnes" />

      <StatGrid>
        <StatCard
          label="Entretiens à planifier"
          value={kpi.aPlanifier}
          tone={kpi.aPlanifier > 0 ? 'amber' : 'default'}
        />
        <StatCard label={`Réalisés en ${kpi.annee}`} value={kpi.realisesAnnee} tone="emerald" />
        <StatCard
          label="Entretiens professionnels en retard"
          value={kpi.professionnelsEnRetard}
          hint={
            kpi.professionnelsAPlanifier > 0
              ? `+ ${kpi.professionnelsAPlanifier} à planifier sous 60 j`
              : 'Obligation biennale (L6315-1)'
          }
          tone={kpi.professionnelsEnRetard > 0 ? 'rose' : 'default'}
        />
        <StatCard label="Objectifs en cours" value={kpi.objectifsEnCours} tone="sky" />
      </StatGrid>

      <CampagnesSection
        campagnes={campagnes.map((c) => ({
          id: c.id,
          libelle: c.libelle,
          typeEntretien: c.typeEntretien,
          dateDebut: c.dateDebut,
          dateLimite: c.dateLimite,
          statut: c.statut,
          description: c.description,
          total: c.total,
          realises: c.realises,
          annules: c.annules,
          pourcentage: c.pourcentage,
        }))}
        peutGerer={peutGerer}
        base={base}
        sites={sites}
        equipes={equipes}
        actions={{
          enregistrer: async (input) => {
            'use server';
            return enregistrerCampagne(input);
          },
          supprimer: async (id) => {
            'use server';
            return supprimerCampagne(id);
          },
          lancer: async (input) => {
            'use server';
            return lancerCampagne(input);
          },
          changerStatut: async (id, statut) => {
            'use server';
            return changerStatutCampagne(id, statut);
          },
        }}
      />
    </div>
  );
}
