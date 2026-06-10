import Link from 'next/link';

import { ChantiersTable } from '@/components/chantiers/chantiers-table';
import { PageToolbar } from '@/components/layout/page-toolbar';
import { buttonVariants } from '@/components/ui/button';
import { requireAuthWithMfa } from '@/lib/auth/guards';
import { listerChantiers } from '@/lib/chantiers/chantiers';
import { peutEcrireChantier } from '@/lib/chantiers/permissions';

export default async function ChantiersPage({
  params,
}: {
  params: Promise<{ entrepriseSlug: string }>;
}) {
  const { entrepriseSlug } = await params;
  const utilisateur = await requireAuthWithMfa();
  const items = await listerChantiers();
  const peutEcrire = peutEcrireChantier(utilisateur.role);

  return (
    <div className="space-y-6">
      <PageToolbar
        title="Chantiers"
        actions={
          peutEcrire ? (
            <Link
              key="nouveau-chantier"
              href={`/${entrepriseSlug}/chantiers/nouveau`}
              className={buttonVariants({ size: 'sm' })}
            >
              + Nouveau chantier
            </Link>
          ) : null
        }
      />
      <ChantiersTable items={items} peutEcrire={peutEcrire} entrepriseSlug={entrepriseSlug} />
    </div>
  );
}
