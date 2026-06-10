import { and, eq, isNull } from 'drizzle-orm';
import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';

import { db } from '@/lib/db/client';
import { entreprises, utilisateurEntreprises } from '@/db/schema/entreprises';
import { getCurrentUtilisateur } from '@/lib/auth/guards';
import { ACTIVE_ENTREPRISE_COOKIE } from '@/lib/auth/tenant-guards';

/**
 * POST /api/entreprise/switch
 * Body : { slug: string }
 *
 * Vérifie que l'utilisateur courant est membre de l'entreprise demandée,
 * puis set le cookie httpOnly `active_entreprise_slug`. Le client doit ensuite
 * naviguer vers la nouvelle URL préfixée par le slug.
 */
export async function POST(request: Request) {
  const utilisateur = await getCurrentUtilisateur();
  if (!utilisateur || !utilisateur.actif) {
    return NextResponse.json({ error: 'Non authentifié' }, { status: 401 });
  }

  let body: { slug?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Body JSON invalide' }, { status: 400 });
  }
  const slug = typeof body.slug === 'string' ? body.slug : null;
  if (!slug) {
    return NextResponse.json({ error: 'slug requis' }, { status: 400 });
  }

  const [row] = await db
    .select({ id: entreprises.id })
    .from(entreprises)
    .innerJoin(utilisateurEntreprises, eq(utilisateurEntreprises.entrepriseId, entreprises.id))
    .where(
      and(
        eq(entreprises.slug, slug),
        isNull(entreprises.deletedAt),
        eq(utilisateurEntreprises.utilisateurId, utilisateur.id),
        isNull(utilisateurEntreprises.deletedAt),
      ),
    )
    .limit(1);

  if (!row) {
    return NextResponse.json({ error: 'Entreprise introuvable ou accès refusé' }, { status: 404 });
  }

  const cookieStore = await cookies();
  cookieStore.set(ACTIVE_ENTREPRISE_COOKIE, slug, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    // 30 jours
    maxAge: 60 * 60 * 24 * 30,
  });

  return NextResponse.json({ ok: true, slug });
}
