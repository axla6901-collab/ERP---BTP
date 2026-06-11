import Link from 'next/link';

import { SousTraitantsTable } from '@/components/tiers/sous-traitants-table';
import { PageToolbar } from '@/components/layout/page-toolbar';
import { buttonVariants } from '@/components/ui/button';
import { requireAuthWithMfa } from '@/lib/auth/guards';
import { peutEcrireTiers } from '@/lib/tiers/permissions';
import { changerStatutSousTraitant, listerSousTraitants } from '@/lib/tiers/sous-traitants';

export default async function SousTraitantsPage() {
  const utilisateur = await requireAuthWithMfa();
  const items = await listerSousTraitants();
  const peutEcrire = peutEcrireTiers(utilisateur.role);

  return (
    <div className="space-y-6">
      <PageToolbar
        title="Sous-traitants"
        actions={
          peutEcrire ? (
            <Link href="/tiers/sous-traitants/nouveau" className={buttonVariants({ size: 'sm' })}>
              + Nouveau sous-traitant
            </Link>
          ) : null
        }
      />
      <SousTraitantsTable
        items={items}
        peutEcrire={peutEcrire}
        onChangerStatut={
          peutEcrire
            ? async (id, actif) => {
                'use server';
                return changerStatutSousTraitant(id, actif);
              }
            : undefined
        }
      />
    </div>
  );
}
