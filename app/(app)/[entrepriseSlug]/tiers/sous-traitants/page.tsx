import { SousTraitantsTable } from '@/components/tiers/sous-traitants-table';
import { PageToolbar } from '@/components/layout/page-toolbar';
import { buttonVariants } from '@/components/ui/button';
import { requireAuthWithMfa } from '@/lib/auth/guards';
import { peutEcrireTiers } from '@/lib/tiers/permissions';
import { changerStatutSousTraitant, listerSousTraitants } from '@/lib/tiers/sous-traitants';
import { LienTenant } from '@/components/layout/lien-tenant';

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
            <LienTenant
              href="/tiers/sous-traitants/nouveau"
              className={buttonVariants({ size: 'sm' })}
            >
              + Nouveau sous-traitant
            </LienTenant>
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
