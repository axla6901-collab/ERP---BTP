import 'server-only';

import { and, eq, isNull, ne, sql } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';

import type { TenantContext } from '@/lib/auth/tenant-guards';
import type { TenantTx } from '@/lib/db/with-tenant';
import {
  sirhCandidats,
  sirhCandidatures,
  sirhOffres,
  type SirhCandidature,
} from '@/db/schema/test-sirh';

import { baseSirh } from '../contexte';

/**
 * Helpers serveur partagés par les server actions du recrutement. Module
 * `server-only` (et non `'use server'`) : ces fonctions reçoivent une
 * transaction et ne doivent pas devenir des endpoints appelables du client.
 */

export const MESSAGE_EMAIL_CANDIDAT_DOUBLON =
  'Un candidat avec cet email existe déjà dans le vivier.';

export function estUuid(v: unknown): v is string {
  return z.string().uuid().safeParse(v).success;
}

/** Revalide les écrans du recrutement (toutes les sous-routes) et le tableau de bord. */
export function revaliderRecrutement(ctx: TenantContext): void {
  const base = baseSirh(ctx);
  revalidatePath(`${base}/recrutement`, 'layout');
  revalidatePath(base);
}

/** Un autre candidat non supprimé porte-t-il déjà cet email (casse ignorée, cf. index unique) ? */
export async function emailCandidatDejaUtilise(
  tx: TenantTx,
  email: string,
  saufId?: string,
): Promise<boolean> {
  const [row] = await tx
    .select({ id: sirhCandidats.id })
    .from(sirhCandidats)
    .where(
      and(
        sql`lower(${sirhCandidats.email}) = lower(${email})`,
        isNull(sirhCandidats.deletedAt),
        saufId ? ne(sirhCandidats.id, saufId) : undefined,
      ),
    )
    .limit(1);
  return Boolean(row);
}

/**
 * Candidature non supprimée dont le candidat et l'offre existent encore dans le
 * tenant (la RLS filtre les autres entreprises), ou `null`.
 */
export async function chargerCandidature(
  tx: TenantTx,
  id: string,
): Promise<SirhCandidature | null> {
  const [row] = await tx
    .select({ candidature: sirhCandidatures })
    .from(sirhCandidatures)
    .innerJoin(
      sirhCandidats,
      and(eq(sirhCandidats.id, sirhCandidatures.candidatId), isNull(sirhCandidats.deletedAt)),
    )
    .innerJoin(
      sirhOffres,
      and(eq(sirhOffres.id, sirhCandidatures.offreId), isNull(sirhOffres.deletedAt)),
    )
    .where(and(eq(sirhCandidatures.id, id), isNull(sirhCandidatures.deletedAt)))
    .limit(1);
  return row?.candidature ?? null;
}
