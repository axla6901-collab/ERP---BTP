import { notFound } from 'next/navigation';

import { DeleteButton } from '@/components/catalogue/delete-button';
import { RaisonSocialeForm } from '@/components/referencement/raison-sociale-form';
import { PageToolbar } from '@/components/layout/page-toolbar';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { peutAdministrer } from '@/lib/admin/permissions';
import { requireAuthWithMfa } from '@/lib/auth/guards';
import {
  lireRaisonSociale,
  mettreAJourRaisonSociale,
  supprimerRaisonSociale,
} from '@/lib/referencement/raisons-sociales';

export default async function RaisonSocialeDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const utilisateur = await requireAuthWithMfa();
  const raisonSociale = await lireRaisonSociale(id);
  if (!raisonSociale) notFound();

  const peutEcrire = peutAdministrer(utilisateur.role);

  if (!peutEcrire) {
    return (
      <div className="space-y-4">
        <PageToolbar title={raisonSociale.raisonSociale} />
        <Card className="max-w-xl">
          <CardHeader>
            <CardTitle>Détails</CardTitle>
          </CardHeader>
          <CardContent>
            <dl className="grid grid-cols-[auto_1fr] gap-2 text-sm">
              <dt className="text-muted-foreground">Raison sociale</dt>
              <dd>{raisonSociale.raisonSociale}</dd>
              <dt className="text-muted-foreground">Active</dt>
              <dd>{raisonSociale.actif ? 'Oui' : 'Non'}</dd>
            </dl>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <RaisonSocialeForm
        titre="Modifier la raison sociale"
        defaultValues={{
          raisonSociale: raisonSociale.raisonSociale,
          actif: raisonSociale.actif,
        }}
        onSubmit={async (values) => {
          'use server';
          return mettreAJourRaisonSociale(id, values);
        }}
        successRedirect="/administration/raisons-sociales"
      />

      <div className="max-w-xl border-t pt-6">
        <h3 className="mb-2 text-sm font-medium text-destructive">Zone dangereuse</h3>
        <DeleteButton
          label="Supprimer cette raison sociale"
          confirmText="La raison sociale sera marquée supprimée. Refusé si elle est encore reliée à un client, fournisseur, sous-traitant ou société."
          redirectTo="/administration/raisons-sociales"
          action={async () => {
            'use server';
            return supprimerRaisonSociale(id);
          }}
        />
      </div>
    </div>
  );
}
