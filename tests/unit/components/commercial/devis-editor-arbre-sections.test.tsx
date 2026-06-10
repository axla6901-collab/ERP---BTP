import { describe, expect, it } from 'vitest';

import { construireArbreSections } from '@/components/commercial/devis-editor';
import type { LigneDevisInput } from '@/lib/validation/commercial';

/** Construit une ligne section minimale (seule `designation` est lue par
 *  construireArbreSections). */
function section(designation: string): LigneDevisInput {
  return { type: 'section', designation } as LigneDevisInput;
}

/** Article quelconque — ignoré par la construction de l'arbre (sections only). */
function article(designation: string): LigneDevisInput {
  return { type: 'libre', designation, quantite: '1', unite: 'u' } as LigneDevisInput;
}

/** Raccourci : groupe section à l'index donné. */
function grp(sectionIdx: number) {
  return { sectionIdx, articleIdxs: [] };
}

describe('construireArbreSections', () => {
  it('imbrique les sous-sections sous leur parent selon le préfixe numérique', () => {
    const lignes: LigneDevisInput[] = [
      section('1 GROS OEUVRE'), // 0
      section('1.1 FONDATIONS'), // 1
      article('1.1.1 Terrassement'), // 2 (article, ignoré)
      section('1.2 ELEVATIONS'), // 3
      section('2 SECOND OEUVRE'), // 4
      section('2.1 PLOMBERIE'), // 5
      section('2.1.1 EVACUATIONS'), // 6
    ];
    const sections = [grp(0), grp(1), grp(3), grp(4), grp(5), grp(6)];

    const arbre = construireArbreSections(sections, lignes);

    expect(arbre.map((n) => n.sectionIdx)).toEqual([0, 4]);

    const grosOeuvre = arbre[0]!;
    expect(grosOeuvre.titre).toBe('1 GROS OEUVRE');
    expect(grosOeuvre.enfants.map((n) => n.sectionIdx)).toEqual([1, 3]);
    expect(grosOeuvre.enfants[0]!.enfants).toEqual([]);

    const secondOeuvre = arbre[1]!;
    expect(secondOeuvre.enfants.map((n) => n.sectionIdx)).toEqual([5]);
    expect(secondOeuvre.enfants[0]!.enfants.map((n) => n.sectionIdx)).toEqual([6]);
  });

  it('traite une section sans préfixe numérique comme une racine (niveau 1)', () => {
    const lignes: LigneDevisInput[] = [
      section('2 SECOND OEUVRE'), // 0
      section('2.1 PLOMBERIE'), // 1
      section('Divers'), // 2 — pas de préfixe → racine
    ];
    const arbre = construireArbreSections([grp(0), grp(1), grp(2)], lignes);

    expect(arbre.map((n) => n.sectionIdx)).toEqual([0, 2]);
    expect(arbre[0]!.enfants.map((n) => n.sectionIdx)).toEqual([1]);
    expect(arbre[1]!.titre).toBe('Divers');
  });

  it('remonte correctement après une sous-section profonde', () => {
    const lignes: LigneDevisInput[] = [
      section('1 A'), // 0
      section('1.1 B'), // 1
      section('1.1.1 C'), // 2
      section('1.2 D'), // 3 — doit revenir sous 1, pas sous 1.1.1
    ];
    const arbre = construireArbreSections([grp(0), grp(1), grp(2), grp(3)], lignes);

    expect(arbre.map((n) => n.sectionIdx)).toEqual([0]);
    expect(arbre[0]!.enfants.map((n) => n.sectionIdx)).toEqual([1, 3]);
    expect(arbre[0]!.enfants[0]!.enfants.map((n) => n.sectionIdx)).toEqual([2]);
  });

  it('substitue un libellé par défaut pour une section sans titre', () => {
    const arbre = construireArbreSections([grp(0)], [section('   ')]);
    expect(arbre[0]!.titre).toBe('(section sans titre)');
  });

  it('renvoie un arbre vide sans section', () => {
    expect(construireArbreSections([], [])).toEqual([]);
  });
});
