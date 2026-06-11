/**
 * Événements du journal d'authentification (audit sécurité B5) et mapping
 * « endpoint better-auth → événement » pour les cas captés au niveau HTTP.
 *
 * Répartition des sources (une seule source fiable par événement, pas de
 * double comptage) :
 *  - `login_success`  → databaseHooks.session.create.after (toute création de
 *    session : mot de passe, lien magique, post-TOTP) — cf. lib/auth/server.ts
 *  - `password_reset` → emailAndPassword.onPasswordReset — cf. lib/auth/server.ts
 *  - `login_failure` / `mfa_failure` / `logout` → wrapper du route handler
 *    /api/auth/[...all] (statut HTTP fiable sur ces endpoints POST) — fonction
 *    {@link mapAuthEventFromHttp} ci-dessous.
 *
 * Le succès du lien magique est une redirection 302 (statut non discriminant),
 * il est donc capté par la création de session, jamais par le wrapper HTTP.
 */
export type AuthEventType =
  | 'login_success'
  | 'login_failure'
  | 'mfa_failure'
  | 'logout'
  | 'password_reset';

/** Chemins de vérification du second facteur (relatifs à /api/auth). */
const TWO_FACTOR_VERIFY_PATHS = new Set([
  '/two-factor/verify-totp',
  '/two-factor/verify-backup-code',
  '/two-factor/verify-otp',
]);

/**
 * À partir du chemin better-auth (relatif, ex. `/sign-in/email`) et du statut
 * HTTP de la réponse, retourne l'événement à journaliser, ou `null` si
 * l'endpoint n'est pas audité à ce niveau (les succès de login passent par la
 * création de session).
 */
export function mapAuthEventFromHttp(
  path: string,
  status: number,
): { event: AuthEventType; success: boolean } | null {
  const ok = status >= 200 && status < 300;

  if (path === '/sign-in/email') {
    return ok ? null : { event: 'login_failure', success: false };
  }
  if (TWO_FACTOR_VERIFY_PATHS.has(path)) {
    return ok ? null : { event: 'mfa_failure', success: false };
  }
  if (path === '/sign-out') {
    return ok ? { event: 'logout', success: true } : null;
  }
  return null;
}
