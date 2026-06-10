import Link from 'next/link';

import { CorpsEtatTable } from '@/components/referencement/corps-etat-table';
import { PageToolbar } from '@/components/layout/page-toolbar';
import { buttonVariants } from '@/components/ui/button';
import { requireAuthWithMfa } from '@/lib/auth/guards';
import { listerCorpsEtat } from '@/lib/referencement/corps-etat';
import { peutAdministrerReferentielTiers } from '@/lib/referencement/permissions';

export default async function CorpsEtatListPage() {
  const utilisateur = await requireAuthWithMfa();
  const items = await listerCorpsEtat();
  const peutEcrire = peutAdministrerReferentielTiers(utilisateur.role);

  return (
    <div className="space-y-6">
      <PageToolbar
        title="Corps d’état"
        subtitle={`${items.length} corps d’état`}
        actions={
          peutEcrire ? (
            <Link
              href="/administration/referentiel-tiers/corps-etat/nouveau"
              className={buttonVariants({ size: 'sm' })}
            >
              + Nouveau
            </Link>
          ) : null
        }
      />
      <CorpsEtatTable items={items} peutEcrire={peutEcrire} />
    </div>
  );
}
