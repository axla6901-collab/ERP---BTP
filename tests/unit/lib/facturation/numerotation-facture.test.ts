import { describe, expect, it } from 'vitest';

import {
  libelleNumeroFacture,
  verifierChronologieEmission,
} from '@/lib/facturation/numerotation-facture';

describe('libelleNumeroFacture', () => {
  it('affiche le numéro légal d’une facture émise', () => {
    expect(libelleNumeroFacture('F-2026-000012')).toBe('F-2026-000012');
  });

  it('affiche « Brouillon » tant que la facture n’a pas de numéro', () => {
    expect(libelleNumeroFacture(null)).toBe('Brouillon');
    expect(libelleNumeroFacture(undefined)).toBe('Brouillon');
  });
});

describe('verifierChronologieEmission', () => {
  it('autorise la première émission (aucune facture émise)', () => {
    expect(verifierChronologieEmission('2026-10-20', null)).toBeNull();
  });

  it('autorise une date égale ou postérieure à la dernière facture émise', () => {
    expect(verifierChronologieEmission('2026-10-20', '2026-10-20')).toBeNull();
    expect(verifierChronologieEmission('2026-10-21', '2026-10-20')).toBeNull();
  });

  it('refuse une date antérieure à la dernière facture émise, dates en clair', () => {
    const refus = verifierChronologieEmission('2026-10-15', '2026-10-20');
    expect(refus).toMatch(/Émission impossible/);
    expect(refus).toContain('15/10/2026');
    expect(refus).toContain('20/10/2026');
  });

  it('compare correctement les dates d’années différentes', () => {
    expect(verifierChronologieEmission('2026-12-31', '2027-01-02')).not.toBeNull();
    expect(verifierChronologieEmission('2027-01-02', '2026-12-31')).toBeNull();
  });
});
