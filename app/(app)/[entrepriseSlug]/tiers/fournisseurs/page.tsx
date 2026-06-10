import Link from 'next/link';

import { FournisseursTable } from '@/components/tiers/fournisseurs-table';
import { PageToolbar } from '@/components/layout/page-toolbar';
import { buttonVariants } from '@/components/ui/button';
import { requireAuthWithMfa } from '@/lib/auth/guards';
import { changerStatutFournisseur, listerFournisseurs } from '@/lib/tiers/fournisseurs';
import { peutEcrireTiers } from '@/lib/tiers/permissions';

export default async function FournisseursPage() {
  const utilisateur = await requireAuthWithMfa();
  const items = await listerFournisseurs();
  const peutEcrire = peutEcrireTiers(utilisateur.role);

  return (
    <div className="space-y-6">
      <PageToolbar
        title="Fournisseurs"
        actions={
          peutEcrire ? (
            <Link
              href="/tiers/fournisseurs/nouveau"
              className={buttonVariants({ size: 'sm' })}
            >
              + Nouveau fournisseur
            </Link>
          ) : null
        }
      />
      <FournisseursTable
        items={items}
        peutEcrire={peutEcrire}
        onChangerStatut={
          peutEcrire
            ? async (id, actif) => {
                'use server';
                return changerStatutFournisseur(id, actif);
              }
            : undefined
        }
      />
    </div>
  );
}
