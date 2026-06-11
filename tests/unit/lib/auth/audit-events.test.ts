import { describe, expect, it } from 'vitest';

import { mapAuthEventFromHttp } from '@/lib/auth/audit-events';

describe('mapAuthEventFromHttp', () => {
  it('journalise un échec de login (sign-in/email non-2xx)', () => {
    expect(mapAuthEventFromHttp('/sign-in/email', 401)).toEqual({
      event: 'login_failure',
      success: false,
    });
  });

  it('n’audite PAS le succès de login au niveau HTTP (capté par la session)', () => {
    expect(mapAuthEventFromHttp('/sign-in/email', 200)).toBeNull();
  });

  it('journalise un échec MFA (verify-totp / verify-backup-code non-2xx)', () => {
    expect(mapAuthEventFromHttp('/two-factor/verify-totp', 401)).toEqual({
      event: 'mfa_failure',
      success: false,
    });
    expect(mapAuthEventFromHttp('/two-factor/verify-backup-code', 401)).toEqual({
      event: 'mfa_failure',
      success: false,
    });
  });

  it('n’audite pas une vérif MFA réussie au niveau HTTP', () => {
    expect(mapAuthEventFromHttp('/two-factor/verify-totp', 200)).toBeNull();
  });

  it('journalise une déconnexion réussie (sign-out 2xx)', () => {
    expect(mapAuthEventFromHttp('/sign-out', 200)).toEqual({
      event: 'logout',
      success: true,
    });
  });

  it('ignore les endpoints non audités à ce niveau', () => {
    expect(mapAuthEventFromHttp('/magic-link/verify', 302)).toBeNull();
    expect(mapAuthEventFromHttp('/get-session', 200)).toBeNull();
  });
});
