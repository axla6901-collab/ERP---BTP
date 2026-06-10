'use client';

import { StarIcon } from 'lucide-react';
import Link from 'next/link';

import { Badge } from '@/components/ui/badge';
import type { ArticleAvecPrix } from '@/lib/catalogue/articles';
import { cn } from '@/lib/utils';

function formatPrix(montant: string | null): string {
  if (!montant) return '—';
  const n = Number(montant);
  if (Number.isNaN(n)) return montant;
  return n.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/** Vue « Grille » du catalogue (cartes), alternative au tableau (maquette 07). */
export function ArticlesGrid({
  items,
  articleIdsChantier,
}: {
  items: ArticleAvecPrix[];
  articleIdsChantier?: Set<string>;
}) {
  const chantierSet = articleIdsChantier ?? new Set<string>();

  if (items.length === 0) {
    return (
      <div className="rounded-xl border border-dashed bg-card p-8 text-center text-sm text-muted-foreground">
        Aucun article.
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
      {items.map((a) => (
        <Link
          key={a.id}
          href={`/catalogue/articles/${a.id}`}
          className={cn(
            'group rounded-xl border bg-card p-4 shadow-sm transition hover:shadow-md',
            a.actif && (a.favori || chantierSet.has(a.id)) && 'border-amber-200',
            a.prixMissing && 'border-rose-200',
            !a.actif && 'opacity-60',
          )}
        >
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <div className="font-mono text-xs text-muted-foreground">{a.code}</div>
              <div className="mt-0.5 font-semibold group-hover:text-amber-700">{a.libelle}</div>
            </div>
            {a.favori && (
              <StarIcon
                className="size-4 shrink-0 fill-amber-400 text-amber-500"
                aria-label="Favori"
              />
            )}
          </div>
          <div className="mt-3 flex items-center justify-between">
            {a.type === 'compose' ? (
              <Badge tone="amber">composé</Badge>
            ) : a.actif ? (
              <Badge tone="emerald">actif</Badge>
            ) : (
              <Badge tone="neutral">archivé</Badge>
            )}
            <div className={cn('font-semibold tabular-nums', a.prixMissing && 'text-rose-600')}>
              {formatPrix(a.prixCourant)} €
            </div>
          </div>
        </Link>
      ))}
    </div>
  );
}
