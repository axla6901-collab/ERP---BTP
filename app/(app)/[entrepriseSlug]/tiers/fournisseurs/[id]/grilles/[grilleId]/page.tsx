import { notFound, redirect } from 'next/navigation';

import { DeleteButton } from '@/components/catalogue/delete-button';
import { GrilleTarifaireEditor } from '@/components/catalogue/grille-tarifaire-editor';
import { requireAuthWithMfa } from '@/lib/auth/guards';
import { listerArticlesPourSelecteur } from '@/lib/catalogue/articles';
import { lireGrille, mettreAJourGrille, supprimerGrille } from '@/lib/catalogue/grilles-tarifaires';
import { listerUnites } from '@/lib/catalogue/unites';
import { listerChantiersPourSelecteur } from '@/lib/chantiers/chantiers';
import { peutEcrireTiers } from '@/lib/tiers/permissions';

export default async function GrillePage({
  params,
}: {
  params: Promise<{ id: string; grilleId: string }>;
}) {
  const { id: fournisseurId, grilleId } = await params;
  const utilisateur = await requireAuthWithMfa();
  const grille = await lireGrille(grilleId);
  if (!grille || grille.fournisseurId !== fournisseurId) notFound();

  const peutEcrire = peutEcrireTiers(utilisateur.role);
  if (!peutEcrire) {
    redirect(`/tiers/fournisseurs/${fournisseurId}`);
  }

  const [articles, unites, chantiers] = await Promise.all([
    listerArticlesPourSelecteur(),
    listerUnites(),
    listerChantiersPourSelecteur(),
  ]);

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-medium">
          Grille {grille.libelle} — {grille.fournisseurNom}
          {grille.chantierNumero && (
            <span className="ml-2 text-base text-muted-foreground">
              · chantier {grille.chantierNumero}
            </span>
          )}
        </h2>
        <p className="text-sm text-muted-foreground">
          {grille.lignes.length} article{grille.lignes.length > 1 ? 's' : ''} · valide à partir du{' '}
          {grille.validFrom}
          {grille.validTo ? ` jusqu'au ${grille.validTo}` : ' (sans date de fin)'}
        </p>
      </div>

      <GrilleTarifaireEditor
        defaultValues={{
          libelle: grille.libelle,
          chantierId: grille.chantierId,
          validFrom: grille.validFrom,
          validTo: grille.validTo,
          actif: grille.actif,
          notes: grille.notes,
          lignes: grille.lignes.map((l) => ({
            articleId: l.articleId,
            prixUnitaireHt: l.prixUnitaireHt,
            uniteId: l.uniteId,
            referenceFournisseur: l.referenceFournisseur,
            quantiteMin: l.quantiteMin,
            notes: l.notes,
          })),
        }}
        articlesDisponibles={articles}
        unites={unites
          .filter((u) => u.actif)
          .map((u) => ({ id: u.id, code: u.code, symbole: u.symbole }))}
        chantiers={chantiers}
        onSubmit={async (values) => {
          'use server';
          return mettreAJourGrille(grilleId, values);
        }}
        successRedirect={`/tiers/fournisseurs/${fournisseurId}`}
      />

      <div className="max-w-xl border-t pt-6">
        <h3 className="mb-2 text-sm font-medium text-destructive">Zone dangereuse</h3>
        <DeleteButton
          label="Supprimer cette grille"
          confirmText="La grille sera archivée (soft delete). Le calcul de prix courant ne la prendra plus en compte."
          redirectTo={`/tiers/fournisseurs/${fournisseurId}`}
          action={async () => {
            'use server';
            return supprimerGrille(grilleId);
          }}
        />
      </div>
    </div>
  );
}
