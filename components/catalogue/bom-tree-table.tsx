'use client';

import { ChevronDownIcon, ChevronRightIcon } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import type { ArbreBomNoeud } from '@/lib/catalogue/bom';

export type PrixComposantInfo = {
  prix: string | null;
  symbole: string | null;
};

type Props = {
  noeuds: ArbreBomNoeud[];
  /** Pour chaque articleId, le prix unitaire retenu + symbole d'unité. */
  prixParArticle: Map<string, PrixComposantInfo>;
};

function toNumber(v: string | null | undefined): number | null {
  if (v == null || v === '') return null;
  const n = Number(String(v).replace(',', '.'));
  return Number.isFinite(n) ? n : null;
}

function formatMontant(n: number | null): string {
  if (n == null) return '—';
  return n.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function formatQuantite(q: string): string {
  const n = Number(q);
  if (Number.isNaN(n)) return q;
  return n.toLocaleString('fr-FR', { minimumFractionDigits: 0, maximumFractionDigits: 4 });
}

export function BomTreeTable({ noeuds, prixParArticle }: Props) {
  const [deplies, setDeplies] = useState<Set<string>>(new Set());

  function toggle(id: string) {
    setDeplies((s) => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  // Total estimé racine = somme des sous-totaux des lignes de niveau 1
  const totalEstime = noeuds.reduce((acc, n) => {
    const prix = toNumber(prixParArticle.get(n.composantArticleId)?.prix ?? null);
    const qte = toNumber(n.quantite);
    const perte = toNumber(n.coefficientPerte) ?? 0;
    if (prix == null || qte == null) return acc;
    return acc + qte * (1 + perte) * prix;
  }, 0);

  return (
    <div className="rounded-md border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Composant</TableHead>
            <TableHead className="text-right">Quantité</TableHead>
            <TableHead>Unité</TableHead>
            <TableHead className="text-right">Perte</TableHead>
            <TableHead className="text-right">Prix unit. (€)</TableHead>
            <TableHead className="text-right">Sous-total (€)</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {noeuds.map((n) => (
            <NoeudRows
              key={n.ligneId}
              noeud={n}
              niveau={0}
              prixParArticle={prixParArticle}
              deplies={deplies}
              toggle={toggle}
            />
          ))}
          <TableRow>
            <TableCell colSpan={5} className="text-right text-sm font-medium">
              Total estimé (prix réf. + composition récursive)
            </TableCell>
            <TableCell className="text-right text-base font-semibold tabular-nums">
              {formatMontant(totalEstime)} €
            </TableCell>
          </TableRow>
        </TableBody>
      </Table>
      <p className="border-t bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
        Cliquez sur le chevron d&apos;un sous-ouvrage composé pour afficher ses propres composants.
        Le total peut différer du prix de revient officiel si des grilles fournisseurs ou prix
        négociés sont actifs.
      </p>
    </div>
  );
}

type NoeudRowsProps = {
  noeud: ArbreBomNoeud;
  niveau: number;
  prixParArticle: Map<string, PrixComposantInfo>;
  deplies: Set<string>;
  toggle: (id: string) => void;
};

function NoeudRows({ noeud, niveau, prixParArticle, deplies, toggle }: NoeudRowsProps) {
  const estCompose = noeud.composantType === 'compose';
  const aEnfants = estCompose && !!noeud.enfants && noeud.enfants.length > 0;
  const ouvert = deplies.has(noeud.ligneId);

  const prixInfo = prixParArticle.get(noeud.composantArticleId);
  const prix = toNumber(prixInfo?.prix ?? null);
  const qte = toNumber(noeud.quantite);
  const perteRaw = toNumber(noeud.coefficientPerte) ?? 0;
  const sousTotal = prix != null && qte != null ? qte * (1 + perteRaw) * prix : null;

  // Indentation par niveau (16 px par niveau)
  const indent = niveau * 16;

  return (
    <>
      <TableRow className={niveau > 0 ? 'bg-muted/20' : undefined}>
        <TableCell>
          <div className="flex items-center gap-1" style={{ paddingLeft: indent }}>
            {aEnfants ? (
              <button
                type="button"
                onClick={() => toggle(noeud.ligneId)}
                className="inline-flex size-5 items-center justify-center rounded text-muted-foreground hover:bg-muted hover:text-foreground"
                aria-label={ouvert ? 'Replier' : 'Déplier'}
                aria-expanded={ouvert}
              >
                {ouvert ? (
                  <ChevronDownIcon className="size-4" />
                ) : (
                  <ChevronRightIcon className="size-4" />
                )}
              </button>
            ) : (
              <span className="inline-block size-5" aria-hidden="true" />
            )}
            <Link
              href={
                estCompose
                  ? `/catalogue/articles/${noeud.composantArticleId}/composition`
                  : `/catalogue/articles/${noeud.composantArticleId}`
              }
              className="hover:underline"
            >
              <span className="font-mono text-xs">{noeud.composantCode}</span>
              <span className="ml-2">{noeud.composantLibelle}</span>
              {estCompose && (
                <span className="ml-2 rounded-full border px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide">
                  composé
                </span>
              )}
            </Link>
          </div>
        </TableCell>
        <TableCell className="text-right tabular-nums">{formatQuantite(noeud.quantite)}</TableCell>
        <TableCell className="text-xs">{noeud.uniteEmploiSymbole}</TableCell>
        <TableCell className="text-right text-xs">
          {Number(noeud.coefficientPerte) > 0
            ? `${(Number(noeud.coefficientPerte) * 100).toFixed(1)} %`
            : '—'}
        </TableCell>
        <TableCell className="text-right tabular-nums">
          {prix != null ? (
            <>
              {formatMontant(prix)}
              {prixInfo?.symbole && (
                <span className="ml-1 text-xs text-muted-foreground">/{prixInfo.symbole}</span>
              )}
              {estCompose && (
                <span
                  className="ml-1 text-xs text-muted-foreground"
                  title="Prix de revient calculé récursivement via la composition"
                >
                  (calculé)
                </span>
              )}
            </>
          ) : (
            <span className="text-xs text-muted-foreground">non défini</span>
          )}
        </TableCell>
        <TableCell className="text-right tabular-nums">
          <span className={sousTotal == null ? 'text-muted-foreground' : ''}>
            {formatMontant(sousTotal)}
          </span>
        </TableCell>
      </TableRow>
      {ouvert &&
        noeud.enfants?.map((enfant) => (
          <NoeudRows
            key={enfant.ligneId}
            noeud={enfant}
            niveau={niveau + 1}
            prixParArticle={prixParArticle}
            deplies={deplies}
            toggle={toggle}
          />
        ))}
    </>
  );
}
