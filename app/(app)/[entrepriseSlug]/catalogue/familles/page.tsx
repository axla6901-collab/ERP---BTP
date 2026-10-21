import { FamillesTable } from '@/components/catalogue/familles-table';
import { PageToolbar } from '@/components/layout/page-toolbar';
import { buttonVariants } from '@/components/ui/button';
import { requireAuthWithMfa } from '@/lib/auth/guards';
import { listerFamilles } from '@/lib/catalogue/familles';
import { peutEcrireCatalogue } from '@/lib/catalogue/permissions';
import { LienTenant } from '@/components/layout/lien-tenant';

export default async function FamillesPage() {
  const utilisateur = await requireAuthWithMfa();
  const familles = await listerFamilles();
  const peutEcrire = peutEcrireCatalogue(utilisateur.role);

  return (
    <div className="space-y-6">
      <PageToolbar
        title="Familles"
        actions={
          peutEcrire ? (
            <LienTenant
              href="/catalogue/familles/nouveau"
              className={buttonVariants({ size: 'sm' })}
            >
              + Nouvelle famille
            </LienTenant>
          ) : null
        }
      />
      <FamillesTable items={familles} peutEcrire={peutEcrire} />
    </div>
  );
}
