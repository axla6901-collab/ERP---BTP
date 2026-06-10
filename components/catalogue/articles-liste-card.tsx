'use client';

import { ChevronRightIcon } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useState, type KeyboardEvent } from 'react';

import { ArticlesGrid } from '@/components/catalogue/articles-grid';
import { Badge } from '@/components/ui/badge';
import { SegmentedControl } from '@/components/ui/segmented-control';
import type { ArticleAvecPrix } from '@/lib/catalogue/articles';
import { cn } from '@/lib/utils';

const PAGE_SIZE = 12;

type Vue = 'table' | 'grille';
type SortKey = 'code' | 'libelle' | 'prix' | 'evol';
type Sort = { key: SortKey; dir: 'asc' | 'desc' };

const TRI_OPTIONS: { value: string; label: string; sort: Sort }[] = [
  { value: 'code-asc', label: 'Référence (A → Z)', sort: { key: 'code', dir: 'asc' } },
  { value: 'code-desc', label: 'Référence (Z → A)', sort: { key: 'code', dir: 'desc' } },
  { value: 'libelle-asc', label: 'Libellé (A → Z)', sort: { key: 'libelle', dir: 'asc' } },
  { value: 'prix-asc', label: 'Prix HT croissant', sort: { key: 'prix', dir: 'asc' } },
  { value: 'prix-desc', label: 'Prix HT décroissant', sort: { key: 'prix', dir: 'desc' } },
  { value: 'evol-desc', label: 'Évolution ↓', sort: { key: 'evol', dir: 'desc' } },
];

