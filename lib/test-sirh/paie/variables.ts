'use server';

import { and, eq, inArray, isNull } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';

import { auditLogIn } from '@/lib/audit/log';
import type { ActionResult } from '@/lib/common/action-result';
import { withTenant, type TenantTx } from '@/lib/db/with-tenant';
import { sirhNotesFrais, sirhPeriodesPaie, sirhVariablesPaie } from '@/db/schema/test-sirh';
import { variablePaieSchema, type VariablePaieInput } from '@/lib/validation/test-sirh/paie';

import { employeExiste } from '../acces';
import { baseSirh, exigerContexteSirhAction } from '../contexte';
import { messageErreurContrainte } from '../erreurs';
import { ROLES_SIRH_PAIE } from '../permissions';
import { estUuid } from '../temps/controles';

import { chargerElementsAImporter } from './elements-valides';
import { genererVariablesPaie, type SourceImport } from './generation';
import { periodeModifiable } from './periodes';

/**
 * Server actions — Test SIRH › Paie › Variables (Factorial payroll/Supplement).
 * Rôles PAIE ; une période clôturée est en lecture seule.
 */

const MESSAGE_CLOTUREE = 'Période clôturée : les variables sont en lecture seule.';

function revaliderPeriode(base: string, periodeId: string) {
  revalidatePath(`${base}/paie/${periodeId}`);
  revalidatePath(`${base}/paie`);
}

async function lirePeriode(tx: TenantTx, periodeId: string) {
  const [periode] = await tx
    .select()
    .from(sirhPeriodesPaie)
    .where(and(eq(sirhPeriodesPaie.id, periodeId), isNull(sirhPeriodesPaie.deletedAt)));
  return periode ?? null;
}

/**
 * Crée (sans `id`) une variable manuelle ou met à jour (avec `id`) une variable.
 * Pour une variable importée, collaborateur, type et origine restent figés.
 */
export async function enregistrerVariablePaie(
  input: VariablePaieInput,
): Promise<ActionResult<{ id: string }>> {
  const ctx = await exigerContexteSirhAction(ROLES_SIRH_PAIE);
  const parsed = variablePaieSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: 'Données invalides.',
      fieldErrors: parsed.error.flatten().fieldErrors as Record<string, string[]>,
    };
  }
  const data = parsed.data;

  try {
    const resultat = await withTenant(ctx.entreprise.id, async (tx) => {
      const periode = await lirePeriode(tx, data.periodeId);
      if (!periode) return { type: 'erreur' as const, message: 'Période introuvable.' };
      if (!periodeModifiable(periode.statut)) {
        return { type: 'erreur' as const, message: MESSAGE_CLOTUREE };
      }

      const valeurs = {
        libelle: data.libelle,
        codeRubrique: data.codeRubrique,
        quantite: data.quantite,
        montant: data.montant,
        commentaire: data.commentaire,
      };

      if (data.id) {
        const [before] = await tx
          .select()
          .from(sirhVariablesPaie)
          .where(
            and(
              eq(sirhVariablesPaie.id, data.id),
              eq(sirhVariablesPaie.periodeId, data.periodeId),
              isNull(sirhVariablesPaie.deletedAt),
            ),
          );
        if (!before) return { type: 'erreur' as const, message: 'Variable introuvable.' };
        const manuelle = before.source === 'manuelle';
        if (manuelle && !(await employeExiste(tx, data.employeId))) {
          return { type: 'erreur' as const, message: 'Employé introuvable.' };
        }
        const after = manuelle
          ? { ...valeurs, employeId: data.employeId, typeVariable: data.typeVariable }
          : valeurs;
        await tx
          .update(sirhVariablesPaie)
          .set({ ...after, updatedBy: ctx.utilisateur.id })
          .where(eq(sirhVariablesPaie.id, data.id));
        await auditLogIn(tx, {
          action: 'update',
          tableName: 'sirh_variables_paie',
          rowId: data.id,
          before,
          after,
        });
        return { type: 'ok' as const, id: data.id };
      }

      if (!(await employeExiste(tx, data.employeId))) {
        return { type: 'erreur' as const, message: 'Employé introuvable.' };
      }
      const [inserted] = await tx
        .insert(sirhVariablesPaie)
        .values({
          entrepriseId: ctx.entreprise.id,
          periodeId: data.periodeId,
          employeId: data.employeId,
          typeVariable: data.typeVariable,
          ...valeurs,
          source: 'manuelle',
          sourceId: null,
          createdBy: ctx.utilisateur.id,
          updatedBy: ctx.utilisateur.id,
        })
        .returning({ id: sirhVariablesPaie.id });
      if (!inserted) throw new Error('INSERT sirh_variables_paie échoué.');
      await auditLogIn(tx, {
        action: 'insert',
        tableName: 'sirh_variables_paie',
        rowId: inserted.id,
        after: data,
      });
      return { type: 'ok' as const, id: inserted.id };
    });

    if (resultat.type === 'erreur') return { ok: false, error: resultat.message };
    revaliderPeriode(baseSirh(ctx), data.periodeId);
    return { ok: true, data: { id: resultat.id } };
  } catch (err) {
    const message = messageErreurContrainte(err, {
      controle: 'Renseignez une quantité ou un montant.',
    });
    if (message) return { ok: false, error: message };
    throw err;
  }
}

/**
 * Supprime (soft-delete) une variable d'une période non clôturée. Une variable
 * issue d'une note de frais libère la note (`periode_paie_id` remis à NULL) :
 * un nouvel import la reprendra.
 */
