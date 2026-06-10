import { NextResponse } from 'next/server';

import { getTenantContext } from '@/lib/auth/tenant-guards';
import { chargerPointageRefs } from '@/lib/rh/pointage-refs';

export const dynamic = 'force-dynamic';

/**
 * GET /api/v1/pointage-refs
 *
 * Données de référence minimales nécessaires à la saisie terrain hors-ligne
 * (cf. ADR-004 §« Données en cache côté client ») : employés actifs, chantiers
 * EN COURS, et tâches de ces chantiers.
 *
 * Le service worker met cette réponse en cache (NetworkFirst) et le client la
 * recopie dans IndexedDB → la saisie reste possible sans réseau. Tenant-scopé
 * via RLS. Renvoie 401 si pas de session/entreprise active.
 */
export async function GET() {
  const ctx = await getTenantContext();
  if (!ctx) {
    return NextResponse.json({ error: 'Non authentifié' }, { status: 401 });
  }

  const refs = await chargerPointageRefs(ctx.entreprise.id);

  return NextResponse.json(
    { ...refs, generatedAt: new Date().toISOString() },
    {
      // Pas de cache HTTP partagé (données tenant) — le SW gère le cache local
      // volontaire dans CacheStorage, qui ignore ce header.
      headers: { 'Cache-Control': 'private, no-store' },
    },
  );
}
