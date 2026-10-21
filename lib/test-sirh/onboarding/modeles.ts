'use server';

import { and, asc, count, eq, isNull, max } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';

import { auditLogIn } from '@/lib/audit/log';
import type { ActionResult } from '@/lib/common/action-result';
import { messageBlocageSuppression } from '@/lib/common/references-suppression';
import { withTenant } from '@/lib/db/with-tenant';
import { sirhModeleTaches, sirhModelesProcessus, sirhProcessus } from '@/db/schema/test-sirh';
import { uuidRequis } from '@/lib/validation/test-sirh/commun';
import {
  deplacerModeleTacheSchema,
  modeleProcessusSchema,
  modeleTacheSchema,
  type DeplacerModeleTacheInput,
  type ModeleProcessusInput,
  type ModeleTacheInput,
} from '@/lib/validation/test-sirh/onboarding';

import { baseSirh, exigerContexteSirhAction } from '../contexte';
import { messageErreurContrainte } from '../erreurs';
import { ROLES_SIRH_GESTION } from '../permissions';

import { deplacerDansListe, ordreSuivant, renumeroter } from './planification';

/**
 * Server actions — Test SIRH › Onboarding › Modèles de processus
 * (Factorial processes/Process) et leurs tâches ordonnées.
 */

function invalide(error: { flatten: () => { fieldErrors: unknown } }): ActionResult<never> {
  return {
    ok: false,
    error: 'Données invalides.',
    fieldErrors: error.flatten().fieldErrors as Record<string, string[]>,
  };
}

// ─────────────────────────────────────────────────────────────
// Modèles
// ─────────────────────────────────────────────────────────────

/** Crée (sans `id`) ou met à jour (avec `id`) un modèle de processus. */
export async function enregistrerModele(
  input: ModeleProcessusInput,
): Promise<ActionResult<{ id: string }>> {
  const ctx = await exigerContexteSirhAction(ROLES_SIRH_GESTION);
  const parsed = modeleProcessusSchema.safeParse(input);
  if (!parsed.success) return invalide(parsed.error);
  const data = parsed.data;
  const colonnes = {
    nom: data.nom,
    typeProcessus: data.typeProcessus,
    description: data.description,
    actif: data.actif,
  };

  try {
    const id = await withTenant(ctx.entreprise.id, async (tx) => {
      if (data.id) {
        const [before] = await tx
          .select()
          .from(sirhModelesProcessus)
          .where(and(eq(sirhModelesProcessus.id, data.id), isNull(sirhModelesProcessus.deletedAt)));
        if (!before) return null;
        await tx
          .update(sirhModelesProcessus)
          .set({ ...colonnes, updatedBy: ctx.utilisateur.id })
          .where(eq(sirhModelesProcessus.id, data.id));
        await auditLogIn(tx, {
          action: 'update',
          tableName: 'sirh_modeles_processus',
          rowId: data.id,
          before,
          after: colonnes,
        });
        return data.id;
      }
      const [insere] = await tx
        .insert(sirhModelesProcessus)
        .values({
          entrepriseId: ctx.entreprise.id,
          ...colonnes,
          createdBy: ctx.utilisateur.id,
          updatedBy: ctx.utilisateur.id,
        })
        .returning({ id: sirhModelesProcessus.id });
      if (!insere) throw new Error('INSERT sirh_modeles_processus échoué.');
      await auditLogIn(tx, {
        action: 'insert',
        tableName: 'sirh_modeles_processus',
        rowId: insere.id,
        after: colonnes,
      });
      return insere.id;
    });
    if (!id) return { ok: false, error: 'Modèle introuvable.' };
    revalidatePath(`${baseSirh(ctx)}/onboarding`, 'layout');
    return { ok: true, data: { id } };
  } catch (err) {
    const message = messageErreurContrainte(err, {
      unicite: 'Un modèle porte déjà ce nom.',
    });
    if (message) return { ok: false, error: message };
    throw err;
  }
}

/**
 * Suppression (soft-delete) d'un modèle et de ses tâches. Refusée si le
 * modèle a servi à lancer des processus (règle de suppression référentielle) —
 * le désactiver sinon.
 */
