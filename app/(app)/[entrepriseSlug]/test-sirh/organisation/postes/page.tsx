import { PageToolbar } from '@/components/layout/page-toolbar';
import { OngletsOrganisation } from '@/components/test-sirh/organisation/onglets-organisation';
import { PostesSection } from '@/components/test-sirh/organisation/postes-section';
import { baseSirh, exigerContexteSirhPage } from '@/lib/test-sirh/contexte';
import { enregistrerPoste, supprimerPoste } from '@/lib/test-sirh/organisation/postes';
import { listerPostes } from '@/lib/test-sirh/organisation/queries';
import { peutGererSirh, ROLES_SIRH_LECTURE } from '@/lib/test-sirh/permissions';

/** Test SIRH › Organisation › Catalogue des postes (Factorial job_catalog). */
export default async function OrganisationPostesPage() {
  const ctx = await exigerContexteSirhPage(ROLES_SIRH_LECTURE);
  const postes = await listerPostes();
  const base = baseSirh(ctx);

  return (
    <div className="space-y-4">
      <PageToolbar
        title="Organisation"
        subtitle={`${postes.length} poste${postes.length > 1 ? 's' : ''} au catalogue`}
        backHref={base}
        backLabel="Test SIRH"
      />
      <OngletsOrganisation base={base} actif="postes" />
      <PostesSection
        postes={postes}
        peutGerer={peutGererSirh(ctx.utilisateur.role)}
        actions={{
          enregistrer: async (input) => {
            'use server';
            return enregistrerPoste(input);
          },
          supprimer: async (id) => {
            'use server';
            return supprimerPoste(id);
          },
        }}
      />
    </div>
  );
}
