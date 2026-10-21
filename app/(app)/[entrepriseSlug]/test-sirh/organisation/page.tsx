import { PageToolbar } from '@/components/layout/page-toolbar';
import { OngletsOrganisation } from '@/components/test-sirh/organisation/onglets-organisation';
import { SitesSection } from '@/components/test-sirh/organisation/sites-section';
import { baseSirh, exigerContexteSirhPage } from '@/lib/test-sirh/contexte';
import { listerSites } from '@/lib/test-sirh/organisation/queries';
import { enregistrerSite, supprimerSite } from '@/lib/test-sirh/organisation/sites';
import { peutGererSirh, ROLES_SIRH_LECTURE } from '@/lib/test-sirh/permissions';

/** Test SIRH › Organisation › Sites (lieux de travail — Factorial locations). */
export default async function OrganisationSitesPage() {
  const ctx = await exigerContexteSirhPage(ROLES_SIRH_LECTURE);
  const sites = await listerSites();
  const base = baseSirh(ctx);

  return (
    <div className="space-y-4">
      <PageToolbar
        title="Organisation"
        subtitle={`${sites.length} site${sites.length > 1 ? 's' : ''}`}
        backHref={base}
        backLabel="Test SIRH"
      />
      <OngletsOrganisation base={base} actif="sites" />
      <SitesSection
        sites={sites.map((s) => ({
          id: s.id,
          code: s.code,
          nom: s.nom,
          typeSite: s.typeSite,
          adresseLigne1: s.adresseLigne1,
          adresseLigne2: s.adresseLigne2,
          codePostal: s.codePostal,
          ville: s.ville,
          pays: s.pays,
          telephone: s.telephone,
          actif: s.actif,
          notes: s.notes,
          nbCollaborateurs: s.nbCollaborateurs,
        }))}
        peutGerer={peutGererSirh(ctx.utilisateur.role)}
        actions={{
          enregistrer: async (input) => {
            'use server';
            return enregistrerSite(input);
          },
          supprimer: async (id) => {
            'use server';
            return supprimerSite(id);
          },
        }}
      />
    </div>
  );
}
