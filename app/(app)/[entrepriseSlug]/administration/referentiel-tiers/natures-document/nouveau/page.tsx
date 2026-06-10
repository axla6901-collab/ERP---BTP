import { NatureDocumentForm } from '@/components/referencement/nature-document-form';
import { requireAuthWithMfa } from '@/lib/auth/guards';
import { creerNatureDocument } from '@/lib/referencement/natures-document';
import { ROLES_REFERENTIEL_TIERS_WRITE } from '@/lib/referencement/permissions';

export default async function NouvelleNatureDocumentPage() {
  await requireAuthWithMfa(ROLES_REFERENTIEL_TIERS_WRITE);

  return (
    <NatureDocumentForm
      titre="Nouvelle nature de document"
      onSubmit={async (values) => {
        'use server';
        return creerNatureDocument(values);
      }}
      successRedirect="/administration/referentiel-tiers/natures-document"
    />
  );
}
