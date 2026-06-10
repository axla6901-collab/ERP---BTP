import Link from 'next/link';

import { EmployesTable } from '@/components/rh/employes-table';
import { PageToolbar } from '@/components/layout/page-toolbar';
import { buttonVariants } from '@/components/ui/button';
import { requireAuthWithMfa } from '@/lib/auth/guards';
import { listerEmployes } from '@/lib/rh/employes';
import { peutEcrireEmploye } from '@/lib/rh/permissions';

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
            <Link href="/rh/employes/nouveau" className={buttonVariants({ size: 'sm' })}>
              + Nouvel employé
            </Link>
          ) : null
        }
      />
      <EmployesTable items={items} peutEcrire={peutEcrire} />
    </div>
  );
}
