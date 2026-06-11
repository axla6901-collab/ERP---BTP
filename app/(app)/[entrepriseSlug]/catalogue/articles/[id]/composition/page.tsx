import Link from 'next/link';
import { notFound } from 'next/navigation';

import { NomenclatureEditor } from '@/components/catalogue/nomenclature-editor';
import { PageToolbar } from '@/components/layout/page-toolbar';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { requireAuthWithMfa } from '@/lib/auth/guards';
import { lireArticle, listerArticlesAvecPrix } from '@/lib/catalogue/articles';
import { bomWhereUsed, calculerPrixRevient } from '@/lib/catalogue/bom';
import {
  enregistrerNomenclature,
  lireHistoriqueNomenclatures,
  lireNomenclatureCourante,
} from '@/lib/catalogue/nomenclatures';
import { peutEcrireCatalogue } from '@/lib/catalogue/permissions';
import { listerUnites } from '@/lib/catalogue/unites';

function formatMontant(montant: string | null | undefined): string {
  if (!montant) return '—';
  const n = Number(montant);
  if (Number.isNaN(n)) return montant;
  return n.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function formatQuantite(q: string): string {
  const n = Number(q);
  if (Number.isNaN(n)) return q;
  return n.toLocaleString('fr-FR', { minimumFractionDigits: 0, maximumFractionDigits: 4 });
}

export default async function CompositionPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const utilisateur = await requireAuthWithMfa();
  const peutEcrire = peutEcrireCatalogue(utilisateur.role);

  const article = await lireArticle(id);
  if (!article) notFound();

  if (article.type !== 'compose') {
    return (
      <div className="space-y-4">
        <PageToolbar title="Composition" />
        <Alert className="max-w-2xl">
          <AlertTitle>Cet article n&apos;est pas composé</AlertTitle>
          <AlertDescription>
            Seuls les articles de type « composé » peuvent avoir une nomenclature. Modifie le type
            de l&apos;article si tu veux le rendre composé.{' '}
            <Link href={`/catalogue/articles/${id}`} className="underline underline-offset-4">
              Retour à l&apos;article
            </Link>
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  const [courante, historique, articlesAll, unites, ancetres] = await Promise.all([
    lireNomenclatureCourante(id),
    lireHistoriqueNomenclatures(id),
    listerArticlesAvecPrix(),
    listerUnites(),
    bomWhereUsed(id),
  ]);

  // Articles candidats = tous sauf l'article parent + ancêtres (anti-cycle évident côté UI)
  const idsExclus = new Set<string>([id, ...ancetres.map((a) => a.parentId)]);
  const articlesDisponibles = articlesAll
    .filter((a) => !idsExclus.has(a.id))
    .map((a) => ({
      id: a.id,
      code: a.code,
      libelle: a.libelle,
      type: a.type,
      uniteStockSymbole: a.uniteStockSymbole,
      prixComposant: a.prixComposant,
      prixComposantUniteSymbole: a.prixComposantUniteSymbole,
    }));

  // Calcul prix de revient courant
  const prixRevient = courante ? await calculerPrixRevient(id) : null;

  return (
    <div className="space-y-6">
      <PageToolbar
        title={
          <>
            Composition de <span className="font-mono text-sm">{article.code}</span> —{' '}
            {article.libelle}
          </>
        }
        actions={
          <Link
            href={`/catalogue/articles/${id}`}
            className="text-sm text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
          >
            ← Retour à l&apos;article
          </Link>
        }
      />

      {prixRevient && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">
              Prix de revient calculé{courante && ` (v${courante.version})`}
            </CardTitle>
            <CardDescription>
              Somme des composants × quantités (avec perte) × prix retenus.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="text-2xl font-semibold tabular-nums">
              {formatMontant(prixRevient.total)} €
            </div>
            {!prixRevient.ok && prixRevient.missingCount > 0 && (
              <Alert variant="destructive">
                <AlertTitle>
                  {prixRevient.missingCount} composant{prixRevient.missingCount > 1 ? 's' : ''} sans
                  prix
                </AlertTitle>
                <AlertDescription>
                  Le total n&apos;est pas représentatif. Saisis un prix pour ces articles :
                  <ul className="mt-2 list-disc pl-5 text-xs">
                    {prixRevient.missingArticles.map((aid) => {
                      const a = articlesAll.find((x) => x.id === aid);
                      return (
                        <li key={aid}>
                          {a ? (
                            <Link href={`/catalogue/articles/${aid}/prix`} className="underline">
                              {a.code} — {a.libelle}
                            </Link>
                          ) : (
                            aid
                          )}
                        </li>
                      );
                    })}
                  </ul>
                </AlertDescription>
              </Alert>
            )}
          </CardContent>
        </Card>
      )}

      {peutEcrire ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">
              {courante
                ? `Modifier la composition (version courante : v${courante.version})`
                : 'Définir la composition'}
            </CardTitle>
            <CardDescription>
              Ajoute les composants (matériaux, prestations, sous-ouvrages) avec leur quantité par
              unité de l&apos;ouvrage.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <NomenclatureEditor
              defaultLignes={
                courante?.lignes.map((l) => ({
                  composantArticleId: l.composantArticleId,
                  quantite: l.quantite,
                  uniteEmploiId: l.uniteEmploiId,
                  coefficientPerte: l.coefficientPerte,
                  notes: l.notes,
                })) ?? []
              }
              articlesDisponibles={articlesDisponibles}
              unites={unites.map((u) => ({ id: u.id, code: u.code, symbole: u.symbole }))}
              onSubmit={async (values) => {
                'use server';
                return enregistrerNomenclature(id, values);
              }}
            />
          </CardContent>
        </Card>
      ) : (
        courante && (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">
                Composition courante (v{courante.version})
              </CardTitle>
            </CardHeader>
            <CardContent>
              <ul className="text-sm">
                {courante.lignes.map((l) => (
                  <li key={l.id} className="border-b py-1 last:border-0">
                    {formatQuantite(l.quantite)} {l.uniteEmploiSymbole} de{' '}
                    <span className="font-mono text-xs">{l.composantCode}</span> —{' '}
                    {l.composantLibelle}
                    {Number(l.coefficientPerte) > 0 && (
                      <span className="ml-2 text-xs text-muted-foreground">
                        (perte {(Number(l.coefficientPerte) * 100).toFixed(1)} %)
                      </span>
                    )}
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        )
      )}

      {historique.length > 1 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">
              Historique des versions ({historique.length})
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {historique.map((v) => (
              <details key={v.id} className="rounded border p-3 text-sm">
                <summary className="cursor-pointer">
                  <span className="font-medium">v{v.version}</span>
                  <span className="ml-2 text-xs text-muted-foreground">
                    {v.libelle ?? '(sans libellé)'} —{' '}
                    {v.validTo
                      ? `valide du ${new Date(v.validFrom).toLocaleDateString('fr-FR')} au ${new Date(v.validTo).toLocaleDateString('fr-FR')}`
                      : `courante depuis le ${new Date(v.validFrom).toLocaleDateString('fr-FR')}`}
                  </span>
                </summary>
                <ul className="mt-2 space-y-1">
                  {v.lignes.map((l) => (
                    <li key={l.id} className="text-xs text-muted-foreground">
                      {formatQuantite(l.quantite)} {l.uniteEmploiSymbole} de {l.composantCode}{' '}
                      {Number(l.coefficientPerte) > 0
                        ? `(+ ${(Number(l.coefficientPerte) * 100).toFixed(1)} %)`
                        : ''}
                    </li>
                  ))}
                </ul>
              </details>
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
