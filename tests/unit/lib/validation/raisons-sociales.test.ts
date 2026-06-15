import { describe, expect, it } from 'vitest';

import { raisonSocialeSchema } from '@/lib/validation/raisons-sociales';

describe('raisonSocialeSchema', () => {
  it('accepte une raison sociale valide et trim les espaces', () => {
    const r = raisonSocialeSchema.safeParse({ raisonSociale: '  Entreprise SARL  ', actif: true });
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.raisonSociale).toBe('Entreprise SARL');
      expect(r.data.actif).toBe(true);
    }
  });

  it('applique actif=true par défaut', () => {
    const r = raisonSocialeSchema.safeParse({ raisonSociale: 'Acme' });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.actif).toBe(true);
  });

  it('refuse un nom trop court (< 2 caractères)', () => {
    const r = raisonSocialeSchema.safeParse({ raisonSociale: 'A' });
    expect(r.success).toBe(false);
  });

  it('refuse un nom trop long (> 200 caractères)', () => {
    const r = raisonSocialeSchema.safeParse({ raisonSociale: 'x'.repeat(201) });
    expect(r.success).toBe(false);
  });

  it('refuse une chaîne vide', () => {
    const r = raisonSocialeSchema.safeParse({ raisonSociale: '   ' });
    expect(r.success).toBe(false);
  });
});
