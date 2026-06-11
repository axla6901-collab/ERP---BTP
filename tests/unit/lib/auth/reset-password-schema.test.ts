import { describe, expect, it } from 'vitest';

import { resetPasswordSchema } from '@/lib/auth/reset-password-schema';

describe('resetPasswordSchema', () => {
  it('accepte un mot de passe ≥ 12 caractères avec confirmation identique', () => {
    const r = resetPasswordSchema.safeParse({
      password: 'MotDePasse12!',
      confirmation: 'MotDePasse12!',
    });
    expect(r.success).toBe(true);
  });

  it('refuse un mot de passe trop court (< 12)', () => {
    const r = resetPasswordSchema.safeParse({ password: 'court', confirmation: 'court' });
    expect(r.success).toBe(false);
  });

  it('refuse une confirmation qui ne correspond pas (erreur portée par `confirmation`)', () => {
    const r = resetPasswordSchema.safeParse({
      password: 'MotDePasse12!',
      confirmation: 'MotDePasse12?',
    });
    expect(r.success).toBe(false);
    if (!r.success) {
      expect(r.error.issues.some((i) => i.path.includes('confirmation'))).toBe(true);
    }
  });
});