export async function supprimerModele(id: string): Promise<ActionResult> {
  const ctx = await exigerContexteSirhAction(ROLES_SIRH_GESTION);
  if (!uuidRequis().safeParse(id).success) return { ok: false, error: 'Modèle introuvable.' };

  const resultat = await withTenant(ctx.entreprise.id, async (tx) => {
    const [before] = await tx
      .select()
      .from(sirhModelesProcessus)
      .where(and(eq(sirhModelesProcessus.id, id), isNull(sirhModelesProcessus.deletedAt)));
    if (!before) return { type: 'introuvable' as const };

    const [usage] = await tx
      .select({ n: count() })
      .from(sirhProcessus)
      .where(and(eq(sirhProcessus.modeleId, id), isNull(sirhProcessus.deletedAt)));
    const blocage = messageBlocageSuppression('ce modèle', [
      { nombre: usage?.n ?? 0, singulier: 'processus', pluriel: 'processus' },
    ]);
    if (blocage) return { type: 'bloque' as const, message: blocage };

    const maintenant = new Date();
    const taches = await tx
      .update(sirhModeleTaches)
      .set({ deletedAt: maintenant, updatedBy: ctx.utilisateur.id })
      .where(and(eq(sirhModeleTaches.modeleId, id), isNull(sirhModeleTaches.deletedAt)))
      .returning({ id: sirhModeleTaches.id });
    for (const t of taches) {
      await auditLogIn(tx, { action: 'delete', tableName: 'sirh_modele_taches', rowId: t.id });
    }
    await tx
      .update(sirhModelesProcessus)
      .set({ deletedAt: maintenant, updatedBy: ctx.utilisateur.id })
      .where(eq(sirhModelesProcessus.id, id));
    await auditLogIn(tx, {
      action: 'delete',
      tableName: 'sirh_modeles_processus',
      rowId: id,
      before,
    });
    return { type: 'ok' as const };
  });

  if (resultat.type === 'introuvable') return { ok: false, error: 'Modèle introuvable.' };
  if (resultat.type === 'bloque') return { ok: false, error: resultat.message };
  revalidatePath(`${baseSirh(ctx)}/onboarding`, 'layout');
  return { ok: true, data: undefined };
}

// ─────────────────────────────────────────────────────────────
// Tâches d'un modèle
// ─────────────────────────────────────────────────────────────

/** Crée (en fin de liste) ou met à jour une tâche de modèle. */
export async function enregistrerModeleTache(
  input: ModeleTacheInput,
): Promise<ActionResult<{ id: string }>> {
  const ctx = await exigerContexteSirhAction(ROLES_SIRH_GESTION);
  const parsed = modeleTacheSchema.safeParse(input);
  if (!parsed.success) return invalide(parsed.error);
  const data = parsed.data;
  const colonnes = {
    libelle: data.libelle,
    description: data.description,
    responsable: data.responsable,
    delaiJours: data.delaiJours,
  };

  try {
    const resultat = await withTenant(ctx.entreprise.id, async (tx) => {
      const [modele] = await tx
        .select({ id: sirhModelesProcessus.id })
        .from(sirhModelesProcessus)
        .where(
          and(eq(sirhModelesProcessus.id, data.modeleId), isNull(sirhModelesProcessus.deletedAt)),
        );
      if (!modele) return { type: 'erreur' as const, message: 'Modèle introuvable.' };

      if (data.id) {
        const [before] = await tx
          .select()
          .from(sirhModeleTaches)
          .where(and(eq(sirhModeleTaches.id, data.id), isNull(sirhModeleTaches.deletedAt)));
        if (!before || before.modeleId !== modele.id) {
          return { type: 'erreur' as const, message: 'Tâche introuvable.' };
        }
        await tx
          .update(sirhModeleTaches)
          .set({ ...colonnes, updatedBy: ctx.utilisateur.id })
          .where(eq(sirhModeleTaches.id, before.id));
        await auditLogIn(tx, {
          action: 'update',
          tableName: 'sirh_modele_taches',
          rowId: before.id,
          before,
          after: colonnes,
        });
        return { type: 'ok' as const, id: before.id };
      }

      const [dernier] = await tx
        .select({ ordre: max(sirhModeleTaches.ordre) })
        .from(sirhModeleTaches)
        .where(and(eq(sirhModeleTaches.modeleId, modele.id), isNull(sirhModeleTaches.deletedAt)));
      const valeurs = {
        ...colonnes,
        modeleId: modele.id,
        ordre: ordreSuivant(dernier?.ordre != null ? [dernier.ordre] : []),
      };
      const [inseree] = await tx
        .insert(sirhModeleTaches)
        .values({
          entrepriseId: ctx.entreprise.id,
          ...valeurs,
          createdBy: ctx.utilisateur.id,
          updatedBy: ctx.utilisateur.id,
        })
        .returning({ id: sirhModeleTaches.id });
      if (!inseree) throw new Error('INSERT sirh_modele_taches échoué.');
      await auditLogIn(tx, {
        action: 'insert',
        tableName: 'sirh_modele_taches',
        rowId: inseree.id,
        after: valeurs,
      });
      return { type: 'ok' as const, id: inseree.id };
    });

    if (resultat.type === 'erreur') return { ok: false, error: resultat.message };
    revalidatePath(`${baseSirh(ctx)}/onboarding`, 'layout');
    return { ok: true, data: { id: resultat.id } };
  } catch (err) {
    const message = messageErreurContrainte(err, {
      controle: 'Délai invalide (entre −365 et +365 jours).',
    });
    if (message) return { ok: false, error: message };
    throw err;
  }
}

