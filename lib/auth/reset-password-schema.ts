import { z } from 'zod';

/**
 * Schéma du formulaire « nouveau mot de passe » (réinitialisation B4).
 * `min(12)` aligné sur `emailAndPassword.minPasswordLength` (lib/auth/server.ts).
 * La confirmation doit correspondre (sinon erreur portée par le champ
 * `confirmation`).
 */
export const resetPasswordSchema = z
  .object({
    password: z.string().min(12, 'Le mot de passe doit faire au moins 12 caractères.'),
    confirmation: z.string(),
  })
  .refine((data) => data.password === data.confirmation, {
    message: 'Les deux mots de passe ne correspondent pas.',
    path: ['confirmation'],
  });

export type ResetPasswordInput = z.infer<typeof resetPasswordSchema>;
