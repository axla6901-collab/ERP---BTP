import { notFound } from 'next/navigation';

import { FournisseurPrefereSelector } from '@/components/catalogue/fournisseur-prefere-selector';
import { PrixForm } from '@/components/catalogue/prix-form';
import { PageToolbar } from '@/components/layout/page-toolbar';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { requireAuthWithMfa } from '@/lib/auth/guards';
import { lireArticle } from '@/lib/catalogue/articles';
import { listerFournisseurs } from '@/lib/tiers/fournisseurs';
import { peutEcrireCatalogue } from '@/lib/catalogue/permissions';
import {
  definirFournisseurPrefere,
  enregistrerPrix,
  listerPrixArticle,
  prixCourant,
} from '@/lib/catalogue/prix-articles';
import { listerUnites } from '@/lib/catalogue/unites';

function formatMontant(montant: string | null | undefined): string {
  if (!montant) return '—';
  const n = Number(montant);
  if (Number.isNaN(n)) return montant;
  return n.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function libelleSource(
  source: 'grille_prefere' | 'prefere' | 'reference' | 'grille_mini' | 'mini_fournisseur' | null,
): string {
  switch (source) {
    case 'grille_prefere':
      return 'Grille fournisseur préféré';
    case 'prefere':
      return 'Fournisseur préféré';
    case 'reference':
      return 'Référence générique';
    case 'grille_mini':
      return 'Grille moins-disante';
    case 'mini_fournisseur':
      return 'Fournisseur le moins cher';
    default:
      return 'Aucun prix actif';
  }
}

export default async function ArticlePrixPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const utilisateur = await requireAuthWithMfa();
  const peutEcrire = peutEcrireCatalogue(utilisateur.role);

  const [article, prixList, courant, unites, fournisseursAll] = await Promise.all([
    lireArticle(id),
    listerPrixArticle(id),
    prixCourant(id),
    listerUnites(),
    listerFournisseurs(),
  ]);

  if (!article) notFound();

  const prixActifs = prixList.filter((p) => !p.validTo);
  const prixFermes = prixList.filter((p) => !!p.validTo);

  // Fournisseurs disponibles pour le select « préféré » = ceux ayant un prix actif
  const idsFournisseursAvecPrix = new Set(
    prixActifs.map((p) => p.fournisseurId).filter((x): x is string => !!x),
  );
  const fournisseursDispoPrefere = fournisseursAll.filter((f) => idsFournisseursAvecPrix.has(f.id));

  return (
    <div className="space-y-6">
      <PageToolbar
        title={
          <>
            Prix de <span className="font-mono text-sm">{article.code}</span> — {article.libelle}
          </>
        }
      />

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Prix retenu pour le calcul de revient</CardTitle>
          <CardDescription>
            {courant.source ? libelleSource(courant.source) : 'Aucun prix actif renseigné.'}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-semibold tabular-nums">
            {formatMontant(courant.prix)} €
            {courant.prix && (
              <span className="ml-2 text-sm font-normal text-muted-foreground">
                / {unites.find((u) => u.id === courant.uniteId)?.symbole ?? '?'}
              </span>
            )}
          </div>
        </CardContent>
      </Card>

      {peutEcrire && fournisseursDispoPrefere.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Fournisseur préféré</CardTitle>
          </CardHeader>
          <CardContent>
            <FournisseurPrefereSelector
              articleId={id}
              fournisseurPrefereId={article.fournisseurPrefereId}
              fournisseursDisponibles={fournisseursDispoPrefere}
              action={async (articleId, fournisseurId) => {
                'use server';
                return definirFournisseurPrefere(articleId, fournisseurId);
              }}
            />
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Prix actifs ({prixActifs.length})</CardTitle>
          <CardDescription>
            Un par fournisseur, plus optionnellement une référence générique.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {prixActifs.length === 0 ? (
            <Alert>
              <AlertTitle>Aucun prix renseigné</AlertTitle>
              <AlertDescription>
                Saisis-en un ci-dessous pour pouvoir calculer le prix de revient.
              </AlertDescription>
            </Alert>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Fournisseur</TableHead>
                  <TableHead className="text-right">Prix HT</TableHead>
                  <TableHead>Unité</TableHead>
                  <TableHead>Réf. cat.</TableHead>
                  <TableHead className="text-right">Qté min</TableHead>
                  <TableHead>Valide depuis</TableHead>
                  <TableHead>Notes</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {prixActifs.map((p) => (
                  <TableRow key={p.id}>
                    <TableCell>
                      {p.fournisseurNom ? (
                        <>
                          <span className="font-mono text-xs">{p.fournisseurCode}</span>
                          <span className="ml-2">{p.fournisseurNom}</span>
                        </>
                      ) : (
                        <span className="text-xs italic text-muted-foreground">
                          Référence générique
                        </span>
                      )}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatMontant(p.prixUnitaireHt)}
                    </TableCell>
                    <TableCell className="text-xs">{p.uniteSymbole ?? '—'}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {p.referenceFournisseur ?? '—'}
                    </TableCell>
                    <TableCell className="text-right text-xs tabular-nums">
                      {p.quantiteMin ?? '—'}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">{p.validFrom}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">{p.notes ?? ''}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {peutEcrire && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Saisir un nouveau prix</CardTitle>
            <CardDescription>
              Si un prix actif existe déjà pour le même fournisseur (ou la référence), il sera fermé
              automatiquement à la veille du nouveau valid_from.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <PrixForm
              defaultUniteId={article.uniteAchatId ?? unites[0]?.id ?? ''}
              unites={unites.map((u) => ({ id: u.id, code: u.code, symbole: u.symbole }))}
              fournisseurs={fournisseursAll.map((f) => ({ id: f.id, code: f.code, nom: f.nom }))}
              onSubmit={async (values) => {
                'use server';
                return enregistrerPrix(id, values);
              }}
            />
          </CardContent>
        </Card>
      )}

      {prixFermes.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">
              Historique des prix antérieurs ({prixFermes.length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Fournisseur</TableHead>
                  <TableHead className="text-right">Prix HT</TableHead>
                  <TableHead>Période</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {prixFermes.map((p) => (
                  <TableRow key={p.id} className="text-muted-foreground">
                    <TableCell className="text-xs">
                      {p.fournisseurNom ?? <em>Référence générique</em>}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatMontant(p.prixUnitaireHt)}
                    </TableCell>
                    <TableCell className="text-xs">
                      {p.validFrom} → {p.validTo}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
