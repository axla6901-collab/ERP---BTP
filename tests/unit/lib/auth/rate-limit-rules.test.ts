import { describe, expect, it } from 'vitest';

import { AUTH_RATE_LIMIT_RULES } from '@/lib/auth/rate-limit-rules';

describe('AUTH_RATE_LIMIT_RULES', () => {
  it('borne les endpoints de vérification 2FA (non couverts par les défauts better-auth)', () => {
    // Ces chemins NE sont PAS dans les règles strictes par défaut de
    // better-auth → sans cette config, le TOTP serait brute-forçable.
    for (const path of ['/two-factor/verify-totp', '/two-factor/verify-backup-code']) {
      const rule = AUTH_RATE_LIMIT_RULES[path];
      expect(rule, `règle manquante pour ${path}`).toBeDefined();
      expect(rule!.max).toBeLessThanOrEqual(5);
      expect(rule!.window).toBeGreaterThanOrEqual(60);
    }
  });

  it('toutes les règles ont une fenêtre et un plafond positifs', () => {
    const entries = Object.entries(AUTH_RATE_LIMIT_RULES);
    expect(entries.length).toBeGreaterThan(0);
    for (const [path, rule] of entries) {
      expect(rule.window, `window pour ${path}`).toBeGreaterThan(0);
      expect(rule.max, `max pour ${path}`).toBeGreaterThan(0);
    }
  });
});
