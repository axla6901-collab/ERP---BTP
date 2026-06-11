import { and, eq, isNull } from 'drizzle-orm';
import { redirect } from 'next/navigation';
import { NextResponse } from 'next/server';

import { peutAdministrer } from '@/lib/admin/permissions';
import { getCurrentUtilisateur } from '@/lib/auth/guards';
import { getTenantContext } from '@/lib/auth/tenant-guards';
import { getDbAdmin } from '@/lib/db/client';
import { withTenant } from '@/lib/db/with-tenant';
import { entrepriseLogos } from '@/db/schema/entreprises';
import { getDownloadUrl } from '@/lib/storage/s3';

/**
 * GET /api/admin/entreprise/logos/[id]
 *
 * Deux chemins d'accès :
 *  1. Super-admin (`is_super_admin = true`) → lecture cross-tenant via `dbAdmin`
 *     (utilisé par la console `/admin/entreprises/[id]`).
 *  2. Admin du tenant actif → lecture restreinte au tenant courant via RLS.
 *
 * Redirige vers une URL S3 signée (TTL court — cf. lib/storage/s3.ts).
 */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const utilisateur = await getCurrentUtilisateur();
  if (!utilisateur) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  // Chemin super-admin : bypass RLS, lecture libre.
  if (utilisateur.isSuperAdmin) {
    const db = getDbAdmin();
    const [row] = await db
      .select({ storageKey: entrepriseLogos.storageKey })
      .from(entrepriseLogos)
      .where(and(eq(entrepriseLogos.id, id), isNull(entrepriseLogos.deletedAt)))
      .limit(1);
    if (!row) return NextResponse.json({ error: 'not-found' }, { status: 404 });
    const url = await getDownloadUrl(row.storageKey);
    redirect(url);
  }

  // Chemin tenant : admin du tenant actif uniquement.
  const ctx = await getTenantContext();
  if (!ctx) {
    return NextResponse.json({ error: 'no-tenant' }, { status: 401 });
  }
  if (!peutAdministrer(ctx.utilisateur.role)) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  }

  const rows = await withTenant(ctx.entreprise.id, (tx) =>
    tx
      .select({ storageKey: entrepriseLogos.storageKey })
      .from(entrepriseLogos)
      .where(and(eq(entrepriseLogos.id, id), isNull(entrepriseLogos.deletedAt)))
      .limit(1),
  );
  const row = rows[0];

  if (!row) {
    return NextResponse.json({ error: 'not-found' }, { status: 404 });
  }

  const url = await getDownloadUrl(row.storageKey);
  redirect(url);
}
