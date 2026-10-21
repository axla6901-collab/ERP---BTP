import { EmployesTable } from '@/components/rh/employes-table';
import { PageToolbar } from '@/components/layout/page-toolbar';
import { buttonVariants } from '@/components/ui/button';
import { requireAuthWithMfa } from '@/lib/auth/guards';
import { listerEmployes } from '@/lib/rh/employes';
import { peutEcrireEmploye } from '@/lib/rh/permissions';
import { LienTenant } from '@/components/layout/lien-tenant';

export default async function EmployesPage() {
  const utilisateur = await requireAuthWithMfa();
  const items = await listerEmployes();
  const peutEcrire = peutEcrireEmploye(utilisateur.role);

  return (
    <div className="space-y-6">
      <PageToolbar
        title="Employés"
        actions={
          peutEcrire ? (
            <LienTenant href="/rh/employes/nouveau" className={buttonVariants({ size: 'sm' })}>
              + Nouvel employé
            </LienTenant>
          ) : null
        }
      />
      <EmployesTable items={items} peutEcrire={peutEcrire} />
    </div>
  );
}
