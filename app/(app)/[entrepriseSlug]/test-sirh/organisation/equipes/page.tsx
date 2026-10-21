import { PageToolbar } from '@/components/layout/page-toolbar';
import { EquipesSection } from '@/components/test-sirh/organisation/equipes-section';
import { OngletsOrganisation } from '@/components/test-sirh/organisation/onglets-organisation';
import { aujourdhuiIso } from '@/lib/test-sirh/calendrier';
import { baseSirh, exigerContexteSirhPage } from '@/lib/test-sirh/contexte';
import {
  enregistrerEquipe,
  enregistrerMembreEquipe,
  retirerMembreEquipe,
  supprimerEquipe,
} from '@/lib/test-sirh/organisation/equipes';
import { listerEquipes, listerMembresEquipes } from '@/lib/test-sirh/organisation/queries';
import { peutGererSirh, ROLES_SIRH_LECTURE } from '@/lib/test-sirh/permissions';
import { listerEmployesOptions, listerSitesOptions } from '@/lib/test-sirh/referentiels';

/** Test SIRH › Organisation › Équipes (Factorial teams/Team + Membership). */
export default async function OrganisationEquipesPage() {
  const ctx = await exigerContexteSirhPage(ROLES_SIRH_LECTURE);
  const [equipes, membres, employes, sites] = await Promise.all([
    listerEquipes(),
    listerMembresEquipes(),
    listerEmployesOptions({ inclureInactifs: true }),
    listerSitesOptions(),
  ]);
  const base = baseSirh(ctx);
  const actives = equipes.filter((e) => e.actif).length;

  return (
    <div className="space-y-4">
      <PageToolbar
        title="Organisation"
        subtitle={`${equipes.length} équipe${equipes.length > 1 ? 's' : ''} · ${actives} active${actives > 1 ? 's' : ''}`}
        backHref={base}
        backLabel="Test SIRH"
      />
      <OngletsOrganisation base={base} actif="equipes" />
      <EquipesSection
        equipes={equipes}
        membres={membres.map((m) => ({
          id: m.id,
          equipeId: m.equipeId,
          employeId: m.employeId,
          employeNom: m.employeNom,
          employeActif: m.employeActif,
          estResponsable: m.estResponsable,
          dateDebut: m.dateDebut,
          dateFin: m.dateFin,
        }))}
        employes={employes.map((e) => ({ id: e.id, label: e.label, actif: e.actif }))}
        sites={sites}
        peutGerer={peutGererSirh(ctx.utilisateur.role)}
        today={aujourdhuiIso()}
        actions={{
          enregistrer: async (input) => {
            'use server';
            return enregistrerEquipe(input);
          },
          supprimer: async (id) => {
            'use server';
            return supprimerEquipe(id);
          },
          enregistrerMembre: async (input) => {
            'use server';
            return enregistrerMembreEquipe(input);
          },
          retirerMembre: async (id) => {
            'use server';
            return retirerMembreEquipe(id);
          },
        }}
      />
    </div>
  );
}
