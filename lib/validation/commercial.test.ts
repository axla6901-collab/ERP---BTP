import { describe, expect, it } from 'vitest';

import { clientSchema, devisSchema } from './commercial';

/**
 * Tests reproduisant les valeurs ENVOYÉES PAR LE FORM côté UI :
 * - les champs non saisis arrivent en `''` (chaîne vide), pas `null`,
 *   parce que `react-hook-form` garde la valeur initiale du `<Input>`.
 *
 * On valide donc que le schéma tolère cet état.
 */

const adresseMinimum = {
  adresseLigne1: '12 rue de la République',
  adresseLigne2: '',
  codePostal: '75001',
  ville: 'Paris',
  pays: 'France',
  notes: '',
  actif: true,
};

describe('clientSchema — particulier', () => {
  it('accepte un particulier minimal avec champs pro vides ("")', () => {
    const input = {
      type: 'particulier' as const,
      code: 'CLI001',
      nom: 'Dupont',
      prenom: '',
      raisonSociale: '',
      siret: '',
      tvaIntra: '',
      email: '',
      telephone: '',
      ...adresseMinimum,
    };
    const r = clientSchema.safeParse(input);
    expect(r.success, JSON.stringify(r.success ? null : r.error.flatten())).toBe(true);
    if (r.success) {
      expect(r.data.type).toBe('particulier');
      expect(r.data.nom).toBe('Dupont');
      expect(r.data.raisonSociale).toBeNull();
      expect(r.data.siret).toBeNull();
      expect(r.data.tvaIntra).toBeNull();
      expect(r.data.prenom).toBeNull();
    }
  });

  it('rejette particulier sans nom', () => {
    const r = clientSchema.safeParse({
      type: 'particulier',
      code: 'CLI002',
      nom: '',
      ...adresseMinimum,
    });
    expect(r.success).toBe(false);
  });
});

describe('clientSchema — professionnel', () => {
  it('accepte un professionnel minimal avec SIRET/TVA vides ("")', () => {
    const input = {
      type: 'professionnel' as const,
      code: 'CLI100',
      raisonSociale: 'ACME SARL',
      nom: '',
      prenom: '',
      siret: '',
      tvaIntra: '',
      email: '',
      telephone: '',
      ...adresseMinimum,
    };
    const r = clientSchema.safeParse(input);
    expect(r.success, JSON.stringify(r.success ? null : r.error.flatten())).toBe(true);
    if (r.success) {
      expect(r.data.type).toBe('professionnel');
      expect(r.data.raisonSociale).toBe('ACME SARL');
      expect(r.data.siret).toBeNull();
      expect(r.data.tvaIntra).toBeNull();
    }
  });

  it('accepte un professionnel avec SIRET valide', () => {
    const r = clientSchema.safeParse({
      type: 'professionnel',
      code: 'CLI101',
      raisonSociale: 'BTP Bidule',
      nom: '',
      prenom: '',
      siret: '12345678901234',
      tvaIntra: 'FR12345678901',
      email: 'contact@bidule.fr',
      telephone: '',
      ...adresseMinimum,
    });
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.siret).toBe('12345678901234');
      expect(r.data.tvaIntra).toBe('FR12345678901');
    }
  });

  it('rejette un SIRET au format invalide', () => {
    const r = clientSchema.safeParse({
      type: 'professionnel',
      code: 'CLI102',
      raisonSociale: 'Test',
      siret: '12345', // trop court
      ...adresseMinimum,
    });
    expect(r.success).toBe(false);
  });

  it('rejette professionnel sans raison sociale', () => {
    const r = clientSchema.safeParse({
      type: 'professionnel',
      code: 'CLI103',
      raisonSociale: '',
      ...adresseMinimum,
    });
    expect(r.success).toBe(false);
  });
});

describe('clientSchema — code postal', () => {
  it('rejette un code postal invalide', () => {
    const r = clientSchema.safeParse({
      type: 'particulier',
      code: 'CLI200',
      nom: 'Test',
      ...adresseMinimum,
      codePostal: '1234', // 4 chiffres
    });
    expect(r.success).toBe(false);
  });
});

describe('devisSchema — remise globale', () => {
  const devisMinimal = {
    clientId: '00000000-0000-4000-8000-000000000001',
    dateDevis: '2026-01-01',
    dateValidite: '2026-02-01',
    lignes: [
      {
        type: 'libre' as const,
        designation: 'Forfait',
        quantite: '1',
        unite: 'u',
        prixUnitaireHt: '100',
        tauxTva: '20.00',
      },
    ],
  };

  it('accepte un devis sans remise globale (champs omis → null)', () => {
    const r = devisSchema.safeParse(devisMinimal);
    expect(r.success, JSON.stringify(r.success ? null : r.error.flatten())).toBe(true);
    if (r.success) {
      expect(r.data.remiseGlobaleType).toBeNull();
      expect(r.data.remiseGlobaleValeur).toBeNull();
    }
  });

  it('traite un type vide ("") comme absence de remise', () => {
    const r = devisSchema.safeParse({
      ...devisMinimal,
      remiseGlobaleType: '',
      remiseGlobaleValeur: '',
    });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.remiseGlobaleType).toBeNull();
  });

  it('accepte une remise en pourcentage valide', () => {
    const r = devisSchema.safeParse({
      ...devisMinimal,
      remiseGlobaleType: 'pourcent',
      remiseGlobaleValeur: '10',
    });
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.remiseGlobaleType).toBe('pourcent');
      expect(r.data.remiseGlobaleValeur).toBe('10.00');
    }
  });

  it('accepte une remise en montant', () => {
    const r = devisSchema.safeParse({
      ...devisMinimal,
      remiseGlobaleType: 'montant',
      remiseGlobaleValeur: '250',
    });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.remiseGlobaleValeur).toBe('250.00');
  });

  it('rejette un pourcentage supérieur à 100', () => {
    const r = devisSchema.safeParse({
      ...devisMinimal,
      remiseGlobaleType: 'pourcent',
      remiseGlobaleValeur: '150',
    });
    expect(r.success).toBe(false);
  });

  it('rejette un type renseigné sans valeur', () => {
    const r = devisSchema.safeParse({
      ...devisMinimal,
      remiseGlobaleType: 'montant',
      remiseGlobaleValeur: null,
    });
    expect(r.success).toBe(false);
  });
});
