'use client';

import { ArrowDownIcon, ArrowUpIcon, ChevronsUpDownIcon, SearchIcon } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useMemo, useState, type KeyboardEvent, type MouseEvent, type ReactNode } from 'react';

import { Input } from '@/components/ui/input';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { cn } from '@/lib/utils';

export type DataTableColumn<T> = {
  /** Identifiant stable de la colonne (sert au tri et à la persistance UI). */
  id: string;
  /** En-tête (string ou JSX). */
  header: ReactNode;
  /** Rendu d'une cellule. */
  cell: (row: T) => ReactNode;
  /**
   * Si fourni, la colonne est triable. Retourne une valeur comparable
   * (string ou number) ou null si la valeur est manquante (les nulls vont
   * en fin de tri ascendant).
   */
  sortAccessor?: (row: T) => string | number | null;
  /**
   * Si fourni, la valeur retournée est concaténée pour la recherche live.
   * Si absent : la colonne est exclue du filtre.
   */
  searchAccessor?: (row: T) => string | null | undefined;
  align?: 'left' | 'right' | 'center';
  className?: string;
  headerClassName?: string;
};

type Props<T> = {
  columns: DataTableColumn<T>[];
  rows: T[];
  /** Clé unique pour chaque ligne (sert au React key). */
  rowKey: (row: T) => string;
  searchPlaceholder?: string;
  /** Message si aucune ligne (avant ou après filtrage). */
  emptyMessage?: ReactNode;
  /** Bouton "Nouveau X" à droite de la barre de recherche. */
  rightActions?: ReactNode;
  /** Tri initial. Si absent : ordre des `rows`. */
  defaultSort?: { id: string; dir: 'asc' | 'desc' };
  /**
   * Si fourni : la ligne entière devient cliquable (navigation vers l'URL
   * retournée). Le bouton/menu d'actions, les boutons internes et les Link
   * d'une cellule continuent de fonctionner — le clic propagé depuis un
   * élément interactif n'est pas intercepté.
   *
   * - Ctrl/Cmd/Shift + clic et clic molette → ouverture dans un nouvel onglet.
   * - Enter au clavier (focus sur la ligne) → navigation.
   */
  rowHref?: (row: T) => string;
  /**
   * Classe(s) appliquée(s) à la `<tr>` selon la ligne (lignes contextuelles :
   * favori/composé = ambre, archivé = atténué, sans prix = alerte). Fusionnée
   * via `cn()` avec les classes internes — n'altère ni la navigation (`rowHref`)
   * ni le tri.
   */
  rowClassName?: (row: T) => string | undefined;
};

/** Sélecteur des éléments dont le clic ne doit PAS déclencher la navigation ligne. */
const INTERACTIVE_SELECTOR =
  'a, button, input, select, textarea, label, [role="button"], [role="link"], [role="checkbox"], [role="menuitem"], [data-no-row-nav]';

function normaliser(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '');
}

function alignClass(align?: 'left' | 'right' | 'center'): string {
  if (align === 'right') return 'text-right';
  if (align === 'center') return 'text-center';
  return '';
}

