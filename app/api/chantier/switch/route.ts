import { and, eq, isNull } from 'drizzle-orm';
import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';

import { chantiers } from '@/db/schema/chantiers';
import { ACTIVE_CHANTIER_COOKIE } from '@/lib/auth/chantier-context';
import { getTenantContext } from '@/lib/auth/tenant-guards';
import { withTenant } from '@/lib/db/with-tenant';

/** Format UUID — refuse une valeur malformée avant la requête `eq(uuid, …)`. */
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * POST /api/chantier/switch
 * Body : { chantierId: string | null }
 *
 * Définit (ou efface si `null`) le chantier « fil rouge » actif via un cookie
 * httpOnly. Vérifie que le chantier appartient à l'entreprise active courante
 * (RLS via `withTenant`). Le client rafraîchit ensuite la page (`router.refresh`).
 */
export async function POST(request: Request) {
  const ctx = await getTenantContext();
  if (!ctx) {
    return NextResponse.json({ error: 'Non authentifié' }, { status: 401 });
  }

  let body: { chantierId?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Body JSON invalide' }, { status: 400 });
  }

  const cookieStore = await cookies();

  // Effacement du contexte chantier.
  if (body.chantierId === null) {
    cookieStore.delete(ACTIVE_CHANTIER_COOKIE);
    return NextResponse.json({ ok: true, chantierId: null });
  }

  const chantierId = typeof body.chantierId === 'string' ? body.chantierId : null;
  if (!chantierId || !UUID_RE.test(chantierId)) {
    return NextResponse.json({ error: 'chantierId invalide' }, { status: 400 });
  }

  // Vérifie l'appartenance au tenant courant (RLS via withTenant).
  const [row] = await withTenant(ctx.entreprise.id, (tx) =>
    tx
      .select({ id: chantiers.id })
      .from(chantiers)
      .where(and(eq(chantiers.id, chantierId), isNull(chantiers.deletedAt)))
      .limit(1),
  );
  if (!row) {
    return NextResponse.json({ error: 'Chantier introuvable ou accès refusé' }, { status: 404 });
  }

  cookieStore.set(ACTIVE_CHANTIER_COOKIE, chantierId, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    // 30 jours
    maxAge: 60 * 60 * 24 * 30,
  });

  return NextResponse.json({ ok: true, chantierId });
}
