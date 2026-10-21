import { describe, expect, it } from 'vitest';

import {
  formatAnciennete,
  formatDateFr,
  formatDateHeure,
  formatEuro,
  formatEuroArrondi,
  formatHeure,
  formatHeures,
  formatJourCourt,
  formatJours,
  formatMinutes,
  formatMois,
  formatNombre,
  formatPourcent,
  formatTaille,
  initiales,
  nomComplet,
  versNombre,
} from '@/lib/test-sirh/format';

describe('format SIRH', () => {
  it('convertit les valeurs numériques (numeric Drizzle compris)', () => {
    expect(versNombre('12.50')).toBe(12.5);
    expect(versNombre('3,5')).toBe(3.5);
    expect(versNombre('')).toBeNull();
    expect(versNombre(null)).toBeNull();
    expect(versNombre('abc')).toBeNull();
  });

  it('formate les dates', () => {
    expect(formatDateFr('2026-06-13')).toBe('13/06/2026');
    expect(formatDateFr(null)).toBe('—');
    expect(formatJourCourt('2026-10-19')).toBe('lun. 19/10');
    expect(formatMois(2026, 10)).toBe('octobre 2026');
    // Heure de Paris : UTC+2 en heure d'été (jusqu'au 25/10/2026), UTC+1 ensuite.
    expect(formatDateHeure('2026-10-19T14:05:00Z')).toBe('19/10/2026 16:05');
    expect(formatDateHeure('2026-12-01T23:30:00Z')).toBe('02/12/2026 00:30');
    expect(formatDateHeure(null)).toBe('—');
  });

  it('formate les nombres et montants à la française', () => {
    expect(formatNombre(1234.5)).toBe('1 234,5');
    expect(formatNombre('1000.00')).toBe('1 000');
    expect(formatNombre(-2.25, 2)).toBe('-2,25');
    expect(formatEuro('1234.5')).toBe('1 234,50 €');
    expect(formatEuro(null)).toBe('—');
    expect(formatEuroArrondi(8420.4)).toBe('8 420 €');
  });

  it('formate les durées', () => {
    expect(formatJours(2.5)).toBe('2,5 j');
    expect(formatJours('1.00')).toBe('1 j');
    expect(formatHeures(7.5)).toBe('7 h 30');
    expect(formatHeures(8)).toBe('8 h');
    expect(formatHeures(-1.25)).toBe('−1 h 15');
    expect(formatMinutes(510)).toBe('8 h 30');
    expect(formatMinutes(null)).toBe('—');
    expect(formatHeure('08:30:00')).toBe('08:30');
    expect(formatPourcent(42.4)).toBe('42 %');
  });

  it('formate les noms, initiales et tailles', () => {
    expect(nomComplet('Marc', 'Dubois')).toBe('Marc Dubois');
    expect(nomComplet(null, 'Dubois')).toBe('Dubois');
    expect(nomComplet(null, null)).toBe('—');
    expect(initiales('marc', 'dubois')).toBe('MD');
    expect(initiales(null, null)).toBe('?');
    expect(formatTaille(2048)).toBe('2 Ko');
    expect(formatTaille(1536)).toBe('1,5 Ko');
    expect(formatTaille(0)).toBe('—');
  });

  it('calcule une ancienneté lisible', () => {
    expect(formatAnciennete('2023-08-15', '2026-10-19')).toBe('3 ans 2 mois');
    expect(formatAnciennete('2026-05-20', '2026-10-19')).toBe('4 mois');
    expect(formatAnciennete('2026-10-01', '2026-10-19')).toBe('< 1 mois');
    expect(formatAnciennete(null, '2026-10-19')).toBe('—');
  });
});
