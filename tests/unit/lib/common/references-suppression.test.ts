import { describe, expect, it } from 'vitest';

import {
  joindreEnumerationFr,
  messageBlocageSuppression,
  type CompteurReference,
} from '@/lib/common/references-suppression';

describe('joindreEnumerationFr', () => {
  it('liste vide → chaîne vide', () => {
    expect(joindreEnumerationFr([])).toBe('');
  });

  it('un seul élément → tel quel', () => {
    expect(joindreEnumerationFr(['3 devis'])).toBe('3 devis');
  });

  it('deux éléments → "a et b"', () => {
    expect(joindreEnumerationFr(['3 devis', '1 facture'])).toBe('3 devis et 1 facture');
  });

  it('trois éléments → "a, b et c"', () => {
    expect(joindreEnumerationFr(['3 devis', '1 facture', '2 chantiers'])).toBe(
      '3 devis, 1 facture et 2 chantiers',
    );
  });
});

describe('messageBlocageSuppression', () => {
  const devis = (n: number): CompteurReference => ({
    nombre: n,
    singulier: 'devis',
    pluriel: 'devis',
  });
  const facture = (n: number): CompteurReference => ({
    nombre: n,
    singulier: 'facture',
    pluriel: 'factures',
  });
  const chantier = (n: number): CompteurReference => ({
    nombre: n,
    singulier: 'chantier',
    pluriel: 'chantiers',
  });

  it('aucune référence → null (suppression autorisée)', () => {
    expect(messageBlocageSuppression('ce client', [])).toBeNull();
    expect(
      messageBlocageSuppression('ce client', [devis(0), facture(0), chantier(0)]),
    ).toBeNull();
  });

  it('une seule référence singulière', () => {
    expect(messageBlocageSuppression('ce client', [facture(1)])).toBe(
      "Suppression impossible : ce client est référencé par 1 facture. Désactivez-le plutôt si vous ne l'utilisez plus.",
    );
  });

  it('accorde le pluriel selon le nombre', () => {
    expect(messageBlocageSuppression('ce client', [facture(2)])).toContain('2 factures');
    expect(messageBlocageSuppression('ce client', [facture(1)])).toContain('1 facture.');
  });

  it('"devis" invariable au pluriel', () => {
    expect(messageBlocageSuppression('ce client', [devis(3)])).toContain('3 devis');
  });

  it('ignore les compteurs nuls et énumère les non-nuls', () => {
    expect(
      messageBlocageSuppression('ce client', [devis(3), facture(0), chantier(2)]),
    ).toBe(
      "Suppression impossible : ce client est référencé par 3 devis et 2 chantiers. Désactivez-le plutôt si vous ne l'utilisez plus.",
    );
  });

  it('énumération complète à trois termes', () => {
    expect(messageBlocageSuppression('ce client', [devis(3), facture(1), chantier(2)])).toBe(
      "Suppression impossible : ce client est référencé par 3 devis, 1 facture et 2 chantiers. Désactivez-le plutôt si vous ne l'utilisez plus.",
    );
  });

  it('utilise le sujet fourni (fournisseur)', () => {
    expect(
      messageBlocageSuppression('ce fournisseur', [
        { nombre: 1, singulier: 'grille tarifaire', pluriel: 'grilles tarifaires' },
      ]),
    ).toContain('ce fournisseur est référencé par 1 grille tarifaire');
  });
});
