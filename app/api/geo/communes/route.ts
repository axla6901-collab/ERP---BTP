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
  const limitParam = Number(request.nextUrl.searchParams.get('limit'));
  const resultats = await rechercherCommunes(
    q,
    Number.isFinite(limitParam) ? limitParam : undefined,
  );

  return NextResponse.json(
    { resultats },
    {
      // Référentiel stable et non tenant : un cache privé court limite la charge
      // pendant la frappe sans risque de fuite inter-tenant.
      headers: { 'Cache-Control': 'private, max-age=3600' },
    },
  );
}
