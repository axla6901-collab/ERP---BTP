import { describe, expect, it } from 'vitest';

import {
  dateHeureParis,
  decalageParisMinutes,
  formatEntretien,
  instantDepuisHeureParis,
} from '@/lib/test-sirh/recrutement/fuseau';

describe('decalageParisMinutes', () => {
  it('UTC+1 l’hiver, UTC+2 l’été', () => {
    expect(decalageParisMinutes(new Date('2026-01-15T12:00:00Z'))).toBe(60);
    expect(decalageParisMinutes(new Date('2026-07-15T12:00:00Z'))).toBe(120);
  });

  it('bascules 2026 : dernier dimanche de mars et d’octobre à 01:00 UTC', () => {
    // 29 mars 2026 et 25 octobre 2026.
    expect(decalageParisMinutes(new Date('2026-03-29T00:59:59Z'))).toBe(60);
    expect(decalageParisMinutes(new Date('2026-03-29T01:00:00Z'))).toBe(120);
    expect(decalageParisMinutes(new Date('2026-10-25T00:59:59Z'))).toBe(120);
    expect(decalageParisMinutes(new Date('2026-10-25T01:00:00Z'))).toBe(60);
  });
});

describe('instantDepuisHeureParis / dateHeureParis', () => {
  it('convertit une heure de Paris en instant UTC (été et hiver)', () => {
    expect(instantDepuisHeureParis('2026-10-20', '14:00')).toBe('2026-10-20T12:00:00.000Z');
    expect(instantDepuisHeureParis('2026-12-01', '09:30')).toBe('2026-12-01T08:30:00.000Z');
  });

  it('aller-retour stable', () => {
    for (const [date, heure] of [
      ['2026-10-20', '14:00'],
      ['2026-12-01', '09:30'],
      ['2026-03-29', '10:15'],
      ['2026-10-25', '18:45'],
      ['2027-01-01', '00:05'],
    ] as const) {
      expect(dateHeureParis(instantDepuisHeureParis(date, heure))).toEqual({ date, heure });
    }
  });

  it('heure inexistante (passage à l’heure d’été) décalée d’une heure', () => {
    const instant = instantDepuisHeureParis('2026-03-29', '02:30');
    expect(dateHeureParis(instant)).toEqual({ date: '2026-03-29', heure: '03:30' });
  });

  it('heure ambiguë (retour à l’heure d’hiver) : première occurrence', () => {
    expect(instantDepuisHeureParis('2026-10-25', '02:30')).toBe('2026-10-25T00:30:00.000Z');
  });

  it('change de jour au besoin et gère les valeurs vides / invalides', () => {
    expect(dateHeureParis('2026-10-19T22:30:00.000Z')).toEqual({
      date: '2026-10-20',
      heure: '00:30',
    });
    expect(dateHeureParis(null)).toBeNull();
    expect(dateHeureParis('pas une date')).toBeNull();
    expect(() => instantDepuisHeureParis('2026-10-20', 'xx')).toThrow();
  });
});

describe('formatEntretien', () => {
  it('affiche la date et l’heure de Paris', () => {
    expect(formatEntretien('2026-10-20T12:00:00.000Z')).toBe('20/10/2026 à 14:00');
    expect(formatEntretien(new Date('2026-12-01T08:30:00Z'))).toBe('01/12/2026 à 09:30');
    expect(formatEntretien(null)).toBe('—');
  });
});
