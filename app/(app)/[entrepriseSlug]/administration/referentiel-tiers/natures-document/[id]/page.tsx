import { notFound } from 'next/navigation';

import { NatureDocumentForm } from '@/components/referencement/nature-document-form';
import { DeleteButton } from '@/components/catalogue/delete-button';
import { requireAuthWithMfa } from '@/lib/auth/guards';
import {
  lireNatureDocument,
  mettreAJourNatureDocument,
  supprimerNatureDocument,
} from '@/lib/referencement/natures-document';
import { peutAdministrerReferentielTiers } from '@/lib/referencement/permissions';
import type { ModeControleDocument } from '@/lib/validation/referencement-tiers';

const BASE = '/administration/referentiel-tiers/natures-document';

export default async function NatureDocumentDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const utilisateur = await requireAuthWithMfa();
  const nature = await lireNatureDocument(id);
  if (!nature) notFound();
  const peutEcrire = peutAdministrerReferentielTiers(utilisateur.role);

  return (
    <div className="space-y-6">
      <NatureDocumentForm
        titre={peutEcrire ? 'Modifier la nature de document' : nature.libelle}
        defaultValues={{
          code: nature.code,
          libelle: nature.libelle,
          modeControle: nature.modeControle as ModeControleDocument,
          delaiValiditeJours: nature.delaiValiditeJours,
          delaiRelanceJours: nature.delaiRelanceJours,
          ordreAffichage: nature.ordreAffichage,
          actif: nature.actif,
        }}
        onSubmit={async (values) => {
          'use server';
          return mettreAJourNatureDocument(id, values);
        }}
        successRedirect={BASE}
      />

      {peutEcrire && (
        <div className="max-w-2xl border-t pt-6">
          <h3 className="mb-2 text-sm font-medium text-destructive">Zone dangereuse</h3>
          <DeleteButton
            label="Supprimer cette nature de document"
            confirmText="La nature sera marquée supprimée. Refusé si des documents de tiers l’utilisent."
            redirectTo={BASE}
            action={async () => {
              'use server';
              return supprimerNatureDocument(id);
            }}
          />
        </div>
      )}
    </div>
  );
}
