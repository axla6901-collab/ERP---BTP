import { toNextJsHandler } from 'better-auth/next-js';

import { auth } from '@/lib/auth/server';
import { auditAuthHttp } from '@/lib/auth/audit';

const handlers = toNextJsHandler(auth);

/**
 * Enveloppe les handlers better-auth pour journaliser les échecs de login/MFA
 * et la déconnexion (audit sécurité B5). On clone la requête AVANT de la passer
 * à better-auth (qui consomme le corps), puis on audite à partir de la réponse.
 * La journalisation est best-effort et n'altère jamais la réponse renvoyée.
 */
function withAudit(
  handler: (request: Request) => Promise<Response>,
): (request: Request) => Promise<Response> {
  return async (request) => {
    const clone = request.clone();
    const response = await handler(request);
    await auditAuthHttp(clone, response);
    return response;
  };
}

export const GET = withAudit(handlers.GET);
export const POST = withAudit(handlers.POST);
