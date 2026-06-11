import { notFound } from 'next/navigation';

import { CorpsEtatForm } from '@/components/referencement/corps-etat-form';
import { DeleteButton } from '@/components/catalogue/delete-button';
import { requireAuthWithMfa } from '@/lib/auth/guards';
import {
  lireCorpsEtat,
  mettreAJourCorpsEtat,
  supprimerCorpsEtat,
} from '@/lib/referencement/corps-etat';
import { peutAdministrerReferentielTiers } from '@/lib/referencement/permissions';

const BASE = '/administration/referentiel-tiers/corps-etat';

export default async function CorpsEtatDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const utilisateur = await requireAuthWithMfa();
  const corps = await lireCorpsEtat(id);
  if (!corps) notFound();
  const peutEcrire = peutAdministrerReferentielTiers(utilisateur.role);

  return (
    <div className="space-y-6">
      <CorpsEtatForm
        titre={peutEcrire ? 'Modifier le corps d’état' : corps.libelle}
        defaultValues={{
          code: corps.code,
          libelle: corps.libelle,
          ordreAffichage: corps.ordreAffichage,
          actif: corps.actif,
        }}
        onSubmit={async (values) => {
          'use server';
          return mettreAJourCorpsEtat(id, values);
        }}
        successRedirect={BASE}
      />

      {peutEcrire && (
        <div className="max-w-2xl border-t pt-6">
          <h3 className="mb-2 text-sm font-medium text-destructive">Zone dangereuse</h3>
          <DeleteButton
            label="Supprimer ce corps d’état"
            confirmText="Le corps d’état sera marqué supprimé. Refusé s’il est utilisé par un tier."
            redirectTo={BASE}
            action={async () => {
              'use server';
              return supprimerCorpsEtat(id);
            }}
          />
        </div>
      )}
    </div>
  );
}
