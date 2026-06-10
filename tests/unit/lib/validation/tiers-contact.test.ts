import { describe, expect, it } from 'vitest';

import { creerContactSchema } from '@/lib/validation/tiers';

const UUID = '11111111-1111-4111-8111-111111111111';

/** Saisie minimale valide pour la création d'un contact depuis l'annuaire. */
function baseValide() {
  return {
    source: 'fournisseur' as const,
    tiersId: UUID,
    nom: 'Durand',
  };
}

describe('creerContactSchema', () => {
  it('accepte une saisie minimale (source + tiersId + nom) avec les valeurs par défaut', () => {
    const res = creerContactSchema.safeParse(baseValide());
    expect(res.success).toBe(true);
    if (!res.success) return;
    expect(res.data.principal).toBe(false);
    expect(res.data.actif).toBe(true);
    // Champs optionnels absents → null après transform.
    expect(res.data.prenom).toBeNull();
    expect(res.data.email).toBeNull();
    expect(res.data.notes).toBeNull();
  });

  it('accepte les trois types de tiers (fournisseur, sous_traitant, client)', () => {
    for (const source of ['fournisseur', 'sous_traitant', 'client'] as const) {
      const res = creerContactSchema.safeParse({ ...baseValide(), source });
      expect(res.success).toBe(true);
    }
  });

  it('rejette une source inconnue', () => {
    const res = creerContactSchema.safeParse({ ...baseValide(), source: 'salarie' });
    expect(res.success).toBe(false);
  });

  it('exige un tiersId au format UUID', () => {
    const res = creerContactSchema.safeParse({ ...baseValide(), tiersId: '' });
    expect(res.success).toBe(false);
    if (res.success) return;
    expect(res.error.flatten().fieldErrors.tiersId?.[0]).toMatch(/tiers de rattachement/i);
  });

  it('exige un nom non vide', () => {
    const res = creerContactSchema.safeParse({ ...baseValide(), nom: '' });
    expect(res.success).toBe(false);
    if (res.success) return;
    expect(res.error.flatten().fieldErrors.nom).toBeTruthy();
  });

  it('rejette un email invalide', () => {
    const res = creerContactSchema.safeParse({ ...baseValide(), email: 'pas-un-email' });
    expect(res.success).toBe(false);
  });

  it('trim le nom et convertit les chaînes optionnelles vides en null', () => {
    const res = creerContactSchema.safeParse({
      ...baseValide(),
      nom: '  Durand  ',
      prenom: '   ',
      fonction: '',
      telephoneMobile: '',
    });
    expect(res.success).toBe(true);
    if (!res.success) return;
    expect(res.data.nom).toBe('Durand');
    expect(res.data.prenom).toBeNull();
    expect(res.data.fonction).toBeNull();
    expect(res.data.telephoneMobile).toBeNull();
  });

  it('conserve les coordonnées renseignées', () => {
    const res = creerContactSchema.safeParse({
      ...baseValide(),
      source: 'sous_traitant',
      prenom: 'Paul',
      email: 'paul@example.com',
      telephoneMobile: '0600000000',
      principal: true,
      actif: true,
    });
    expect(res.success).toBe(true);
    if (!res.success) return;
    expect(res.data.prenom).toBe('Paul');
    expect(res.data.email).toBe('paul@example.com');
    expect(res.data.telephoneMobile).toBe('0600000000');
    expect(res.data.principal).toBe(true);
  });
});
