import 'server-only';

import { auditLogIn } from '@/lib/audit/log';
import { withTenant } from '@/lib/db/with-tenant';
import { pointages } from '@/db/schema/pointages';
import { pointageSyncSchema } from '@/lib/validation/rh';
import type { SyncItemResult } from '@/lib/pwa/types';

import { classifyPointageSyncError, messagePourRejet } from './pointages-sync-errors';

/**
 * Insère un pointage synchronisé depuis le terrain, de façon **idempotente**.
 *
 * - Validation Zod (`pointageSyncSchema`) → rejet `donnees_invalides` si KO.
 * - `INSERT ... ON CONFLICT (client_uuid) DO NOTHING` :
 *   - ligne insérée → `synced` (+ audit + `server_received_at`).
 *   - 0 ligne (client_uuid déjà reçu) → `duplicate` (succès idempotent).
 * - Violation de contrainte connue (unicité métier / FK / CHECK) → `rejected`
 *   avec la raison, pour que l'outbox abandonne sans boucler.
 * - Toute autre erreur est relancée (→ 500, l'outbox réessaiera plus tard).
 *
 * @returns le résultat par item, jamais d'exception pour un rejet « métier ».
 */
export async function enregistrerPointageSync(opts: {
  entrepriseId: string;
  utilisateurId: string;
  input: unknown;
  /** clientUuid de secours pour le résultat si la validation échoue. */
  fallbackClientUuid?: string;
}): Promise<SyncItemResult> {
  const { entrepriseId, utilisateurId, input, fallbackClientUuid } = opts;

  const parsed = pointageSyncSchema.safeParse(input);
  if (!parsed.success) {
    const clientUuid =
      (typeof input === 'object' &&
      input !== null &&
      'clientUuid' in input &&
      typeof (input as { clientUuid?: unknown }).clientUuid === 'string'
        ? (input as { clientUuid: string }).clientUuid
        : fallbackClientUuid) ?? '';
    return {
      clientUuid,
      status: 'rejected',
      reason: 'donnees_invalides',
      message: messagePourRejet('donnees_invalides'),
    };
  }

  const data = parsed.data;

  try {
    const inserted = await withTenant(entrepriseId, async (tx) => {
      const rows = await tx
        .insert(pointages)
        .values({
          entrepriseId,
          employeId: data.employeId,
          chantierId: data.chantierId,
          chantierTacheId: data.chantierTacheId,
          datePointage: data.datePointage,
          type: data.type,
          quantite: data.quantite,
          motifAbsence: data.motifAbsence,
          zoneDeplacement: data.zoneDeplacement,
          panier: data.panier,
          grandPanier: data.grandPanier,
          nuitPanierSoir: data.nuitPanierSoir,
          notes: data.notes,
          clientUuid: data.clientUuid,
          serverReceivedAt: new Date(),
          createdBy: utilisateurId,
          updatedBy: utilisateurId,
        })
        .onConflictDoNothing({ target: pointages.clientUuid })
        .returning({ id: pointages.id });

      const row = rows[0] ?? null;
      if (row) {
        await auditLogIn(tx, {
          action: 'insert',
          tableName: 'pointages',
          rowId: row.id,
          after: { ...data, source: 'pwa_terrain' },
          utilisateurId,
        });
      }
      return row;
    });

    if (inserted) {
      return { clientUuid: data.clientUuid, status: 'synced', id: inserted.id };
    }
    // 0 ligne → le client_uuid existait déjà : succès idempotent.
    return { clientUuid: data.clientUuid, status: 'duplicate' };
  } catch (err) {
    const reason = classifyPointageSyncError(err);
    if (reason) {
      return {
        clientUuid: data.clientUuid,
        status: 'rejected',
        reason,
        message: messagePourRejet(reason),
      };
    }
    throw err;
  }
}
