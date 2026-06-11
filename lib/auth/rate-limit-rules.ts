/**
 * Règles de rate-limiting renforcées pour les endpoints d'authentification
 * sensibles (audit sécurité B2), en complément des règles par défaut de
 * better-auth.
 *
 * better-auth borne déjà nativement (window 10 s / max 3) les chemins de
 * brute-force « mot de passe » : `/sign-in*`, `/sign-up*`, `/change-password`,
 * `/change-email`, et (60 s / max 3) `/forget-password*`,
 * `/send-verification-email`, etc. Le chemin `/sign-in/magic-link` est donc
 * déjà couvert (préfixe `/sign-in`).
 *
 * MAIS les endpoints de vérification du **second facteur** ne sont PAS couverts
 * par les règles par défaut. Sans limite, un code TOTP (6 chiffres = 1e6
 * combinaisons) ou un code de secours seraient brute-forçables. On les borne
 * donc explicitement ici.
 *
 * Clés = chemin normalisé relatif à `/api/auth` (cf. better-auth rate-limiter).
 * Valeurs = { window: secondes, max: requêtes/IP/fenêtre }.
 */
export const AUTH_RATE_LIMIT_RULES: Record<string, { window: number; max: number }> = {
  // Second facteur : 5 essais / 5 min (TOTP tourne toutes les 30 s → fenêtre
  // d'attaque déjà étroite ; 5/5 min rend le brute-force inatteignable sans
  // pénaliser une faute de frappe occasionnelle).
  '/two-factor/verify-totp': { window: 300, max: 5 },
  '/two-factor/verify-backup-code': { window: 300, max: 5 },
  '/two-factor/verify-otp': { window: 300, max: 5 },
  '/two-factor/send-otp': { window: 300, max: 3 },
  // Vérification du lien magique : token à usage unique (consommé
  // atomiquement), mais on borne quand même la rejouabilité.
  '/magic-link/verify': { window: 300, max: 10 },
};
