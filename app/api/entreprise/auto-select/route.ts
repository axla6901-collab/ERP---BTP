import { and, eq, isNull } from 'drizzle-orm';
import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';

import { db } from '@/lib/db/client';
import { entreprises, utilisateurEntreprises } from '@/db/schema/entreprises';
import { getCurrentUtilisateur } from '@/lib/auth/guards';
import { ACTIVE_ENTREPRISE_COOKIE } from '@/lib/auth/tenant-guards';

/**
 * GET /api/entreprise/auto-select?slug=<slug>
 *
 * Pose le cookie httpOnly d'entreprise active puis redirige vers
 * `/{slug}/dashboard`. Utilisée par la page `/select-entreprise` quand
 * l'utilisateur n'appartient qu'à une seule entreprise (auto-sélection).
 *
 * Un Server Component ne peut pas écrire de cookies — on délègue à ce
 * route handler.
 */
export async function GET(request: Request) {
  const utilisateur = await getCurrentUtilisateur();
  if (!utilisateur || !utilisateur.actif) {
    return NextResponse.redirect(new URL('/login', request.url));
  }

  const url = new URL(request.url);
  const slug = url.searchParams.get('slug');
  if (!slug) {
    return NextResponse.redirect(new URL('/select-entreprise', request.url));
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
    return NextResponse.redirect(new URL('/select-entreprise', request.url));
  }

  const cookieStore = await cookies();
  cookieStore.set(ACTIVE_ENTREPRISE_COOKIE, slug, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: 60 * 60 * 24 * 30,
  });

  return NextResponse.redirect(new URL(`/${slug}/dashboard`, request.url));
}
