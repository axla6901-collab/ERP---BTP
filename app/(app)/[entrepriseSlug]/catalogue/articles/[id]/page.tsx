import Link from 'next/link';
import { notFound } from 'next/navigation';

import { ArticleForm } from '@/components/catalogue/article-form';
import { BomTreeTable, type PrixComposantInfo } from '@/components/catalogue/bom-tree-table';
import { DeleteButton } from '@/components/catalogue/delete-button';
import { FavoriToggle } from '@/components/catalogue/favori-toggle';
import { PrixReferenceQuickForm } from '@/components/catalogue/prix-reference-quick-form';
import { PageToolbar } from '@/components/layout/page-toolbar';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { buttonVariants } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { requireAuthWithMfa } from '@/lib/auth/guards';
import {
  lireArticle,
  listerArticlesAvecPrix,
  mettreAJourArticle,
  supprimerArticle,
  toggleFavoriArticle,
} from '@/lib/catalogue/articles';
import { calculerPrixRevient, chargerArbreBom } from '@/lib/catalogue/bom';
import { listerFamilles } from '@/lib/catalogue/familles';
import { lireNomenclatureCourante } from '@/lib/catalogue/nomenclatures';
import { peutEcrireCatalogue } from '@/lib/catalogue/permissions';
import { enregistrerPrixReference, lirePrixReferenceCourant } from '@/lib/catalogue/prix-articles';
import { listerUnites } from '@/lib/catalogue/unites';
import { cn } from '@/lib/utils';
import { LIBELLES_ARTICLE_TYPE } from '@/lib/validation/catalogue';

