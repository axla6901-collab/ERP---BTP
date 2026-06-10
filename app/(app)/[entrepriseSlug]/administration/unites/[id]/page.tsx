import { notFound } from 'next/navigation';

import { DeleteButton } from '@/components/catalogue/delete-button';
import { UniteForm } from '@/components/catalogue/unite-form';
import { PageToolbar } from '@/components/layout/page-toolbar';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { peutAdministrer } from '@/lib/admin/permissions';
import { requireAuthWithMfa } from '@/lib/auth/guards';
import { lireUnite, mettreAJourUnite, supprimerUnite } from '@/lib/catalogue/unites';

export default async function UniteDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const utilisateur = await requireAuthWithMfa();
  const unite = await lireUnite(id);
  if (!unite) notFound();

  const peutEcrire = peutAdministrer(utilisateur.role);

  if (!peutEcrire) {
    return (
      <div className="space-y-4">
        <PageToolbar title={unite.libelle} subtitle={`${unite.code} · ${unite.symbole}`} />
        <Card className="max-w-xl">
          <CardHeader>
            <CardTitle>Détails</CardTitle>
          </CardHeader>
          <CardContent>
            <dl className="grid grid-cols-[auto_1fr] gap-2 text-sm">
              <dt className="text-muted-foreground">Code</dt>
              <dd className="font-mono">{unite.code}</dd>
              <dt className="text-muted-foreground">Symbole</dt>
              <dd className="font-mono">{unite.symbole}</dd>
              <dt className="text-muted-foreground">Type</dt>
              <dd>{unite.type}</dd>
              <dt className="text-muted-foreground">Actif</dt>
              <dd>{unite.actif ? 'Oui' : 'Non'}</dd>
            </dl>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <UniteForm
        titre="Modifier l'unité"
        defaultValues={{
          code: unite.code,
          libelle: unite.libelle,
          symbole: unite.symbole,
          type: unite.type,
          actif: unite.actif,
        }}
        onSubmit={async (values) => {
          'use server';
          return mettreAJourUnite(id, values);
        }}
        successRedirect="/administration/unites"
      />

      <div className="border-t pt-6 max-w-xl">
        <h3 className="mb-2 text-sm font-medium text-destructive">Zone dangereuse</h3>
        <DeleteButton
          label="Supprimer cette unité"
          confirmText="L'unité sera marquée supprimée. Refusé si elle est utilisée par un article ou une conversion."
          redirectTo="/administration/unites"
          action={async () => {
            'use server';
            return supprimerUnite(id);
          }}
        />
      </div>
    </div>
  );
}
