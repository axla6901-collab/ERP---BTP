import 'server-only';

import { cache } from 'react';

import { and, eq, isNull } from 'drizzle-orm';
import { cookies } from 'next/headers';

import { chantiers } from '@/db/schema/chantiers';
import { withTenant } from '@/lib/db/with-tenant';

import { getTenantContext } from './tenant-guards';

/** Nom du cookie httpOnly qui mémorise le chantier « fil rouge » actif. */
export const ACTIVE_CHANTIER_COOKIE = 'active_chantier_id';

/** Format UUID v4 — garde-fou avant toute requête `eq(uuid, …)`. */
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type ChantierActif = { id: string; numero: string; libelle: string };

/**
 * Lit le cookie `active_chantier_id` et, s'il est présent et valide, vérifie que
 * le chantier appartient à l'entreprise active courante (RLS via `withTenant`)
 * avant de le retourner. Retourne `null` si : pas de tenant, cookie absent ou
 * malformé, chantier introuvable / hors tenant / supprimé.
 *
 * Mémoïsé par requête HTTP (`react.cache`) — appelable depuis layout + page +
 * composants serveur sans coût additionnel.
 */
export const getChantierActif = cache(async (): Promise<ChantierActif | null> => {
  const ctx = await getTenantContext();
  if (!ctx) return null;

  const cookieStore = await cookies();
  const id = cookieStore.get(ACTIVE_CHANTIER_COOKIE)?.value;
  if (!id || !UUID_RE.test(id)) return null;

  const [row] = await withTenant(ctx.entreprise.id, (tx) =>
    tx
      .select({ id: chantiers.id, numero: chantiers.numero, libelle: chantiers.libelle })
      .from(chantiers)
      .where(and(eq(chantiers.id, id), isNull(chantiers.deletedAt)))
      .limit(1),
  );
  return row ?? null;
});
