import { describe, expect, it } from 'vitest';

import {
  calculerSegments,
  syntheseConsommation,
  type PleinPourConso,
} from '@/lib/flotte/consommation';

/** Fabrique un plein avec des valeurs par défaut sensées. */
function plein(p: Partial<PleinPourConso> & { id: string; kilometrage: number }): PleinPourConso {
  return {
    datePlein: '2026-01-01',
    volumeLitres: null,
    energieKwh: null,
    prixHt: null,
    pleinComplet: true,
    ...p,
  };
}

describe('calculerSegments', () => {
  it('calcule la consommation plein-à-plein entre deux pleins complets', () => {
    // 0 km (plein complet, ancre) → 500 km (plein complet, 40 L).
    const segments = calculerSegments([
      plein({ id: 'a', kilometrage: 10000, volumeLitres: '50', prixHt: '75' }),
      plein({ id: 'b', kilometrage: 10500, volumeLitres: '40', prixHt: '60' }),
    ]);
    expect(segments).toHaveLength(1);
    expect(segments[0]).toMatchObject({
      pleinId: 'b',
      distanceKm: 500,
      litres: 40,
      consoLitres100: 8, // 40 L / 500 km * 100
      coutHt: 60,
      coutKm: 0.12, // 60 € / 500 km
    });
  });

  it('agrège les pleins partiels intermédiaires dans le segment suivant', () => {
    // Ancre 10000 (complet) → 10300 partiel 20 L → 10600 complet 25 L.
    // Distance 600 km, litres = 20 + 25 = 45 → 7,5 L/100.
    const segments = calculerSegments([
      plein({ id: 'a', kilometrage: 10000, volumeLitres: '30', pleinComplet: true }),
      plein({ id: 'b', kilometrage: 10300, volumeLitres: '20', pleinComplet: false }),
      plein({ id: 'c', kilometrage: 10600, volumeLitres: '25', pleinComplet: true }),
    ]);
    expect(segments).toHaveLength(1);
    expect(segments[0]).toMatchObject({
      pleinId: 'c',
      distanceKm: 600,
      litres: 45,
      consoLitres100: 7.5,
    });
  });

  it('ignore les pleins avant le premier plein complet (ancre inconnue)', () => {
    const segments = calculerSegments([
      plein({ id: 'a', kilometrage: 10000, volumeLitres: '20', pleinComplet: false }),
      plein({ id: 'b', kilometrage: 10400, volumeLitres: '40', pleinComplet: true }),
      plein({ id: 'c', kilometrage: 10800, volumeLitres: '32', pleinComplet: true }),
    ]);
    // Seul le segment b→c est exploitable (a n'est pas une ancre).
    expect(segments).toHaveLength(1);
    expect(segments[0]).toMatchObject({
      pleinId: 'c',
      distanceKm: 400,
      litres: 32,
      consoLitres100: 8,
    });
  });

  it('trie par kilométrage croissant même si la saisie est désordonnée', () => {
    const segments = calculerSegments([
      plein({ id: 'b', kilometrage: 10500, volumeLitres: '40' }),
      plein({ id: 'a', kilometrage: 10000, volumeLitres: '50' }),
    ]);
    expect(segments).toHaveLength(1);
    expect(segments[0]?.pleinId).toBe('b');
    expect(segments[0]?.distanceKm).toBe(500);
  });

  it('ignore un segment à distance nulle (km identiques)', () => {
    const segments = calculerSegments([
      plein({ id: 'a', kilometrage: 10000, volumeLitres: '50' }),
      plein({ id: 'b', kilometrage: 10000, volumeLitres: '40' }),
    ]);
    expect(segments).toHaveLength(0);
  });

  it('gère les recharges électriques (kWh)', () => {
    const segments = calculerSegments([
      plein({ id: 'a', kilometrage: 20000, energieKwh: '40', pleinComplet: true }),
      plein({ id: 'b', kilometrage: 20300, energieKwh: '45', prixHt: '9', pleinComplet: true }),
    ]);
    expect(segments).toHaveLength(1);
    expect(segments[0]).toMatchObject({ kwh: 45, consoKwh100: 15, litres: null });
  });
});

describe('syntheseConsommation', () => {
  it('agrège dépense totale et moyennes pondérées par la distance', () => {
    const pleins = [
      plein({ id: 'a', kilometrage: 10000, volumeLitres: '50', prixHt: '75' }),
      plein({ id: 'b', kilometrage: 10500, volumeLitres: '40', prixHt: '60' }), // 500 km, 8 L/100
      plein({ id: 'c', kilometrage: 11500, volumeLitres: '90', prixHt: '135' }), // 1000 km, 9 L/100
    ];
    const s = syntheseConsommation(pleins);
    expect(s.nbPleins).toBe(3);
    // Dépense = tous les pleins.
    expect(s.coutTotalHt).toBe(270);
    // Distance des segments = 500 + 1000 = 1500 ; litres = 40 + 90 = 130.
    expect(s.distanceKm).toBe(1500);
    expect(s.litresTotal).toBe(130);
    // Moyenne pondérée = 130 / 1500 * 100 = 8,67.
    expect(s.consoMoyenneLitres100).toBe(8.67);
    // Coût/km = (60 + 135) / 1500 = 0,13.
    expect(s.coutMoyenKm).toBe(0.13);
  });

  it('renvoie des moyennes nulles sans segment exploitable', () => {
    const s = syntheseConsommation([
      plein({ id: 'a', kilometrage: 10000, volumeLitres: '50', prixHt: '75' }),
    ]);
    expect(s.nbPleins).toBe(1);
    expect(s.coutTotalHt).toBe(75);
    expect(s.distanceKm).toBe(0);
    expect(s.consoMoyenneLitres100).toBeNull();
    expect(s.coutMoyenKm).toBeNull();
  });
});
