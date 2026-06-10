import Link from 'next/link';

import { NaturesDocumentTable } from '@/components/referencement/natures-document-table';
import { PageToolbar } from '@/components/layout/page-toolbar';
import { buttonVariants } from '@/components/ui/button';
import { requireAuthWithMfa } from '@/lib/auth/guards';
import { listerNaturesDocument } from '@/lib/referencement/natures-document';
import { peutAdministrerReferentielTiers } from '@/lib/referencement/permissions';

export default async function NaturesDocumentListPage() {
  const utilisateur = await requireAuthWithMfa();
  const items = await listerNaturesDocument();
  const peutEcrire = peutAdministrerReferentielTiers(utilisateur.role);

  return (
    <div className="space-y-6">
      <PageToolbar
        title="Natures de document"
        subtitle={`${items.length} nature${items.length > 1 ? 's' : ''} de document`}
        actions={
          peutEcrire ? (
            <Link
              href="/administration/referentiel-tiers/natures-document/nouveau"
              className={buttonVariants({ size: 'sm' })}
            >
              + Nouveau
            </Link>
          ) : null
        }
      />
      <NaturesDocumentTable items={items} peutEcrire={peutEcrire} />
    </div>
  );
}
