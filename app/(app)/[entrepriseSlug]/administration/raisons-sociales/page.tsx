import { RaisonsSocialesTable } from '@/components/referencement/raisons-sociales-table';
import { PageToolbar } from '@/components/layout/page-toolbar';
import { buttonVariants } from '@/components/ui/button';
import { peutAdministrer } from '@/lib/admin/permissions';
import { requireAuthWithMfa } from '@/lib/auth/guards';
import { listerRaisonsSociales } from '@/lib/referencement/raisons-sociales';
import { LienTenant } from '@/components/layout/lien-tenant';

export default async function RaisonsSocialesPage() {
  const utilisateur = await requireAuthWithMfa();
  const items = await listerRaisonsSociales();
  const peutEcrire = peutAdministrer(utilisateur.role);

  return (
    <div className="space-y-6">
      <PageToolbar
        title="Raisons sociales"
        actions={
          peutEcrire ? (
            <LienTenant
              href="/administration/raisons-sociales/nouveau"
              className={buttonVariants({ size: 'sm' })}
            >
              + Nouvelle raison sociale
            </LienTenant>
          ) : null
        }
      />
      <RaisonsSocialesTable items={items} peutEcrire={peutEcrire} />
    </div>
  );
}
