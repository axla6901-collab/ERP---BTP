import { describe, expect, it } from 'vitest';

import {
  compterParStatut,
  libelleMajoration,
  libelleVariableHeuresSup,
  motifRefusAnnulation,
  peutAnnulerHeuresSup,
  peutDeciderHeuresSup,
  totauxParMajoration,
  type HeuresSupPourTotaux,
} from '@/lib/test-sirh/temps/heures-sup';

describe('libellés de majoration', () => {
  it('formate le taux', () => {
    expect(libelleMajoration(25)).toBe('+25 %');
    expect(libelleMajoration(0)).toBe('Sans majoration');
    expect(libelleVariableHeuresSup(50)).toBe('Heures supplémentaires +50 %');
    expect(libelleVariableHeuresSup(0)).toBe('Heures supplémentaires (sans majoration)');
  });
});

describe('totauxParMajoration', () => {
  const demandes: HeuresSupPourTotaux[] = [
    { statut: 'approuvee', majorationPct: 25, dureeHeures: '2.50', compensation: 'paiement' },
    { statut: 'approuvee', majorationPct: 25, dureeHeures: 1, compensation: 'recuperation' },
    { statut: 'en_attente', majorationPct: 50, dureeHeures: '3', compensation: 'paiement' },
    { statut: 'refusee', majorationPct: 25, dureeHeures: 8, compensation: 'paiement' },
    { statut: 'annulee', majorationPct: 100, dureeHeures: 2, compensation: 'paiement' },
    { statut: 'approuvee', majorationPct: 0, dureeHeures: '1.25', compensation: 'paiement' },
  ];

  it('cumule les demandes approuvées et en attente par taux (ordre des taux)', () => {
    const { lignes, total } = totauxParMajoration(demandes);
    expect(lignes.map((l) => l.majorationPct)).toEqual([0, 25, 50]);
    expect(lignes[1]).toEqual({
      majorationPct: 25,
      nb: 2,
      heuresApprouvees: 3.5,
      heuresEnAttente: 0,
      heuresPayees: 2.5,
      heuresRecuperees: 1,
    });
    expect(lignes[2]).toMatchObject({ nb: 1, heuresEnAttente: 3, heuresApprouvees: 0 });
    expect(total).toEqual({
      nb: 4,
      heuresApprouvees: 4.75,
      heuresEnAttente: 3,
      heuresPayees: 3.75,
      heuresRecuperees: 1,
    });
  });

  it('renvoie des totaux nuls sans demande', () => {
    expect(totauxParMajoration([])).toEqual({
      lignes: [],
      total: {
        nb: 0,
        heuresApprouvees: 0,
        heuresEnAttente: 0,
        heuresPayees: 0,
        heuresRecuperees: 0,
      },
    });
  });

  it('compte les demandes par statut', () => {
    expect(compterParStatut(demandes)).toEqual({
      brouillon: 0,
      en_attente: 1,
      approuvee: 3,
      refusee: 1,
      annulee: 1,
    });
  });
});

describe('workflow des heures sup.', () => {
  it('ne décide que les demandes en attente', () => {
    expect(peutDeciderHeuresSup('en_attente')).toBe(true);
    expect(peutDeciderHeuresSup('approuvee')).toBe(false);
    expect(peutDeciderHeuresSup('annulee')).toBe(false);
  });

  it('encadre l’annulation', () => {
    expect(peutAnnulerHeuresSup('en_attente', { estValideur: false })).toBe(true);
    expect(peutAnnulerHeuresSup('approuvee', { estValideur: false })).toBe(false);
    expect(peutAnnulerHeuresSup('approuvee', { estValideur: true })).toBe(true);
    expect(peutAnnulerHeuresSup('refusee', { estValideur: true })).toBe(false);
    expect(motifRefusAnnulation('en_attente', { estValideur: false })).toBeNull();
    expect(motifRefusAnnulation('approuvee', { estValideur: false })).toMatch(/valideur/);
    expect(motifRefusAnnulation('annulee', { estValideur: true })).toMatch(/ne peut plus/);
  });
});
