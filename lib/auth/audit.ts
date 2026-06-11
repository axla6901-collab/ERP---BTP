import 'server-only';

import { authAuditLog } from '@/db/schema/audit';
import { getDbAdmin } from '@/lib/db/client';

import { mapAuthEventFromHttp, type AuthEventType } from './audit-events';

type LogAuthEventParams = {
  event: AuthEventType;
  success: boolean;
  email?: string | null;
  utilisateurId?: string | null;
  ipAddress?: string | null;
  userAgent?: string | null;
  metadata?: Record<string, unknown> | null;
};

/**
 * Insère une ligne dans le journal d'authentification (`auth_audit_log`).
 *
 * Passe par `getDbAdmin()` (app_admin / BYPASSRLS) car la table est verrouillée
 * en RLS (FORCE, aucune policy) — cf. migration 0069. La journalisation ne doit
 * JAMAIS faire échouer le flux d'auth : toute erreur est avalée (loggée).
 */
export async function logAuthEvent(params: LogAuthEventParams): Promise<void> {
  try {
    await getDbAdmin()
      .insert(authAuditLog)
      .values({
        event: params.event,
        success: params.success,
        email: params.email ?? null,
        utilisateurId: params.utilisateurId ?? null,
        ipAddress: params.ipAddress ?? null,
        userAgent: params.userAgent ?? null,
        metadata: params.metadata ?? null,
      });
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('[auth-audit] échec de journalisation', err);
  }
}

/** Extrait l'IP client des en-têtes proxy usuels. */
function ipDepuisHeaders(headers: Headers): string | null {
  const xff = headers.get('x-forwarded-for');
  if (xff) return xff.split(',')[0]?.trim() ?? null;
  return headers.get('x-real-ip');
}

/** Chemin better-auth relatif (sans le préfixe de montage `/api/auth`). */
function cheminBetterAuth(url: string): string {
  const { pathname } = new URL(url);
  return pathname.replace(/^\/api\/auth/, '');
}

/**
 * Journalise les échecs de login/MFA et la déconnexion à partir d'une requête
 * (clonée, pour pouvoir lire le corps sans consommer l'original) et de la
 * réponse de better-auth. Les succès de login sont captés ailleurs (création de
 * session) → ici on ne traite que ce que le statut HTTP rend fiable.
 *
 * Best-effort : toute erreur est avalée par `logAuthEvent`.
 */
export async function auditAuthHttp(clone: Request, response: Response): Promise<void> {
  const path = cheminBetterAuth(clone.url);
  const mapped = mapAuthEventFromHttp(path, response.status);
  if (!mapped) return;

  // Email tenté : utile surtout pour un login échoué (quel compte visé ?).
  let email: string | null = null;
  if (path === '/sign-in/email') {
    try {
      const body = (await clone.json()) as { email?: unknown };
      if (typeof body.email === 'string') email = body.email;
    } catch {
      // pas de corps JSON exploitable — on journalise sans email
    }
  }

  await logAuthEvent({
    event: mapped.event,
    success: mapped.success,
    email,
    ipAddress: ipDepuisHeaders(clone.headers),
    userAgent: clone.headers.get('user-agent'),
  });
}
