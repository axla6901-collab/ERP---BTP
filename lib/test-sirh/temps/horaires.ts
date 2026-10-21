'use server';

import { and, count, eq, isNull, ne } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';

import { auditLogIn } from '@/lib/audit/log';
import type { ActionResult } from '@/lib/common/action-result';
import { messageBlocageSuppression } from '@/lib/common/references-suppression';
import { withTenant } from '@/lib/db/with-tenant';
import { sirhCollaborateurs, sirhHoraires } from '@/db/schema/test-sirh';
import { horaireSchema, type HoraireInput } from '@/lib/validation/test-sirh/temps';

import { baseSirh, exigerContexteSirhAction } from '../contexte';
import { contrainteErreurPg, messageErreurContrainte } from '../erreurs';
import { ROLES_SIRH_GESTION } from '../permissions';

import { estUuid } from './controles';

/**
 * Server actions — Test SIRH › Temps de travail › Horaires
 * (Factorial work_schedule/Schedule). Écriture réservée aux gestionnaires RH.
 */

function colonnesHoraire(data: HoraireInput) {
  return {
    nom: data.nom,
    description: data.description,
    heuresLundi: data.heuresLundi,
    heuresMardi: data.heuresMardi,
    heuresMercredi: data.heuresMercredi,
    heuresJeudi: data.heuresJeudi,
    heuresVendredi: data.heuresVendredi,
    heuresSamedi: data.heuresSamedi,
    heuresDimanche: data.heuresDimanche,
    parDefaut: data.parDefaut,
    actif: data.actif,
  };
}

function revaliderHoraires(base: string) {
  revalidatePath(`${base}/temps/horaires`);
  revalidatePath(`${base}/temps`);
}

/**
 * Crée (sans `id`) ou met à jour (avec `id`) un horaire. Définir un horaire
 * « par défaut » retire le drapeau aux autres DANS la même transaction (index
 * unique partiel `uq_sirh_horaires_defaut`).
 */
export async function enregistrerHoraire(
  input: HoraireInput,
): Promise<ActionResult<{ id: string }>> {
  const ctx = await exigerContexteSirhAction(ROLES_SIRH_GESTION);
  const parsed = horaireSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: 'Données invalides.',
      fieldErrors: parsed.error.flatten().fieldErrors as Record<string, string[]>,
    };
  }
  const data = parsed.data;

  try {
    const id = await withTenant(ctx.entreprise.id, async (tx) => {
      let before: typeof sirhHoraires.$inferSelect | undefined;
      if (data.id) {
        [before] = await tx
          .select()
          .from(sirhHoraires)
          .where(and(eq(sirhHoraires.id, data.id), isNull(sirhHoraires.deletedAt)));
        if (!before) return null;
      }

      if (data.parDefaut) {
        const anciens = await tx
          .update(sirhHoraires)
          .set({ parDefaut: false, updatedBy: ctx.utilisateur.id })
          .where(
            and(
              eq(sirhHoraires.parDefaut, true),
              isNull(sirhHoraires.deletedAt),
              data.id ? ne(sirhHoraires.id, data.id) : undefined,
            ),
          )
          .returning({ id: sirhHoraires.id });
        for (const ancien of anciens) {
          await auditLogIn(tx, {
            action: 'update',
            tableName: 'sirh_horaires',
            rowId: ancien.id,
            before: { parDefaut: true },
            after: { parDefaut: false },
          });
        }
      }

      if (data.id && before) {
        await tx
          .update(sirhHoraires)
          .set({ ...colonnesHoraire(data), updatedBy: ctx.utilisateur.id })
          .where(eq(sirhHoraires.id, data.id));
        await auditLogIn(tx, {
          action: 'update',
          tableName: 'sirh_horaires',
          rowId: data.id,
          before,
          after: data,
        });
        return data.id;
      }

      const [inserted] = await tx
        .insert(sirhHoraires)
        .values({
          entrepriseId: ctx.entreprise.id,
          ...colonnesHoraire(data),
          createdBy: ctx.utilisateur.id,
          updatedBy: ctx.utilisateur.id,
        })
        .returning({ id: sirhHoraires.id });
      if (!inserted) throw new Error('INSERT sirh_horaires échoué.');
      await auditLogIn(tx, {
        action: 'insert',
        tableName: 'sirh_horaires',
        rowId: inserted.id,
        after: data,
      });
      return inserted.id;
    });
    if (!id) return { ok: false, error: 'Horaire introuvable.' };
    revaliderHoraires(baseSirh(ctx));
    return { ok: true, data: { id } };
  } catch (err) {
    const message = messageErreurContrainte(err, {
      unicite:
        contrainteErreurPg(err) === 'uq_sirh_horaires_defaut'
          ? 'Un autre horaire vient d’être défini par défaut : rechargez la page et réessayez.'
          : 'Un horaire porte déjà ce nom.',
      controle: 'Les heures journalières doivent être comprises entre 0 et 24.',
    });
    if (message) return { ok: false, error: message };
    throw err;
  }
}

/**
 * Suppression (soft-delete). Refusée si des collaborateurs utilisent encore
 * l'horaire (règle générale de suppression référentielle) — le désactiver sinon.
 */
export async function supprimerHoraire(id: string): Promise<ActionResult> {
  const ctx = await exigerContexteSirhAction(ROLES_SIRH_GESTION);
  if (!estUuid(id)) return { ok: false, error: 'Horaire introuvable.' };

  const resultat = await withTenant(ctx.entreprise.id, async (tx) => {
    const [before] = await tx
      .select()
      .from(sirhHoraires)
      .where(and(eq(sirhHoraires.id, id), isNull(sirhHoraires.deletedAt)));
    if (!before) return { type: 'introuvable' as const };

    const [ref] = await tx
      .select({ n: count() })
      .from(sirhCollaborateurs)
      .where(and(eq(sirhCollaborateurs.horaireId, id), isNull(sirhCollaborateurs.deletedAt)));
    const blocage = messageBlocageSuppression('cet horaire', [
      { nombre: ref?.n ?? 0, singulier: 'collaborateur', pluriel: 'collaborateurs' },
    ]);
    if (blocage) return { type: 'bloque' as const, message: blocage };

    await tx
      .update(sirhHoraires)
      .set({ deletedAt: new Date(), parDefaut: false, updatedBy: ctx.utilisateur.id })
      .where(eq(sirhHoraires.id, id));
    await auditLogIn(tx, { action: 'delete', tableName: 'sirh_horaires', rowId: id, before });
    return { type: 'ok' as const };
  });

  if (resultat.type === 'introuvable') return { ok: false, error: 'Horaire introuvable.' };
  if (resultat.type === 'bloque') return { ok: false, error: resultat.message };
  revaliderHoraires(baseSirh(ctx));
  return { ok: true, data: undefined };
}
