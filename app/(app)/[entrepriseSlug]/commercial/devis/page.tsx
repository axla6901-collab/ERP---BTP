import Link from 'next/link';

import { DevisTable } from '@/components/commercial/devis-table';
import { PageToolbar } from '@/components/layout/page-toolbar';
import { buttonVariants } from '@/components/ui/button';
import { aPermission, requireAuthWithMfa } from '@/lib/auth/guards';
import { dupliquerDevis, listerDevis } from '@/lib/commercial/devis';
import { peutEcrireCommercial } from '@/lib/commercial/permissions';

export default async function DevisPage() {
  const utilisateur = await requireAuthWithMfa();
  const [items, peutVersionner] = await Promise.all([
    listerDevis(),
    aPermission(utilisateur.roleId, 'COMMERCIAL_DEVIS_VERSION'),
  ]);
  const peutEcrire = peutEcrireCommercial(utilisateur.role);

  return (
    <div className="space-y-6">
      <PageToolbar
        title="Devis"
        actions={
          peutEcrire ? (
            <Link
              href="/commercial/devis/nouveau"
              className={buttonVariants({ size: 'sm' })}
            >
              + Nouveau devis
            </Link>
          ) : null
        }
      />
      <DevisTable
        items={items}
        peutEcrire={peutEcrire}
        peutVersionner={peutVersionner}
        dupliquerAction={
          peutEcrire
            ? async (sourceId, mode) => {
                'use server';
                return dupliquerDevis(sourceId, mode);
              }
            : undefined
        }
      />
    </div>
  );
}
