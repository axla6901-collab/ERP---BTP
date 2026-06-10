import { notFound, redirect } from 'next/navigation';

import { GrilleTarifaireEditor } from '@/components/catalogue/grille-tarifaire-editor';
import { requireAuthWithMfa } from '@/lib/auth/guards';
import { listerArticlesPourSelecteur } from '@/lib/catalogue/articles';
import { creerGrille } from '@/lib/catalogue/grilles-tarifaires';
import { listerUnites } from '@/lib/catalogue/unites';
import { listerChantiersPourSelecteur } from '@/lib/chantiers/chantiers';
import { lireFournisseur } from '@/lib/tiers/fournisseurs';
import { peutEcrireTiers } from '@/lib/tiers/permissions';

export default async function NouvelleGrillePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ chantierId?: string }>;
}) {
  const { id: fournisseurId } = await params;
  const { chantierId: chantierIdParam } = await searchParams;
  const utilisateur = await requireAuthWithMfa();
  if (!peutEcrireTiers(utilisateur.role)) {
    redirect(`/tiers/fournisseurs/${fournisseurId}`);
  }

  const [fournisseur, articles, unites, chantiers] = await Promise.all([
    lireFournisseur(fournisseurId),
    listerArticlesPourSelecteur(),
    listerUnites(),
    listerChantiersPourSelecteur(),
  ]);
  if (!fournisseur) notFound();

  const chantierFige = chantierIdParam
    ? chantiers.find((c) => c.id === chantierIdParam) ?? null
    : null;

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-medium">
          Nouvelle grille tarifaire — {fournisseur.nom}
          {chantierFige && (
            <span className="ml-2 text-base text-muted-foreground">
              pour {chantierFige.numero}
            </span>
          )}
        </h2>
        <p className="text-sm text-muted-foreground">
          Définissez la période de validité, puis ajoutez les articles concernés avec leur prix négocié.
          {chantierFige ? ' Grille rattachée au chantier sélectionné.' : ''}
        </p>
      </div>
      <GrilleTarifaireEditor
        articlesDisponibles={articles}
        unites={unites
          .filter((u) => u.actif)
          .map((u) => ({ id: u.id, code: u.code, symbole: u.symbole }))}
        chantiers={chantiers}
        chantierFige={chantierFige}
        onSubmit={async (values) => {
          'use server';
          return creerGrille(fournisseurId, values);
        }}
        successRedirect={
          chantierFige
            ? `/chantiers/${chantierFige.id}`
            : `/tiers/fournisseurs/${fournisseurId}`
        }
      />
    </div>
  );
}