function formatMontant(n: number | string | null | undefined): string {
  if (n == null || n === '') return '—';
  const v = typeof n === 'number' ? n : Number(n);
  if (Number.isNaN(v)) return String(n);
  return v.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export default async function ArticleDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const utilisateur = await requireAuthWithMfa();
  const article = await lireArticle(id);
  if (!article) notFound();

  const peutEcrire = peutEcrireCatalogue(utilisateur.role);

  if (!peutEcrire) {
    return (
      <div className="space-y-4">
        <PageToolbar
          title={article.libelle}
          subtitle={`${article.code} · ${LIBELLES_ARTICLE_TYPE[article.type]}`}
        />
        <Card className="max-w-2xl">
          <CardHeader>
            <CardTitle>Détails</CardTitle>
          </CardHeader>
          <CardContent>
            <dl className="grid grid-cols-[auto_1fr] gap-2 text-sm">
              <dt className="text-muted-foreground">Code</dt>
              <dd className="font-mono">{article.code}</dd>
              <dt className="text-muted-foreground">Libellé</dt>
              <dd>{article.libelle}</dd>
              <dt className="text-muted-foreground">Type</dt>
              <dd>{LIBELLES_ARTICLE_TYPE[article.type]}</dd>
              <dt className="text-muted-foreground">Densité</dt>
              <dd>{article.densite ?? '—'}</dd>
              <dt className="text-muted-foreground">Épaisseur (mm)</dt>
              <dd>{article.epaisseur ?? '—'}</dd>
              <dt className="text-muted-foreground">Description</dt>
              <dd>{article.description ?? '—'}</dd>
              <dt className="text-muted-foreground">Statut</dt>
              <dd>
                <Badge tone={article.actif ? 'emerald' : 'neutral'}>
                  {article.actif ? 'Actif' : 'Archivé'}
                </Badge>
              </dd>
            </dl>
          </CardContent>
        </Card>
      </div>
    );
  }

  const estCompose = article.type === 'compose';
  const [familles, unites, nomenclature, prixRevient, prixReference, articlesAvecPrix, arbreBom] =
    await Promise.all([
      listerFamilles(),
      listerUnites(),
      estCompose ? lireNomenclatureCourante(id) : Promise.resolve(null),
      estCompose ? calculerPrixRevient(id) : Promise.resolve(null),
      estCompose ? Promise.resolve(null) : lirePrixReferenceCourant(id),
      estCompose ? listerArticlesAvecPrix() : Promise.resolve([]),
      estCompose ? chargerArbreBom(id) : Promise.resolve([]),
    ]);
  const unitesActives = unites
    .filter((u) => u.actif)
    .map((u) => ({ id: u.id, code: u.code, symbole: u.symbole }));

  // Map articleId → prix retenu (référence pour simple, composition récursive pour composé).
  // Sert au BomTreeTable pour afficher prix unit. + sous-total à chaque niveau.
  const articlesParId = new Map(articlesAvecPrix.map((a) => [a.id, a]));
  const prixParArticle = new Map<string, PrixComposantInfo>(
    articlesAvecPrix.map((a) => [
      a.id,
      { prix: a.prixComposant, symbole: a.prixComposantUniteSymbole },
    ]),
  );

  return (
    <div className="space-y-8">
      <ArticleForm
        titre="Modifier l'article"
        actions={
          <>
            <FavoriToggle
              favori={article.favori}
              action={async (favori) => {
                'use server';
                return toggleFavoriArticle(id, favori);
              }}
            />
            {article.type !== 'compose' ? (
              <Link
                href={`/catalogue/articles/${id}/prix`}
                className={cn(buttonVariants({ variant: 'outline', size: 'sm' }), 'gap-1.5')}
              >
                Historique des prix
              </Link>
            ) : null}
          </>
        }
        familles={familles.map((f) => ({ id: f.id, code: f.code, libelle: f.libelle }))}
        unites={unites.map((u) => ({
          id: u.id,
          code: u.code,
          libelle: u.libelle,
          symbole: u.symbole,
        }))}
        defaultValues={{
          code: article.code,
          libelle: article.libelle,
          familleId: article.familleId,
          type: article.type,
          uniteAchatId: article.uniteAchatId,
          uniteStockId: article.uniteStockId,
          uniteVenteId: article.uniteVenteId,
          fournisseurPrefereId: article.fournisseurPrefereId,
          densite: article.densite,
          epaisseur: article.epaisseur,
          longueurStd: article.longueurStd,
          largeurStd: article.largeurStd,
          description: article.description,
          actif: article.actif,
        }}
        onSubmit={async (values) => {
          'use server';
          return mettreAJourArticle(id, values);
        }}
        successRedirect="/catalogue/articles"
      />

      {!estCompose && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Prix de référence</CardTitle>
            <CardDescription>
              Prix catalogue interne faisant foi. Dès qu&apos;il est renseigné, c&apos;est le prix
              retenu pour le calcul de revient — il prime sur les prix fournisseurs (grilles,
              préféré, moins-disant).{' '}
              <Link
                href={`/catalogue/articles/${id}/prix`}
                className="underline underline-offset-4"
              >
                Voir l&apos;historique complet →
              </Link>
            </CardDescription>
          </CardHeader>
          <CardContent>
            <PrixReferenceQuickForm
              defaultPrix={prixReference?.prixUnitaireHt ?? null}
              defaultUniteId={prixReference?.uniteId ?? article.uniteAchatId ?? null}
              defaultValidFrom={prixReference?.validFrom ?? null}
              unites={unitesActives}
              action={async (input) => {
                'use server';
                return enregistrerPrixReference(id, input);
              }}
            />
          </CardContent>
        </Card>
      )}

      {estCompose && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Composition — prix de référence calculé</CardTitle>
            <CardDescription>
              {nomenclature
                ? `Version courante : v${nomenclature.version} — ${nomenclature.lignes.length} composant${nomenclature.lignes.length > 1 ? 's' : ''}. Le prix de référence d'un article composé est dérivé de sa composition (récursive) — il n'est donc pas saisissable directement.`
                : 'Aucune composition définie. Définis la composition pour calculer le prix de référence de cet ouvrage.'}
            </CardDescription>
          </CardHeader>
          {prixRevient && (
            <CardContent className="space-y-4">
              <div>
                <div className="text-xs uppercase tracking-wide text-muted-foreground">
                  Prix de revient calculé (officiel)
                </div>
                <div className="text-2xl font-semibold tabular-nums">
                  {formatMontant(prixRevient.total)} €
                </div>
                <p className="mt-1 text-xs text-muted-foreground">
                  Calculé via le prix retenu de chaque composant (prix de référence prioritaire,
                  sinon prix fournisseurs).
                </p>
              </div>

              {!prixRevient.ok && prixRevient.missingCount > 0 && (
                <Alert variant="destructive">
                  <AlertTitle>
                    {prixRevient.missingCount} composant{prixRevient.missingCount > 1 ? 's' : ''}{' '}
                    sans prix
                  </AlertTitle>
                  <AlertDescription>
                    Le total n&apos;est pas représentatif. Saisis un prix pour ces articles :
                    <ul className="mt-2 list-disc pl-5 text-xs">
                      {prixRevient.missingArticles.map((aid) => {
                        const a = articlesParId.get(aid);
                        return (
                          <li key={aid}>
                            {a ? (
                              <Link
                                href={
                                  a.type === 'compose'
                                    ? `/catalogue/articles/${aid}/composition`
                                    : `/catalogue/articles/${aid}`
                                }
                                className="underline"
                              >
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

              {arbreBom.length > 0 && (
                <BomTreeTable noeuds={arbreBom} prixParArticle={prixParArticle} />
              )}
            </CardContent>
          )}
          <CardFooter className="gap-2">
            <Link href={`/catalogue/articles/${id}/composition`} className={buttonVariants()}>
              {nomenclature ? 'Modifier la composition' : 'Définir la composition'}
            </Link>
          </CardFooter>
        </Card>
      )}

      <div className="max-w-2xl border-t pt-6">
        <h3 className="mb-2 text-sm font-medium text-destructive">Zone dangereuse</h3>
        <DeleteButton
          label="Supprimer cet article"
          confirmText="L'article sera marqué supprimé. Refusé si utilisé dans une composition ou un tarif (à venir M2.2/M2.3)."
          redirectTo="/catalogue/articles"
          action={async () => {
            'use server';
            return supprimerArticle(id);
          }}
        />
      </div>
    </div>
  );
}
