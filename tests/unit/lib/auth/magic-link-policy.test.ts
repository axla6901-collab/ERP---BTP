import { describe, expect, it } from 'vitest';

import { peutEnvoyerLienMagique } from '@/lib/auth/magic-link-policy';

describe('peutEnvoyerLienMagique', () => {
  it('autorise un compte existant sans MFA', () => {
    expect(peutEnvoyerLienMagique({ twoFactorEnabled: false })).toBe(true);
  });

  it('refuse un compte avec MFA active (sinon contournement du second facteur)', () => {
    expect(peutEnvoyerLienMagique({ twoFactorEnabled: true })).toBe(false);
  });

  it('refuse un compte inexistant (pas d’auto-inscription par lien magique)', () => {
    expect(peutEnvoyerLienMagique(null)).toBe(false);
    expect(peutEnvoyerLienMagique(undefined)).toBe(false);
  });
});
