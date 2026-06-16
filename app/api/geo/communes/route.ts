import { NextResponse, type NextRequest } from 'next/server';

import { getCurrentUtilisateur } from '@/lib/auth/guards';
import { rechercherCommunes } from '@/lib/geo/codes-postaux';

export const dynamic = 'force-dynamic';

/**
 * GET /api/geo/communes?q=<terme>&limit=<n>
 *
 * Autocomplétion code postal ↔ ville pour les écrans d'adresse. Le terme est
 * interprété comme un code postal s'il est numérique, sinon comme un nom de
 * commune. Référentiel GLOBAL (non tenant) — on exige seulement une session
 * authentifiée. Renvoie 401 sinon, [] sous 2 caractères.
 */
export async function GET(request: NextRequest) {
  const utilisateur = await getCurrentUtilisateur();
  if (!utilisateur || !utilisateur.actif) {
    return NextResponse.json({ error: 'Non authentifié' }, { status: 401 });
  }

  const q = request.nextUrl.searchParams.get('q') ?? '';
  const limitRaw = request.nextUrl.searchParams.get('limit');
  const limitParam = limitRaw === null ? undefined : Number(limitRaw);
  const resultats = await rechercherCommunes(
    q,
    Number.isFinite(limitParam) && (limitParam as number) > 0 ? limitParam : undefined,
  );

  return NextResponse.json(
    { resultats },
    {
      // Référentiel non tenant : un cache privé COURT dédoublonne les frappes
      // répétées sans risque de fuite inter-tenant. Volontairement bref (60 s) :
      // un cache long laissait des résultats périmés après un re-seed.
      headers: { 'Cache-Control': 'private, max-age=60, must-revalidate' },
    },
  );
}