export async function supprimerVariablePaie(id: string): Promise<ActionResult> {
  const ctx = await exigerContexteSirhAction(ROLES_SIRH_PAIE);
  if (!estUuid(id)) return { ok: false, error: 'Variable introuvable.' };

  const resultat = await withTenant(ctx.entreprise.id, async (tx) => {
    const [before] = await tx
      .select()
      .from(sirhVariablesPaie)
      .where(and(eq(sirhVariablesPaie.id, id), isNull(sirhVariablesPaie.deletedAt)));
    if (!before) return { type: 'erreur' as const, message: 'Variable introuvable.' };
    const periode = await lirePeriode(tx, before.periodeId);
    if (!periode) return { type: 'erreur' as const, message: 'Période introuvable.' };
    if (!periodeModifiable(periode.statut)) {
      return { type: 'erreur' as const, message: MESSAGE_CLOTUREE };
    }

    await tx
      .update(sirhVariablesPaie)
      .set({ deletedAt: new Date(), updatedBy: ctx.utilisateur.id })
      .where(eq(sirhVariablesPaie.id, id));
    await auditLogIn(tx, { action: 'delete', tableName: 'sirh_variables_paie', rowId: id, before });

    if (before.source === 'note_frais' && before.sourceId) {
      const liberees = await tx
        .update(sirhNotesFrais)
        .set({ periodePaieId: null, updatedBy: ctx.utilisateur.id })
        .where(
          and(
            eq(sirhNotesFrais.id, before.sourceId),
            eq(sirhNotesFrais.periodePaieId, before.periodeId),
          ),
        )
        .returning({ id: sirhNotesFrais.id });
      for (const n of liberees) {
        await auditLogIn(tx, {
          action: 'update',
          tableName: 'sirh_notes_frais',
          rowId: n.id,
          before: { periodePaieId: before.periodeId },
          after: { periodePaieId: null },
        });
      }
    }
    return { type: 'ok' as const, periodeId: before.periodeId };
  });

  if (resultat.type === 'erreur') return { ok: false, error: resultat.message };
  revaliderPeriode(baseSirh(ctx), resultat.periodeId);
  return { ok: true, data: undefined };
}

export type ResultatImportPaie = {
  importees: Record<SourceImport, number>;
  nbImportees: number;
  dejaImportees: number;
  ignorees: number;
};

/**
 * « Importer les éléments validés » — IDEMPOTENT : absences approuvées du mois,
 * heures sup. approuvées payées, notes de frais approuvées non remboursées. Un
 * élément déjà importé dans la période n'est jamais dupliqué (index unique
 * `periode_id, source, source_id` + `ON CONFLICT DO NOTHING`). Les notes de
 * frais importées sont rattachées à la période (`periode_paie_id`).
 */
export async function importerElementsValides(
  periodeId: string,
): Promise<ActionResult<ResultatImportPaie>> {
  const ctx = await exigerContexteSirhAction(ROLES_SIRH_PAIE);
  if (!estUuid(periodeId)) return { ok: false, error: 'Période introuvable.' };

  const resultat = await withTenant(ctx.entreprise.id, async (tx) => {
    const periode = await lirePeriode(tx, periodeId);
    if (!periode) return { type: 'erreur' as const, message: 'Période introuvable.' };
    if (!periodeModifiable(periode.statut)) {
      return { type: 'erreur' as const, message: MESSAGE_CLOTUREE };
    }

    const elements = await chargerElementsAImporter(tx, periode);
    const generation = genererVariablesPaie({ periode, ...elements });

    const importees: Record<SourceImport, number> = { absence: 0, heures_sup: 0, note_frais: 0 };
    const notesImportees: string[] = [];
    if (generation.variables.length > 0) {
      const inserees = await tx
        .insert(sirhVariablesPaie)
        .values(
          generation.variables.map((v) => ({
            entrepriseId: ctx.entreprise.id,
            periodeId,
            ...v,
            createdBy: ctx.utilisateur.id,
            updatedBy: ctx.utilisateur.id,
          })),
        )
        .onConflictDoNothing()
        .returning({
          id: sirhVariablesPaie.id,
          source: sirhVariablesPaie.source,
          sourceId: sirhVariablesPaie.sourceId,
        });
      for (const v of inserees) {
        if (v.source !== 'manuelle') importees[v.source] += 1;
        if (v.source === 'note_frais' && v.sourceId) notesImportees.push(v.sourceId);
        await auditLogIn(tx, {
          action: 'insert',
          tableName: 'sirh_variables_paie',
          rowId: v.id,
          after: generation.variables.find(
            (g) => g.source === v.source && g.sourceId === v.sourceId,
          ),
        });
      }
    }

    if (notesImportees.length > 0) {
      const rattachees = await tx
        .update(sirhNotesFrais)
        .set({ periodePaieId: periodeId, updatedBy: ctx.utilisateur.id })
        .where(
          and(inArray(sirhNotesFrais.id, notesImportees), isNull(sirhNotesFrais.periodePaieId)),
        )
        .returning({ id: sirhNotesFrais.id });
      for (const n of rattachees) {
        await auditLogIn(tx, {
          action: 'update',
          tableName: 'sirh_notes_frais',
          rowId: n.id,
          before: { periodePaieId: null },
          after: { periodePaieId: periodeId },
        });
      }
    }

    const nbImportees = importees.absence + importees.heures_sup + importees.note_frais;
    return {
      type: 'ok' as const,
      data: {
        importees,
        nbImportees,
        // Conflits concurrents (ON CONFLICT DO NOTHING) comptés comme déjà importés.
        dejaImportees:
          generation.ignorees.dejaImportees + (generation.variables.length - nbImportees),
        ignorees: generation.ignorees.valeurNulle,
      },
    };
  });

  if (resultat.type === 'erreur') return { ok: false, error: resultat.message };
  revaliderPeriode(baseSirh(ctx), periodeId);
  return { ok: true, data: resultat.data };
}
