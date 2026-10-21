import { describe, expect, it } from 'vitest';

import { contactSchema, fournisseurSchema, sousTraitantSchema } from '@/lib/validation/tiers';

const FOURNISSEUR = { code: 'frs01', nom: 'Fournisseur test' };
const SOUS_TRAITANT = { code: 'st01', nom: 'Sous-traitant test' };

/** Chemins des champs en erreur (premier niveau). */
function champsEnErreur(r: { success: boolean; error?: { issues: { path: PropertyKey[] }[] } }) {
  return r.success ? [] : (r.error?.issues ?? []).map((i) => String(i.path[0]));
}

describe('fournisseurSchema — champs facultatifs', () => {
  it('accepte SIRET, e-mail, téléphone et adresse laissés vides (chaîne vide → null)', () => {
    const r = fournisseurSchema.safeParse({
      ...FOURNISSEUR,
      siret: '',
      email: '',
      telephone: '',
      adresseLigne1: '',
      adresseLigne2: '',
      codePostal: '',
      ville: '',
      pays: 'France',
    });
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data).toMatchObject({
        code: 'FRS01',
        siret: null,
        email: null,
        telephone: null,
        adresseLigne1: null,
        codePostal: null,
        ville: null,
      });
    }
  });

  it('traite les espaces seuls et les clés absentes comme « non renseigné »', () => {
    const r = fournisseurSchema.safeParse({ ...FOURNISSEUR, siret: '   ', email: '  ' });
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.siret).toBeNull();
      expect(r.data.email).toBeNull();
      expect(r.data.codePostal).toBeNull();
    }
  });

  it('conserve les valeurs valides', () => {
    const r = fournisseurSchema.safeParse({
      ...FOURNISSEUR,
      siret: ' 56210539500012 ',
      email: 'achats@exemple.fr',
      codePostal: '69003',
    });
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.siret).toBe('56210539500012');
      expect(r.data.email).toBe('achats@exemple.fr');
      expect(r.data.codePostal).toBe('69003');
    }
  });

  it('rejette toujours un SIRET, un e-mail ou un code postal mal formés', () => {
    const r = fournisseurSchema.safeParse({
      ...FOURNISSEUR,
      siret: '123',
      email: 'pas-un-email',
      codePostal: '6900',
    });
    expect(r.success).toBe(false);
    expect(champsEnErreur(r)).toEqual(expect.arrayContaining(['siret', 'email', 'codePostal']));
  });
});

describe('fournisseurSchema — code postal selon le pays', () => {
  it('impose 5 chiffres pour une adresse en France (pays par défaut)', () => {
    expect(
      champsEnErreur(fournisseurSchema.safeParse({ ...FOURNISSEUR, codePostal: '1200' })),
    ).toContain('codePostal');
    expect(
      champsEnErreur(
        fournisseurSchema.safeParse({ ...FOURNISSEUR, pays: 'FR', codePostal: 'SW1A 1AA' }),
      ),
    ).toContain('codePostal');
  });

  it('accepte un code postal étranger quand le pays n’est pas la France', () => {
    const suisse = fournisseurSchema.safeParse({
      ...FOURNISSEUR,
      pays: 'Suisse',
      codePostal: '1200',
    });
    expect(suisse.success).toBe(true);
    if (suisse.success) expect(suisse.data.codePostal).toBe('1200');

    const uk = fournisseurSchema.safeParse({
      ...FOURNISSEUR,
      pays: 'Royaume-Uni',
      codePostal: 'sw1a 1aa',
    });
    expect(uk.success).toBe(true);
    if (uk.success) expect(uk.data.codePostal).toBe('SW1A 1AA');
  });

  it('rejette un code postal étranger aux caractères invalides', () => {
    expect(
      champsEnErreur(
        fournisseurSchema.safeParse({ ...FOURNISSEUR, pays: 'Belgique', codePostal: '10@0' }),
      ),
    ).toContain('codePostal');
  });
});

describe('sousTraitantSchema — champs facultatifs', () => {
  it('accepte SIRET, TVA intracom, e-mail, code postal et dates laissés vides', () => {
    const r = sousTraitantSchema.safeParse({
      ...SOUS_TRAITANT,
      siret: '',
      nTvaIntra: '',
      email: '',
      codePostal: '',
      assuranceDecennaleDateFin: '',
      dateAttestationUrssaf: '',
    });
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data).toMatchObject({
        siret: null,
        nTvaIntra: null,
        email: null,
        codePostal: null,
        assuranceDecennaleDateFin: null,
        dateAttestationUrssaf: null,
      });
    }
  });

  it('met le N° TVA intracom en majuscules et rejette un format invalide', () => {
    const ok = sousTraitantSchema.safeParse({ ...SOUS_TRAITANT, nTvaIntra: 'fr12345678901' });
    expect(ok.success).toBe(true);
    if (ok.success) expect(ok.data.nTvaIntra).toBe('FR12345678901');

    const ko = sousTraitantSchema.safeParse({ ...SOUS_TRAITANT, nTvaIntra: 'X' });
    expect(champsEnErreur(ko)).toContain('nTvaIntra');
  });

  it('rejette une date mal formée', () => {
    const r = sousTraitantSchema.safeParse({
      ...SOUS_TRAITANT,
      assuranceDecennaleDateFin: '31/12/2026',
    });
    expect(champsEnErreur(r)).toContain('assuranceDecennaleDateFin');
  });

  it('applique la même règle de code postal selon le pays', () => {
    expect(
      champsEnErreur(sousTraitantSchema.safeParse({ ...SOUS_TRAITANT, codePostal: '4000' })),
    ).toContain('codePostal');
    const belge = sousTraitantSchema.safeParse({
      ...SOUS_TRAITANT,
      pays: 'Belgique',
      codePostal: '4000',
    });
    expect(belge.success).toBe(true);
  });
});

describe('contactSchema — e-mail facultatif', () => {
  it('accepte un contact sans e-mail (chaîne vide → null)', () => {
    const r = contactSchema.safeParse({ nom: 'Dupont', email: '' });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.email).toBeNull();
  });

  it('rejette un e-mail invalide', () => {
    expect(champsEnErreur(contactSchema.safeParse({ nom: 'Dupont', email: 'dupont@' }))).toContain(
      'email',
    );
  });
});
