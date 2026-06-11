import { describe, expect, it } from 'vitest';

import { cascadeDelta, detecterCycle, type CascadeTacheRef } from '@/lib/planning/cascade';

function t(
  id: string,
  predecesseurId: string | null,
  dateDebutPrevue: string | null = null,
  dateFinPrevue: string | null = null,
): CascadeTacheRef {
  return { id, predecesseurId, dateDebutPrevue, dateFinPrevue };
}

describe('cascadeDelta', () => {
  it('renvoie un tableau vide si delta = 0', () => {
    const taches = [
      t('a', null, '2024-01-01', '2024-01-05'),
      t('b', 'a', '2024-01-06', '2024-01-10'),
    ];
    expect(cascadeDelta(taches, 'a', 0)).toEqual([]);
  });

  it('décale un successeur direct du même delta', () => {
    const taches = [
      t('a', null, '2024-01-01', '2024-01-05'),
      t('b', 'a', '2024-01-06', '2024-01-10'),
    ];
    expect(cascadeDelta(taches, 'a', 3)).toEqual([
      { id: 'b', dateDebutPrevue: '2024-01-09', dateFinPrevue: '2024-01-13' },
    ]);
  });

  it('propage en cascade sur une chaîne A → B → C', () => {
    const taches = [
      t('a', null, '2024-01-01', '2024-01-05'),
      t('b', 'a', '2024-01-06', '2024-01-10'),
      t('c', 'b', '2024-01-11', '2024-01-15'),
    ];
    const changes = cascadeDelta(taches, 'a', 5);
    expect(changes).toHaveLength(2);
    expect(changes.find((c) => c.id === 'b')).toEqual({
      id: 'b',
      dateDebutPrevue: '2024-01-11',
      dateFinPrevue: '2024-01-15',
    });
    expect(changes.find((c) => c.id === 'c')).toEqual({
      id: 'c',
      dateDebutPrevue: '2024-01-16',
      dateFinPrevue: '2024-01-20',
    });
  });

  it('propage sur plusieurs branches (A → B, A → C)', () => {
    const taches = [
      t('a', null, '2024-01-01', '2024-01-05'),
      t('b', 'a', '2024-01-06', '2024-01-10'),
      t('c', 'a', '2024-01-08', '2024-01-12'),
    ];
    const changes = cascadeDelta(taches, 'a', 2);
    expect(changes.map((c) => c.id).sort()).toEqual(['b', 'c']);
  });

  it('décale en négatif (vers le passé)', () => {
    const taches = [
      t('a', null, '2024-01-10', '2024-01-15'),
      t('b', 'a', '2024-01-16', '2024-01-20'),
    ];
    expect(cascadeDelta(taches, 'a', -3)).toEqual([
      { id: 'b', dateDebutPrevue: '2024-01-13', dateFinPrevue: '2024-01-17' },
    ]);
  });

  it('ignore les successeurs sans dates planifiées', () => {
    const taches = [
      t('a', null, '2024-01-01', '2024-01-05'),
      t('b', 'a', null, null), // pas planifiée → ignorée
      t('c', 'b', '2024-01-20', '2024-01-25'), // c dépend de b non planifiée → on propage tout de même
    ];
    const changes = cascadeDelta(taches, 'a', 2);
    expect(changes.map((c) => c.id)).toEqual(['c']);
  });

  it('protège contre un cycle DB éventuel (B↔C)', () => {
    const taches = [
      t('a', null, '2024-01-01', '2024-01-05'),
      t('b', 'a', '2024-01-06', '2024-01-10'),
      t('c', 'b', '2024-01-11', '2024-01-15'),
      // cycle : on simule b.pred = c (illégal en DB, simulé ici)
    ];
    // Patch in-memory pour simuler le cycle
    (taches[1] as { predecesseurId: string | null }).predecesseurId = 'c';
    const changes = cascadeDelta(taches, 'a', 2);
    // a → b (via a→b initial) … puis b→c → b à nouveau bloqué par `vus`.
    // Au moins : pas de boucle infinie, et chaque tâche est touchée au plus 1 fois.
    const ids = changes.map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length); // pas de doublon
  });
});

describe('detecterCycle', () => {
  const chain = [t('a', null), t('b', 'a'), t('c', 'b'), t('d', 'c')];

  it('refuse de prendre soi-même comme prédécesseur', () => {
    expect(detecterCycle(chain, 'a', 'a')).toBe(true);
  });

  it('détecte un cycle direct : d → a alors que a → b → c → d', () => {
    // Si on pose a.pred = d, alors d (en remontant) atteint a → cycle.
    expect(detecterCycle(chain, 'a', 'd')).toBe(true);
  });

  it('accepte un lien légal entre deux branches indépendantes', () => {
    const branches = [t('x', null), t('y', null), t('z', 'y')];
    expect(detecterCycle(branches, 'x', 'z')).toBe(false);
  });

  it('s’arrête sur chaîne non bouclée même profonde sans faux positif', () => {
    // Chaîne profonde : n0 ← n1 ← ... ← n49.
    const longChain: CascadeTacheRef[] = [t('n0', null)];
    for (let i = 1; i < 50; i++) longChain.push(t(`n${i}`, `n${i - 1}`));
    // Tâche `x` HORS chaîne prenant `n49` comme prédécesseur → remontée jusqu'à n0,
    // qui n'est pas relié à x : pas de cycle.
    longChain.push(t('x', null));
    expect(detecterCycle(longChain, 'x', 'n49')).toBe(false);
  });
});