/** Supprime (soft-delete) une tâche de modèle (les processus déjà lancés ne changent pas). */
export async function supprimerModeleTache(id: string): Promise<ActionResult> {
  const ctx = await exigerContexteSirhAction(ROLES_SIRH_GESTION);
  if (!uuidRequis().safeParse(id).success) return { ok: false, error: 'Tâche introuvable.' };

  const supprimee = await withTenant(ctx.entreprise.id, async (tx) => {
    const [before] = await tx
      .select()
      .from(sirhModeleTaches)
      .where(and(eq(sirhModeleTaches.id, id), isNull(sirhModeleTaches.deletedAt)));
    if (!before) return false;
    await tx
      .update(sirhModeleTaches)
      .set({ deletedAt: new Date(), updatedBy: ctx.utilisateur.id })
      .where(eq(sirhModeleTaches.id, id));
    await auditLogIn(tx, { action: 'delete', tableName: 'sirh_modele_taches', rowId: id, before });
    return true;
  });

  if (!supprimee) return { ok: false, error: 'Tâche introuvable.' };
  revalidatePath(`${baseSirh(ctx)}/onboarding`, 'layout');
  return { ok: true, data: undefined };
}

/** Monte ou descend une tâche dans son modèle (ordres renumérotés 10, 20, 30…). */
export async function deplacerModeleTache(input: DeplacerModeleTacheInput): Promise<ActionResult> {
  const ctx = await exigerContexteSirhAction(ROLES_SIRH_GESTION);
  const parsed = deplacerModeleTacheSchema.safeParse(input);
  if (!parsed.success) return invalide(parsed.error);
  const { id, sens } = parsed.data;

  const resultat = await withTenant(ctx.entreprise.id, async (tx) => {
    const [tache] = await tx
      .select({ id: sirhModeleTaches.id, modeleId: sirhModeleTaches.modeleId })
      .from(sirhModeleTaches)
      .where(and(eq(sirhModeleTaches.id, id), isNull(sirhModeleTaches.deletedAt)));
    if (!tache) return { type: 'erreur' as const, message: 'Tâche introuvable.' };

    const soeurs = await tx
      .select({ id: sirhModeleTaches.id, ordre: sirhModeleTaches.ordre })
      .from(sirhModeleTaches)
      .where(and(eq(sirhModeleTaches.modeleId, tache.modeleId), isNull(sirhModeleTaches.deletedAt)))
      .orderBy(asc(sirhModeleTaches.ordre), asc(sirhModeleTaches.delaiJours));
    const nouvelleListe = deplacerDansListe(soeurs, id, sens);
    if (!nouvelleListe) {
      return {
        type: 'erreur' as const,
        message: sens === 'haut' ? 'Tâche déjà en tête de liste.' : 'Tâche déjà en fin de liste.',
      };
    }

    const ordreActuel = new Map(soeurs.map((s) => [s.id, s.ordre]));
    for (const { id: tacheId, ordre } of renumeroter(nouvelleListe)) {
      const avant = ordreActuel.get(tacheId);
      if (avant === ordre) continue;
      await tx
        .update(sirhModeleTaches)
        .set({ ordre, updatedBy: ctx.utilisateur.id })
        .where(eq(sirhModeleTaches.id, tacheId));
      await auditLogIn(tx, {
        action: 'update',
        tableName: 'sirh_modele_taches',
        rowId: tacheId,
        before: { ordre: avant },
        after: { ordre },
      });
    }
    return { type: 'ok' as const };
  });

  if (resultat.type === 'erreur') return { ok: false, error: resultat.message };
  revalidatePath(`${baseSirh(ctx)}/onboarding`, 'layout');
  return { ok: true, data: undefined };
}
