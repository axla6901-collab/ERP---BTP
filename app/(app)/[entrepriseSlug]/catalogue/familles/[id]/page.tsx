import { notFound } from 'next/navigation';

import { DeleteButton } from '@/components/catalogue/delete-button';
import { FamilleForm } from '@/components/catalogue/famille-form';
import { PageToolbar } from '@/components/layout/page-toolbar';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { requireAuthWithMfa } from '@/lib/auth/guards';
import {
  lireFamille,
  listerFamilles,
  mettreAJourFamille,
  supprimerFamille,
} from '@/lib/catalogue/familles';
import { peutEcrireCatalogue } from '@/lib/catalogue/permissions';

export default async function FamilleDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const utilisateur = await requireAuthWithMfa();
  const famille = await lireFamille(id);
  if (!famille) notFound();

  const peutEcrire = peutEcrireCatalogue(utilisateur.role);

  if (!peutEcrire) {
    return (
      <div className="space-y-4">
        <PageToolbar title={famille.libelle} subtitle={famille.code} />
        <Card className="max-w-2xl">
          <CardHeader>
            <CardTitle>Détails</CardTitle>
          </CardHeader>
          <CardContent>
            <dl className="grid grid-cols-[auto_1fr] gap-2 text-sm">
              <dt className="text-muted-foreground">Code</dt>
              <dd className="font-mono">{famille.code}</dd>
              <dt className="text-muted-foreground">Libellé</dt>
              <dd>{famille.libelle}</dd>
              <dt className="text-muted-foreground">Description</dt>
              <dd>{famille.description ?? '—'}</dd>
              <dt className="text-muted-foreground">Actif</dt>
              <dd>{famille.actif ? 'Oui' : 'Non'}</dd>
            </dl>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Exclure la famille courante des parents possibles (évite auto-référence évidente)
  // Les cycles plus profonds sont rejetés par le trigger Postgres.
  const familles = await listerFamilles();
  const parentsDisponibles = familles
    .filter((f) => f.id !== id)
    .map((f) => ({ id: f.id, code: f.code, libelle: f.libelle }));

  return (
    <div className="space-y-6">
      <FamilleForm
        titre="Modifier la famille"
        parentsDisponibles={parentsDisponibles}
        defaultValues={{
          code: famille.code,
          libelle: famille.libelle,
          parentId: famille.parentId,
          description: famille.description,
          ordre: famille.ordre,
          actif: famille.actif,
        }}
        onSubmit={async (values) => {
          'use server';
          return mettreAJourFamille(id, values);
        }}
        successRedirect="/catalogue/familles"
      />

      <div className="max-w-2xl border-t pt-6">
        <h3 className="mb-2 text-sm font-medium text-destructive">Zone dangereuse</h3>
        <DeleteButton
          label="Supprimer cette famille"
          confirmText="La famille sera marquée supprimée. Refusé si des articles ou sous-familles dépendent encore d'elle."
          redirectTo="/catalogue/familles"
          action={async () => {
            'use server';
            return supprimerFamille(id);
          }}
        />
      </div>
    </div>
  );
}