function formatPrix(montant: string | null): string {
  if (!montant) return '—';
  const n = Number(montant);
  if (Number.isNaN(n)) return montant;
  return n.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function renderEvol(pct: number | null) {
  if (pct == null) return <span className="text-xs text-muted-foreground">—</span>;
  const signe = pct > 0 ? '+' : pct < 0 ? '−' : '';
  const cls = pct > 0 ? 'text-emerald-600' : pct < 0 ? 'text-rose-600' : 'text-muted-foreground';
  const val = Math.abs(pct).toLocaleString('fr-FR', {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  });
  return (
    <span className={cn('text-xs tabular-nums', cls)}>
      {signe}
      {val} %
    </span>
  );
}

function statutBadge(a: ArticleAvecPrix) {
  if (a.type === 'compose') return <Badge tone="amber">composé</Badge>;
  if (!a.actif) return <Badge tone="neutral">archivé</Badge>;
  return <Badge tone="emerald">actif</Badge>;
}

function compareArticles(a: ArticleAvecPrix, b: ArticleAvecPrix, sort: Sort): number {
  let cmp = 0;
  if (sort.key === 'code') cmp = a.code.localeCompare(b.code, 'fr', { numeric: true });
  else if (sort.key === 'libelle') cmp = a.libelle.localeCompare(b.libelle, 'fr');
  else if (sort.key === 'prix') {
    const pa = a.prixCourant != null ? Number(a.prixCourant) : null;
    const pb = b.prixCourant != null ? Number(b.prixCourant) : null;
    if (pa == null && pb == null) cmp = 0;
    else if (pa == null) cmp = 1;
    else if (pb == null) cmp = -1;
    else cmp = pa - pb;
  } else {
    const ea = a.evol30jPct;
    const eb = b.evol30jPct;
    if (ea == null && eb == null) cmp = 0;
    else if (ea == null) cmp = 1;
    else if (eb == null) cmp = -1;
    else cmp = ea - eb;
  }
  return sort.dir === 'asc' ? cmp : -cmp;
}

/**
 * Carte « liste articles » fidèle à la maquette 07 : un seul cadre
 * `rounded-xl border bg-card shadow-sm` contenant l'en-tête (nom de famille +
 * compteur + bascule Tableau/Grille + Trier), le tableau, et le pied de
 * pagination. Tri client + navigation ligne + lignes contextuelles (favori /
 * chantier = ambre, sans prix = rose, archivé = atténué).
 */
export function ArticlesListeCard({
  items,
  titre,
  vue,
  onVueChange,
  articleIdsChantier,
}: {
  items: ArticleAvecPrix[];
  titre: string;
  vue: Vue;
  onVueChange: (v: Vue) => void;
  articleIdsChantier?: Set<string>;
}) {
  const router = useRouter();
  const chantierSet = articleIdsChantier ?? new Set<string>();
  const [tri, setTri] = useState<string>('code-asc');
  const [page, setPage] = useState(1);

  const sort = TRI_OPTIONS.find((o) => o.value === tri)?.sort ?? TRI_OPTIONS[0]!.sort;

  const sorted = useMemo(
    () => [...items].sort((a, b) => compareArticles(a, b, sort)),
    [items, sort],
  );

  // Revenir page 1 quand le jeu filtré ou le tri change.
  useEffect(() => setPage(1), [items, tri]);

  const total = sorted.length;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const pageClamped = Math.min(page, totalPages);
  const start = (pageClamped - 1) * PAGE_SIZE;
  const pageItems = sorted.slice(start, start + PAGE_SIZE);

  function rowClass(a: ArticleAvecPrix): string {
    if (a.actif && (a.favori || chantierSet.has(a.id))) {
      return 'bg-amber-50/40 hover:bg-amber-50/70 dark:bg-amber-950/15';
    }
    if (a.prixMissing) {
      return 'bg-rose-50/30 hover:bg-rose-50/50 dark:bg-rose-950/15';
    }
    if (!a.actif || a.deletedAt) {
      return 'text-muted-foreground hover:bg-muted/50';
    }
    return 'hover:bg-muted/50';
  }

  function go(id: string) {
    router.push(`/catalogue/articles/${id}`);
  }
  function onRowKeyDown(e: KeyboardEvent<HTMLTableRowElement>, id: string) {
    if (e.target !== e.currentTarget) return;
    if (e.key === 'Enter') {
      e.preventDefault();
      go(id);
    }
  }

  return (
    <div className="rounded-xl border bg-card shadow-sm">
      {/* En-tête de la carte */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b px-5 py-3">
        <div className="flex items-center gap-3">
          <h2 className="text-base font-semibold">{titre}</h2>
          <span className="rounded-full bg-muted px-2 py-0.5 text-xs tabular-nums text-muted-foreground">
            {total} article{total > 1 ? 's' : ''}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <SegmentedControl
            aria-label="Affichage"
            options={[
              { value: 'table', label: 'Tableau' },
              { value: 'grille', label: 'Grille' },
            ]}
            value={vue}
            onChange={onVueChange}
          />
          <label className="sr-only" htmlFor="tri-articles">
            Trier
          </label>
          <select
            id="tri-articles"
            value={tri}
            onChange={(e) => setTri(e.target.value)}
            className="rounded-md border bg-card px-2 py-1 text-xs text-muted-foreground hover:bg-muted focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            aria-label="Trier les articles"
          >
            {TRI_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Corps */}
      {total === 0 ? (
        <div className="p-10 text-center text-sm text-muted-foreground">Aucun article.</div>
      ) : vue === 'grille' ? (
        <div className="p-5">
          <ArticlesGrid items={pageItems} articleIdsChantier={chantierSet} />
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="border-b bg-muted/40 text-left text-xs uppercase tracking-widest text-muted-foreground">
              <tr>
                <th className="px-5 py-2.5 font-medium">Référence</th>
                <th className="px-5 py-2.5 font-medium">Libellé</th>
                <th className="px-5 py-2.5 font-medium">Unité</th>
                <th className="px-5 py-2.5 text-right font-medium">Prix HT</th>
                <th className="px-5 py-2.5 text-right font-medium">Évol. 30j</th>
                <th className="px-5 py-2.5 font-medium">Statut</th>
                <th className="w-10" />
              </tr>
            </thead>
            <tbody className="divide-y">
              {pageItems.map((a) => (
                <tr
                  key={a.id}
                  tabIndex={0}
                  onClick={() => go(a.id)}
                  onKeyDown={(e) => onRowKeyDown(e, a.id)}
                  className={cn(
                    'cursor-pointer transition-colors focus:bg-muted/50 focus:outline-none',
                    rowClass(a),
                  )}
                >
                  <td className="px-5 py-3 font-mono text-xs text-muted-foreground">{a.code}</td>
                  <td className="px-5 py-3">
                    <div className="font-medium">{a.libelle}</div>
                    {(a.favori || a.type === 'compose') && (
                      <div className="truncate text-xs">
                        {a.favori && (
                          <span className="text-amber-700 dark:text-amber-400">★ favori</span>
                        )}
                        {a.favori && a.type === 'compose' && (
                          <span className="text-muted-foreground"> · </span>
                        )}
                        {a.type === 'compose' && (
                          <span className="text-amber-700 dark:text-amber-400">composition</span>
                        )}
                      </div>
                    )}
                  </td>
                  <td className="px-5 py-3 text-muted-foreground">
                    {a.uniteAchatSymbole ?? a.uniteVenteSymbole ?? a.uniteStockSymbole ?? '—'}
                  </td>
                  <td className="px-5 py-3 text-right font-medium tabular-nums">
                    <span className={cn(a.prixMissing && 'text-rose-600')}>
                      {formatPrix(a.prixCourant)} €
                    </span>
                  </td>
                  <td className="px-5 py-3 text-right">{renderEvol(a.evol30jPct)}</td>
                  <td className="px-5 py-3">{statutBadge(a)}</td>
                  <td className="px-3 py-3 text-right">
                    <ChevronRightIcon
                      className="ml-auto size-4 text-muted-foreground"
                      aria-hidden="true"
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Pied : pagination */}
      {total > 0 && (
        <div className="flex items-center justify-between border-t px-5 py-3 text-xs text-muted-foreground">
          <div className="tabular-nums">
            {start + 1} à {Math.min(start + PAGE_SIZE, total)} sur {total}
          </div>
          {totalPages > 1 && (
            <div className="flex gap-1">
              <button
                type="button"
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={pageClamped <= 1}
                className="rounded-md border px-2 py-1 hover:bg-muted disabled:opacity-40"
                aria-label="Page précédente"
              >
                ‹
              </button>
              {Array.from({ length: totalPages }, (_, i) => i + 1).map((p) => (
                <button
                  key={p}
                  type="button"
                  onClick={() => setPage(p)}
                  aria-current={p === pageClamped ? 'page' : undefined}
                  className={cn(
                    'rounded-md border px-2 py-1 tabular-nums',
                    p === pageClamped
                      ? 'bg-neutral-900 text-white dark:bg-neutral-100 dark:text-neutral-900'
                      : 'hover:bg-muted',
                  )}
                >
                  {p}
                </button>
              ))}
              <button
                type="button"
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={pageClamped >= totalPages}
                className="rounded-md border px-2 py-1 hover:bg-muted disabled:opacity-40"
                aria-label="Page suivante"
              >
                ›
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