export function DataTable<T>({
  columns,
  rows,
  rowKey,
  searchPlaceholder = 'Rechercher…',
  emptyMessage,
  rightActions,
  defaultSort,
  rowHref,
  rowClassName,
}: Props<T>) {
  const router = useRouter();
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState<{ id: string; dir: 'asc' | 'desc' } | null>(
    defaultSort ?? null,
  );

  function handleRowClick(e: MouseEvent<HTMLTableRowElement>, href: string) {
    // Si la cible (ou un ancêtre jusqu'à la ligne) est un élément interactif,
    // ne pas naviguer : laisser l'élément gérer le clic normalement.
    const target = e.target as HTMLElement | null;
    if (target && target.closest(INTERACTIVE_SELECTOR)) return;
    // Clic milieu / modificateurs : nouvel onglet.
    if (e.button === 1 || e.ctrlKey || e.metaKey || e.shiftKey) {
      window.open(href, '_blank', 'noopener,noreferrer');
      return;
    }
    router.push(href);
  }

  function handleRowKeyDown(e: KeyboardEvent<HTMLTableRowElement>, href: string) {
    // Le focus doit être sur la ligne elle-même (pas sur un élément interne).
    if (e.target !== e.currentTarget) return;
    if (e.key === 'Enter') {
      e.preventDefault();
      router.push(href);
    }
  }

  function toggleSort(colId: string) {
    setSort((current) => {
      if (!current || current.id !== colId) return { id: colId, dir: 'asc' };
      if (current.dir === 'asc') return { id: colId, dir: 'desc' };
      return null; // 3e clic = reset
    });
  }

  const filteredSorted = useMemo(() => {
    const q = normaliser(query.trim());
    let res = rows;

    if (q.length > 0) {
      res = res.filter((row) => {
        const haystack = columns
          .filter((c) => c.searchAccessor)
          .map((c) => c.searchAccessor!(row) ?? '')
          .join(' · ');
        return normaliser(haystack).includes(q);
      });
    }

    if (sort) {
      const col = columns.find((c) => c.id === sort.id);
      if (col?.sortAccessor) {
        const sorted = [...res].sort((a, b) => {
          const va = col.sortAccessor!(a);
          const vb = col.sortAccessor!(b);
          // null/undefined toujours en queue (peu importe le sens)
          if (va == null && vb == null) return 0;
          if (va == null) return 1;
          if (vb == null) return -1;
          let cmp: number;
          if (typeof va === 'number' && typeof vb === 'number') {
            cmp = va - vb;
          } else {
            cmp = String(va).localeCompare(String(vb), 'fr', { numeric: true });
          }
          return sort.dir === 'asc' ? cmp : -cmp;
        });
        res = sorted;
      }
    }

    return res;
  }, [rows, columns, query, sort]);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative max-w-sm flex-1">
          <SearchIcon
            className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
            aria-hidden="true"
          />
          <Input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={searchPlaceholder}
            className="pl-8"
            aria-label="Rechercher"
          />
        </div>
        <div className="ml-auto flex items-center gap-2">
          <span className="text-xs text-muted-foreground tabular-nums">
            {filteredSorted.length}
            {query ? ` / ${rows.length}` : ''}
          </span>
          {rightActions}
        </div>
      </div>

      {filteredSorted.length === 0 ? (
        <div className="rounded-xl border border-dashed bg-card p-8 text-center text-sm text-muted-foreground">
          {query
            ? `Aucun résultat pour « ${query} ».`
            : emptyMessage ?? 'Aucune donnée.'}
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border bg-card shadow-sm">
          <Table>
            <TableHeader>
              <TableRow>
                {columns.map((col) => {
                  const triable = !!col.sortAccessor;
                  const actif = sort?.id === col.id;
                  return (
                    <TableHead
                      key={col.id}
                      className={cn(alignClass(col.align), col.headerClassName)}
                    >
                      {triable ? (
                        <button
                          type="button"
                          onClick={() => toggleSort(col.id)}
                          className={cn(
                            'inline-flex items-center gap-1 hover:text-foreground',
                            actif ? 'text-foreground' : 'text-muted-foreground',
                            col.align === 'right' && 'ml-auto flex-row-reverse',
                          )}
                          aria-label={`Trier par ${typeof col.header === 'string' ? col.header : col.id}`}
                        >
                          <span>{col.header}</span>
                          {!actif && (
                            <ChevronsUpDownIcon
                              className="size-3 opacity-50"
                              aria-hidden="true"
                            />
                          )}
                          {actif && sort?.dir === 'asc' && (
                            <ArrowUpIcon className="size-3" aria-hidden="true" />
                          )}
                          {actif && sort?.dir === 'desc' && (
                            <ArrowDownIcon className="size-3" aria-hidden="true" />
                          )}
                        </button>
                      ) : (
                        col.header
                      )}
                    </TableHead>
                  );
                })}
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredSorted.map((row) => {
                const href = rowHref?.(row);
                const extra = rowClassName?.(row);
                const baseInteractive = href
                  ? 'cursor-pointer focus:bg-muted/50 focus:outline-none'
                  : undefined;
                return (
                  <TableRow
                    key={rowKey(row)}
                    className={cn(baseInteractive, extra)}
                    {...(href
                      ? {
                          // Pas de role="link" — sinon le rôle natif "row" est
                          // écrasé, ce qui casse l'AT et `getAllByRole('row')`.
                          // L'accessibilité passe par le lien « Ouvrir » de la
                          // colonne actions, déjà focusable au clavier.
                          tabIndex: 0,
                          onClick: (e: MouseEvent<HTMLTableRowElement>) =>
                            handleRowClick(e, href),
                          onAuxClick: (e: MouseEvent<HTMLTableRowElement>) => {
                            // Clic molette : ouvrir en nouvel onglet.
                            if (e.button !== 1) return;
                            const target = e.target as HTMLElement | null;
                            if (target && target.closest(INTERACTIVE_SELECTOR)) return;
                            e.preventDefault();
                            window.open(href, '_blank', 'noopener,noreferrer');
                          },
                          onKeyDown: (e: KeyboardEvent<HTMLTableRowElement>) =>
                            handleRowKeyDown(e, href),
                        }
                      : {})}
                  >
                    {columns.map((col) => (
                      <TableCell
                        key={col.id}
                        className={cn(alignClass(col.align), col.className)}
                      >
                        {col.cell(row)}
                      </TableCell>
                    ))}
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
