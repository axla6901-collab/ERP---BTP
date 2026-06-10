import { NextResponse } from 'next/server';

import { getTenantContext } from '@/lib/auth/tenant-guards';
import { ROLES_POINTAGE_WRITE } from '@/lib/rh/permissions';
import { enregistrerPointageSync } from '@/lib/rh/pointages-sync';
import type { SyncItemResult } from '@/lib/pwa/types';

export const dynamic = 'force-dynamic';

/** Nombre max de pointages par requête de sync (garde-fou anti-abus). */
const MAX_BATCH = 200;

/**
 * POST /api/v1/pointages
 *
 * Endpoint de **synchronisation** de l'outbox terrain (M5.5, ADR-004).
 * Body : `{ pointages: PointageSyncPayload[] }` (lot, même pour 1 entrée).
 *
 * Chaque item est traité indépendamment et **idempotemment** via son
 * `client_uuid` (`ON CONFLICT DO NOTHING`). La réponse renvoie un résultat par
 * `client_uuid` (`synced` / `duplicate` / `rejected`). Un item qui échoue de
 * façon inattendue est **omis** de `results` → le client le garde `pending` et
 * réessaiera (l'idempotence rend le re-POST sûr).
 *
 * Accès : session + entreprise active + rôle dans ROLES_POINTAGE_WRITE.
 */
export async function POST(request: Request) {
  const ctx = await getTenantContext();
  if (!ctx) {
    return NextResponse.json({ error: 'Non authentifié' }, { status: 401 });
  }
  if (!ROLES_POINTAGE_WRITE.includes(ctx.utilisateur.role)) {
    return NextResponse.json({ error: 'Accès refusé' }, { status: 403 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Body JSON invalide' }, { status: 400 });
  }

  const items = extraireItems(body);
  if (items === null) {
    return NextResponse.json(
      { error: 'Format attendu : { pointages: [...] }' },
      { status: 400 },
    );
  }
  if (items.length > MAX_BATCH) {
    return NextResponse.json(
      { error: `Lot trop volumineux (max ${MAX_BATCH}).` },
      { status: 413 },
    );
  }

  const results: SyncItemResult[] = [];
  for (const input of items) {
    try {
      results.push(
        await enregistrerPointageSync({
          entrepriseId: ctx.entreprise.id,
          utilisateurId: ctx.utilisateur.id,
          input,
        }),
      );
    } catch (err) {
      // Erreur inattendue (infra/DB non classifiée) : on n'inclut pas l'item
      // dans `results` → le client le laisse `pending` et réessaiera.
      console.error('[POST /api/v1/pointages] erreur inattendue', err);
    }
  }

  return NextResponse.json({ results } satisfies { results: SyncItemResult[] });
}

/** Normalise le body en tableau d'items, ou `null` si format invalide. */
function extraireItems(body: unknown): unknown[] | null {
  if (Array.isArray(body)) return body;
  if (
    typeof body === 'object' &&
    body !== null &&
    'pointages' in body &&
    Array.isArray((body as { pointages: unknown }).pointages)
  ) {
    return (body as { pointages: unknown[] }).pointages;
  }
  return null;
}
