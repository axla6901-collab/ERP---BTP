import { describe, expect, it } from 'vitest';

import {
  appliquerRemiseGlobale,
  calculerMontantRemiseGlobale,
  libelleRemiseGlobale,
  type RemiseGlobale,
  type TotauxHt,
} from './remise-globale';

const SANS_REMISE: RemiseGlobale = { type: null, valeur: null };

describe('calculerMontantRemiseGlobale', () => {
  it('renvoie 0 sans remise', () => {
    expect(calculerMontantRemiseGlobale(1000, SANS_REMISE)).toBe(0);
  });

  it('pourcentage du total HT', () => {
    expect(calculerMontantRemiseGlobale(1000, { type: 'pourcent', valeur: '10' })).toBe(100);
  });

  it('borne le pourcentage à 100 %', () => {
    expect(calculerMontantRemiseGlobale(1000, { type: 'pourcent', valeur: '150' })).toBe(1000);
  });

  it('montant fixe', () => {
    expect(calculerMontantRemiseGlobale(1000, { type: 'montant', valeur: '250' })).toBe(250);
  });

  it('plafonne le montant fixe au total HT', () => {
    expect(calculerMontantRemiseGlobale(1000, { type: 'montant', valeur: '5000' })).toBe(1000);
  });

  it('renvoie 0 sur un total HT nul ou négatif', () => {
    expect(calculerMontantRemiseGlobale(0, { type: 'pourcent', valeur: '10' })).toBe(0);
    expect(calculerMontantRemiseGlobale(-50, { type: 'montant', valeur: '10' })).toBe(0);
  });

  it('ignore une valeur nulle ou négative', () => {
    expect(calculerMontantRemiseGlobale(1000, { type: 'pourcent', valeur: '0' })).toBe(0);
    expect(calculerMontantRemiseGlobale(1000, { type: 'montant', valeur: '-5' })).toBe(0);
  });
});

describe('appliquerRemiseGlobale', () => {
  const totauxMonoTaux: TotauxHt = {
    totalHt: '1000.00',
    totalTva: '200.00',
    totalTtc: '1200.00',
    detailsTva: { '20.00': { base: '1000.00', tva: '200.00' } },
  };

  it('sans remise : totaux inchangés, remise à 0', () => {
    const r = appliquerRemiseGlobale(totauxMonoTaux, SANS_REMISE);
    expect(r.totalHt).toBe('1000.00');
    expect(r.totalTva).toBe('200.00');
    expect(r.totalTtc).toBe('1200.00');
    expect(r.totalHtAvantRemise).toBe('1000.00');
    expect(r.remiseGlobaleMontant).toBe('0.00');
  });

  it('remise en pourcentage : HT, TVA et TTC réduits au prorata', () => {
    const r = appliquerRemiseGlobale(totauxMonoTaux, { type: 'pourcent', valeur: '10' });
    expect(r.totalHtAvantRemise).toBe('1000.00');
    expect(r.remiseGlobaleMontant).toBe('100.00');
    expect(r.totalHt).toBe('900.00');
    expect(r.totalTva).toBe('180.00');
    expect(r.totalTtc).toBe('1080.00');
    expect(r.detailsTva['20.00']).toEqual({ base: '900.00', tva: '180.00' });
  });

  it('remise en montant fixe', () => {
    const r = appliquerRemiseGlobale(totauxMonoTaux, { type: 'montant', valeur: '250' });
    expect(r.remiseGlobaleMontant).toBe('250.00');
    expect(r.totalHt).toBe('750.00');
    expect(r.totalTva).toBe('150.00');
    expect(r.totalTtc).toBe('900.00');
  });

  it('ventile la remise proportionnellement sur plusieurs taux de TVA', () => {
    const multi: TotauxHt = {
      totalHt: '1000.00',
      totalTva: '155.00',
      totalTtc: '1155.00',
      detailsTva: {
        '20.00': { base: '500.00', tva: '100.00' },
        '10.00': { base: '500.00', tva: '55.00' },
      },
    };
    const r = appliquerRemiseGlobale(multi, { type: 'pourcent', valeur: '10' });
    expect(r.detailsTva['20.00']).toEqual({ base: '450.00', tva: '90.00' });
    expect(r.detailsTva['10.00']).toEqual({ base: '450.00', tva: '49.50' });
    expect(r.totalHt).toBe('900.00');
    expect(r.totalTva).toBe('139.50');
    // Cohérence : brut − remise = net
    expect(
      (Number(r.totalHtAvantRemise) - Number(r.remiseGlobaleMontant)).toFixed(2),
    ).toBe(r.totalHt);
    // Cohérence : Σ bases = totalHt
    const sommeBases = Object.values(r.detailsTva).reduce(
      (acc, d) => acc + Number(d.base),
      0,
    );
    expect(sommeBases.toFixed(2)).toBe(r.totalHt);
  });

  it('préserve l’auto-liquidation (TVA reste à 0)', () => {
    const autoLiq: TotauxHt = {
      totalHt: '1000.00',
      totalTva: '0.00',
      totalTtc: '1000.00',
      detailsTva: { '20.00': { base: '1000.00', tva: '0.00' } },
    };
    const r = appliquerRemiseGlobale(autoLiq, { type: 'pourcent', valeur: '10' });
    expect(r.totalHt).toBe('900.00');
    expect(r.totalTva).toBe('0.00');
    expect(r.totalTtc).toBe('900.00');
    expect(r.detailsTva['20.00']).toEqual({ base: '900.00', tva: '0.00' });
  });
});

describe('libelleRemiseGlobale', () => {
  it('pourcentage formaté sans zéros superflus', () => {
    expect(libelleRemiseGlobale({ type: 'pourcent', valeur: '5.00' })).toBe('5 %');
    expect(libelleRemiseGlobale({ type: 'pourcent', valeur: '7.50' })).toBe('7.5 %');
  });

  it('montant fixe → « forfait »', () => {
    expect(libelleRemiseGlobale({ type: 'montant', valeur: '250.00' })).toBe('forfait');
  });
});
