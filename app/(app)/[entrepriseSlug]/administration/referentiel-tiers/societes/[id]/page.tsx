import { notFound } from 'next/navigation';

import { SocieteForm } from '@/components/referencement/societe-form';
import { SocieteReglesManager } from '@/components/referencement/societe-regles-manager';
import { DeleteButton } from '@/components/catalogue/delete-button';
import { FormSection } from '@/components/ui/form-section';
import { requireAuthWithMfa } from '@/lib/auth/guards';
import { lireSociete, mettreAJourSociete, supprimerSociete } from '@/lib/referencement/societes';
import { peutAdministrerReferentielTiers } from '@/lib/referencement/permissions';

const BASE = '/administration/referentiel-tiers/societes';

export default async function SocieteDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const utilisateur = await requireAuthWithMfa();
  const data = await lireSociete(id);
  if (!data) notFound();
  const peutEcrire = peutAdministrerReferentielTiers(utilisateur.role);

  return (
    <div className="space-y-6">
      <SocieteForm
        titre={peutEcrire ? 'Modifier la société' : data.societe.raisonSociale}
        defaultValues={{
          code: data.societe.code,
          raisonSociale: data.societe.raisonSociale,
          siret: data.societe.siret,
          actif: data.societe.actif,
        }}
        onSubmit={async (values) => {
          'use server';
          return mettreAJourSociete(id, values);
        }}
        successRedirect={BASE}
      />

      <div className="max-w-2xl">
        <FormSection number={2} title="Règles applicables" storageKey="societe:regles" collapsible={false}>
          <SocieteReglesManager societeId={id} regles={data.regles} peutEcrire={peutEcrire} />
        </FormSection>
      </div>

      {peutEcrire && (
        <div className="max-w-2xl border-t pt-6">
          <h3 className="mb-2 text-sm font-medium text-destructive">Zone dangereuse</h3>
          <DeleteButton
            label="Supprimer cette société"
            confirmText="La société sera marquée supprimée. Refusé si des tiers y sont rattachés."
            redirectTo={BASE}
            action={async () => {
              'use server';
              return supprimerSociete(id);
            }}
          />
        </div>
      )}
    </div>
  );
}
