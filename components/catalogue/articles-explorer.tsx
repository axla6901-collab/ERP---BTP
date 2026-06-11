'use client';

import { useMemo, useState } from 'react';

import { ArticlesListeCard } from '@/components/catalogue/articles-liste-card';
import { ChantierContexte } from '@/components/chantiers/chantier-contexte';
import { FilterRailItem, FilterRailSection } from '@/components/ui/filter-rail-section';
import { ListLayout } from '@/components/ui/list-layout';
import type { ArticleAvecPrix } from '@/lib/catalogue/articles';

type Vue = 'table' | 'grille';
type ChantierOption = { id: string; numero: string; libelle: string };

const SEPT_JOURS_MS = 7 * 24 * 60 * 60 * 1000;

function QuickFilter({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <label className="flex items-center gap-2">
      <input
        type="checkbox"
        className="accent-amber-500"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
      />
      {label}
    </label>
  );
}

/**
 * Explorateur d'articles (maquette 07) : rail de filtres latéral (familles +
 * fourchette de prix + filtres rapides), bandeau « contexte chantier », bascule
 * Tableau / Grille. Tout le filtrage est client-side sur les `items` déjà
 * chargés/autorisés côté serveur (aucune nouvelle requête).
 */
export function ArticlesExplorer({
  items,
  chantierActif,
  chantiers,
  articleIdsChantier,
}: {
  items: ArticleAvecPrix[];
  chantierActif: ChantierOption | null;
  chantiers: ChantierOption[];
  articleIdsChantier: string[];
}) {
  const prixMaxBound = useMemo(() => {
    const vals = items
      .map((a) => (a.prixCourant != null ? Number(a.prixCourant) : null))
      .filter((n): n is number => n != null && !Number.isNaN(n));
    const max = vals.length ? Math.max(...vals) : 500;
    return Math.max(100, Math.ceil(max / 50) * 50); // arrondi sup. à 50
  }, [items]);

  const [familleId, setFamilleId] = useState<string | null>(null);
  const [actifsOnly, setActifsOnly] = useState(true);
  const [sansPrix, setSansPrix] = useState(false);
  const [composeOnly, setComposeOnly] = useState(false);
  const [modifies7j, setModifies7j] = useState(false);
  const [uniquementChantier, setUniquementChantier] = useState(false);
  const [prixMin, setPrixMin] = useState(0);
  const [prixMax, setPrixMax] = useState(prixMaxBound);
  const [vue, setVue] = useState<Vue>('table');

  const chantierSet = useMemo(() => new Set(articleIdsChantier), [articleIdsChantier]);

  const famillesList = useMemo(() => {
    const map = new Map<string, { id: string; libelle: string; count: number }>();
    for (const a of items) {
      if (!a.familleId) continue;
      const cur = map.get(a.familleId);
      if (cur) cur.count += 1;
      else
        map.set(a.familleId, {
          id: a.familleId,
          libelle: a.familleLibelle ?? a.familleCode ?? '—',
          count: 1,
        });
    }
    return [...map.values()].sort((x, y) => x.libelle.localeCompare(y.libelle, 'fr'));
  }, [items]);

  const familleLibelle = familleId
    ? (famillesList.find((f) => f.id === familleId)?.libelle ?? 'Famille')
    : null;

  const filtered = useMemo(() => {
    return items.filter((a) => {
      if (familleId && a.familleId !== familleId) return false;
      if (actifsOnly && !a.actif) return false;
      if (sansPrix && !a.prixMissing) return false;
      if (composeOnly && a.type !== 'compose') return false;
      if (uniquementChantier && !chantierSet.has(a.id)) return false;
      if (modifies7j) {
        const t = new Date(a.updatedAt).getTime();
        if (Number.isNaN(t) || Date.now() - t > SEPT_JOURS_MS) return false;
      }
      if (a.prixCourant != null) {
        const p = Number(a.prixCourant);
        if (!Number.isNaN(p) && (p < prixMin || p > prixMax)) return false;
      }
      return true;
    });
  }, [
    items,
    familleId,
    actifsOnly,
    sansPrix,
    composeOnly,
    uniquementChantier,
    modifies7j,
    prixMin,
    prixMax,
    chantierSet,
  ]);

  return (
    <div className="space-y-4">
      <ChantierContexte actif={chantierActif} chantiers={chantiers} />

      <ListLayout
        aside={
          <>
            <FilterRailSection
              title="Familles"
              action={
                familleId ? (
                  <button
                    type="button"
                    onClick={() => setFamilleId(null)}
                    className="text-xs text-amber-600 hover:underline"
                  >
                    Tout voir
                  </button>
                ) : undefined
              }
            >
              <ul className="space-y-0.5">
                <li>
                  <FilterRailItem
                    label="Toutes les familles"
                    count={items.length}
                    active={familleId === null}
                    onClick={() => setFamilleId(null)}
                  />
                </li>
                {famillesList.map((f) => (
                  <li key={f.id}>
                    <FilterRailItem
                      label={f.libelle}
                      count={f.count}
                      active={familleId === f.id}
                      onClick={() => setFamilleId(f.id)}
                    />
                  </li>
                ))}
              </ul>
            </FilterRailSection>

            <FilterRailSection title="Fourchette de prix">
              <div className="flex items-center gap-2 text-sm">
                <input
                  type="number"
                  min={0}
                  value={prixMin}
                  onChange={(e) => setPrixMin(Math.max(0, Number(e.target.value) || 0))}
                  className="w-16 rounded-md border border-input bg-transparent px-2 py-1 text-right"
                  aria-label="Prix minimum"
                />
                <span className="text-muted-foreground">€ —</span>
                <input
                  type="number"
                  min={0}
                  value={prixMax}
                  onChange={(e) => setPrixMax(Math.max(0, Number(e.target.value) || 0))}
                  className="w-16 rounded-md border border-input bg-transparent px-2 py-1 text-right"
                  aria-label="Prix maximum"
                />
                <span className="text-muted-foreground">€</span>
              </div>
              <input
                type="range"
                min={0}
                max={prixMaxBound}
                value={Math.min(prixMax, prixMaxBound)}
                onChange={(e) => setPrixMax(Number(e.target.value))}
                className="mt-3 w-full accent-amber-500"
                aria-label="Prix maximum (curseur)"
              />
            </FilterRailSection>

            <FilterRailSection title="Filtres rapides">
              <div className="space-y-1.5 text-sm">
                <QuickFilter
                  label="Actifs uniquement"
                  checked={actifsOnly}
                  onChange={setActifsOnly}
                />
                <QuickFilter label="Sans prix" checked={sansPrix} onChange={setSansPrix} />
                <QuickFilter
                  label="Composition multi-articles"
                  checked={composeOnly}
                  onChange={setComposeOnly}
                />
                <QuickFilter label="Modifiés < 7 j" checked={modifies7j} onChange={setModifies7j} />
                {chantierActif && (
                  <QuickFilter
                    label="Uniquement ce chantier"
                    checked={uniquementChantier}
                    onChange={setUniquementChantier}
                  />
                )}
              </div>
            </FilterRailSection>
          </>
        }
      >
        <ArticlesListeCard
          items={filtered}
          titre={familleLibelle ?? 'Tous les articles'}
          vue={vue}
          onVueChange={setVue}
          articleIdsChantier={chantierSet}
        />
      </ListLayout>
    </div>
  );
}
