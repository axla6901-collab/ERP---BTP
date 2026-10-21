import { UnitesTable } from '@/components/catalogue/unites-table';
import { PageToolbar } from '@/components/layout/page-toolbar';
import { buttonVariants } from '@/components/ui/button';
import { peutAdministrer } from '@/lib/admin/permissions';
import { requireAuthWithMfa } from '@/lib/auth/guards';
import { listerUnites } from '@/lib/catalogue/unites';
import { LienTenant } from '@/components/layout/lien-tenant';

export default async function UnitesPage() {
  const utilisateur = await requireAuthWithMfa();
  const unites = await listerUnites();
  const peutEcrire = peutAdministrer(utilisateur.role);

  return (
    <div className="space-y-6">
      <PageToolbar
        title="Unités"
        actions={
          peutEcrire ? (
            <LienTenant
              href="/administration/unites/nouveau"
              className={buttonVariants({ size: 'sm' })}
            >
              + Nouvelle unité
            </LienTenant>
          ) : null
        }
      />
      <UnitesTable items={unites} peutEcrire={peutEcrire} />
    </div>
  );
}
