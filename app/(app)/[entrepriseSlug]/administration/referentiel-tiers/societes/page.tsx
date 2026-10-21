import { SocietesTable } from '@/components/referencement/societes-table';
import { PageToolbar } from '@/components/layout/page-toolbar';
import { buttonVariants } from '@/components/ui/button';
import { requireAuthWithMfa } from '@/lib/auth/guards';
import { listerSocietes } from '@/lib/referencement/societes';
import { peutAdministrerReferentielTiers } from '@/lib/referencement/permissions';
import { LienTenant } from '@/components/layout/lien-tenant';

export default async function SocietesListPage() {
  const utilisateur = await requireAuthWithMfa();
  const items = await listerSocietes();
  const peutEcrire = peutAdministrerReferentielTiers(utilisateur.role);

  return (
    <div className="space-y-6">
      <PageToolbar
        title="Sociétés du groupe"
        subtitle={`${items.length} société${items.length > 1 ? 's' : ''}`}
        actions={
          peutEcrire ? (
            <LienTenant
              href="/administration/referentiel-tiers/societes/nouveau"
              className={buttonVariants({ size: 'sm' })}
            >
              + Nouvelle
            </LienTenant>
          ) : null
        }
      />
      <SocietesTable items={items} peutEcrire={peutEcrire} />
    </div>
  );
}
