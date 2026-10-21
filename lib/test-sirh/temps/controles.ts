import 'server-only';

import { and, eq, isNull } from 'drizzle-orm';

import type { TenantTx } from '@/lib/db/with-tenant';
import { chantiers } from '@/db/schema/chantiers';
import { uuidRequis } from '@/lib/validation/test-sirh/commun';

/**
 * Contrôles partagés du domaine Temps de travail — à appeler DANS `withTenant`
 * (les FK ignorent la RLS : on vérifie explicitement que l'id référencé
 * appartient au tenant courant).
 */

/** Le chantier existe (non supprimé) dans le tenant courant. */
export async function chantierExiste(tx: TenantTx, chantierId: string): Promise<boolean> {
  const [row] = await tx
    .select({ id: chantiers.id })
    .from(chantiers)
    .where(and(eq(chantiers.id, chantierId), isNull(chantiers.deletedAt)))
    .limit(1);
  return Boolean(row);
}

/** `id` est un UUID valide (paramètre reçu hors schéma Zod). */
export function estUuid(id: string | null | undefined): id is string {
  return uuidRequis().safeParse(id).success;
}

/** Libellé de chantier « N° · Libellé » (null si pas de chantier). */
export function libelleChantier(
  numero: string | null | undefined,
  libelle: string | null | undefined,
): string | null {
  if (!numero && !libelle) return null;
  return [numero, libelle].filter(Boolean).join(' · ');
}
