import 'server-only';

import { notFound } from 'next/navigation';

import type { Role } from '@/lib/auth/rbac';
import { requireTenantContextWithMfa, type TenantContext } from '@/lib/auth/tenant-guards';

/**
 * Gardes communes du module « Test SIRH ».
 *
 * - Page   : session + MFA + rôle (redirection `/` sinon, via `requireAuth`) +
 *            module actif pour l'entreprise (404 sinon — même comportement que
 *            les autres options : l'URL d'un module désactivé n'existe pas).
 * - Action : idem, mais lève une erreur explicite si le module est désactivé
 *            (cas limite : l'admin a coupé le module pendant la session).
 */

export const MESSAGE_MODULE_INACTIF = 'Le module Test SIRH est désactivé pour cette entreprise.';

export async function exigerContexteSirhPage(roles?: readonly Role[]): Promise<TenantContext> {
  const ctx = await requireTenantContextWithMfa(roles);
  if (!ctx.entreprise.testSirhActive) notFound();
  return ctx;
}

export async function exigerContexteSirhAction(roles?: readonly Role[]): Promise<TenantContext> {
  const ctx = await requireTenantContextWithMfa(roles);
  if (!ctx.entreprise.testSirhActive) throw new Error(MESSAGE_MODULE_INACTIF);
  return ctx;
}

/** Préfixe d'URL du module pour l'entreprise courante : `/<slug>/test-sirh`. */
export function baseSirh(ctx: TenantContext): string {
  return `/${ctx.entreprise.slug}/test-sirh`;
}
