import Link from 'next/link';

import { ClientsTable } from '@/components/commercial/clients-table';
import { PageToolbar } from '@/components/layout/page-toolbar';
import { buttonVariants } from '@/components/ui/button';
import { requireAuthWithMfa } from '@/lib/auth/guards';
import { listerClients } from '@/lib/commercial/clients';
import { peutEcrireCommercial } from '@/lib/commercial/permissions';

export default async function ClientsPage() {
  const utilisateur = await requireAuthWithMfa();
  const items = await listerClients();
  const peutEcrire = peutEcrireCommercial(utilisateur.role);

  return (
    <div className="space-y-6">
      <PageToolbar
        title="Clients"
        actions={
          peutEcrire ? (
            <Link
              href="/commercial/clients/nouveau"
              className={buttonVariants({ size: 'sm' })}
            >
              + Nouveau client
            </Link>
          ) : null
        }
      />
      <ClientsTable items={items} peutEcrire={peutEcrire} />
    </div>
  );
}
