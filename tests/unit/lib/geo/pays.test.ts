import { describe, expect, it } from 'vitest';

import { estPaysFrance } from '@/lib/geo/pays';

describe('estPaysFrance', () => {
  it('reconnaît la France quelle que soit la casse ou les espaces', () => {
    for (const p of ['France', 'FRANCE', ' france ', 'FR', 'fr', 'FRA']) {
      expect(estPaysFrance(p)).toBe(true);
    }
  });

  it('considère un pays vide ou absent comme la France (défaut des adresses)', () => {
    expect(estPaysFrance('')).toBe(true);
    expect(estPaysFrance('   ')).toBe(true);
    expect(estPaysFrance(null)).toBe(true);
    expect(estPaysFrance(undefined)).toBe(true);
  });

  it('ne confond pas les autres pays avec la France', () => {
    for (const p of ['Suisse', 'Belgique', 'Royaume-Uni', 'Francfort', 'Frankreich']) {
      expect(estPaysFrance(p)).toBe(false);
    }
  });
});
