import Link from 'next/link';

import { SituationsTable } from '@/components/facturation/situations-table';
import { PageToolbar } from '@/components/layout/page-toolbar';
import { buttonVariants } from '@/components/ui/button';
import { requireAuthWithMfa } from '@/lib/auth/guards';
import { peutEcrireFacturation } from '@/lib/facturation/permissions';
import { listerSituations } from '@/lib/facturation/situations';

export default async function SituationsPage() {
  const utilisateur = await requireAuthWithMfa();
  const items = await listerSituations();
  const peutEcrire = peutEcrireFacturation(utilisateur.role);

  return (
    <div className="space-y-6">
      <PageToolbar
        title="Situations de travaux"
        actions={
          peutEcrire ? (
            <Link
              href="/facturation/situations/nouveau"
              className={buttonVariants({ size: 'sm' })}
            >
              + Nouvelle situation
            </Link>
          ) : null
        }
      />
      <SituationsTable items={items} peutEcrire={peutEcrire} />
    </div>
  );
}
