'use server';

import { and, count, eq, isNull } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';

import { auditLogIn } from '@/lib/audit/log';
import type { ActionResult } from '@/lib/common/action-result';
import { withTenant } from '@/lib/db/with-tenant';
import { employes } from '@/db/schema/employes';
import { sirhAttributionsMateriel, sirhMateriels } from '@/db/schema/test-sirh';
import {
  attributionMaterielSchema,
  materielSchema,
  restitutionMaterielSchema,
  type AttributionMaterielInput,
  type MaterielInput,
  type RestitutionMaterielInput,
} from '@/lib/validation/test-sirh/materiel';

import { aujourdhuiIso } from '../calendrier';
import { baseSirh, exigerContexteSirhAction } from '../contexte';
import { messageErreurContrainte } from '../erreurs';
import { formatDateFr } from '../format';
import { ROLES_SIRH_GESTION } from '../permissions';
import {
  changementStatutAutorise,
  controleRestitution,
  messageBlocageSuppressionMateriel,
  peutAttribuer,
  statutApresAttribution,
  statutApresRestitution,
} from './regles';

/**
 * Server actions — Test SIRH › Matériel & EPI (Factorial it_management, étendu
 * EPI / outillage). Écriture réservée à la gestion RH (admin, RH).
 *
 * Cycle de vie : en stock → (attribuer) attribué → (restituer) en stock ou en
 * réparation ; perdu / réformé saisis dans la fiche. Une seule attribution en
 * cours par matériel (index `uq_sirh_attributions_en_cours`).
 */

function invalide(error: z.ZodError): {
  ok: false;
  error: string;
  fieldErrors: Record<string, string[]>;
} {
  return {
    ok: false,
    error: 'Données invalides.',
    fieldErrors: error.flatten().fieldErrors as Record<string, string[]>,
  };
}

/** Crée (sans `id`) ou met à jour (avec `id`) un matériel de l'inventaire. */
export async function enregistrerMateriel(
  input: MaterielInput,
): Promise<ActionResult<{ id: string }>> {
  const ctx = await exigerContexteSirhAction(ROLES_SIRH_GESTION);
  const parsed = materielSchema.safeParse(input);
  if (!parsed.success) return invalide(parsed.error);
  const data = parsed.data;
  const colonnes = {
    categorie: data.categorie,
    libelle: data.libelle,
    marque: data.marque,
    modele: data.modele,
    numeroSerie: data.numeroSerie,
    taille: data.taille,
    dateAchat: data.dateAchat,
    valeurAchat: data.valeurAchat,
    dateFinGarantie: data.dateFinGarantie,
    dateControle: data.dateControle,
    statut: data.statut,
    notes: data.notes,
  };
  const erreurStatut = {
    ok: false as const,
    error:
      'Statut non modifiable ici : utilisez « Attribuer » / « Restituer » (un matériel attribué doit être restitué avant tout changement de statut).',
    fieldErrors: { statut: ['Statut non autorisé.'] },
  };

  try {
    const resultat = await withTenant(ctx.entreprise.id, async (tx) => {
      if (data.id) {
        const [before] = await tx
          .select()
          .from(sirhMateriels)
          .where(and(eq(sirhMateriels.id, data.id), isNull(sirhMateriels.deletedAt)));
        if (!before) return { type: 'introuvable' as const };
        if (!changementStatutAutorise(before.statut, data.statut)) {
          return { type: 'statut' as const };
        }
        await tx
          .update(sirhMateriels)
          .set({ ...colonnes, updatedBy: ctx.utilisateur.id })
          .where(eq(sirhMateriels.id, data.id));
        await auditLogIn(tx, {
          action: 'update',
          tableName: 'sirh_materiels',
          rowId: data.id,
          before,
          after: colonnes,
        });
        return { type: 'ok' as const, id: data.id };
      }
      if (!changementStatutAutorise(null, data.statut)) return { type: 'statut' as const };
      const [inserted] = await tx
        .insert(sirhMateriels)
        .values({
          entrepriseId: ctx.entreprise.id,
          ...colonnes,
          createdBy: ctx.utilisateur.id,
          updatedBy: ctx.utilisateur.id,
        })
        .returning({ id: sirhMateriels.id });
      if (!inserted) throw new Error('INSERT sirh_materiels échoué.');
      await auditLogIn(tx, {
        action: 'insert',
        tableName: 'sirh_materiels',
        rowId: inserted.id,
        after: colonnes,
      });
      return { type: 'ok' as const, id: inserted.id };
    });

    if (resultat.type === 'introuvable') return { ok: false, error: 'Matériel introuvable.' };
    if (resultat.type === 'statut') return erreurStatut;
    revalidatePath(baseSirh(ctx), 'layout');
    return { ok: true, data: { id: resultat.id } };
  } catch (err) {
    const message = messageErreurContrainte(err, {
      unicite: 'Un matériel porte déjà ce numéro de série.',
      controle: 'Valeur d’achat invalide.',
    });
    if (message) {
      return {
        ok: false,
        error: message,
        ...(message.includes('numéro de série') ? { fieldErrors: { numeroSerie: [message] } } : {}),
      };
    }
    throw err;
  }
}

/**
 * Suppression (soft-delete) d'un matériel — refusée s'il a un historique
 * d'attribution (traçabilité des remises d'EPI) : le réformer plutôt.
 */
export async function supprimerMateriel(id: string): Promise<ActionResult> {
  const ctx = await exigerContexteSirhAction(ROLES_SIRH_GESTION);
  if (!z.string().uuid().safeParse(id).success) return { ok: false, error: 'Matériel invalide.' };

  const resultat = await withTenant(ctx.entreprise.id, async (tx) => {
    const [before] = await tx
      .select()
      .from(sirhMateriels)
      .where(and(eq(sirhMateriels.id, id), isNull(sirhMateriels.deletedAt)));
    if (!before) return { type: 'introuvable' as const };

    const [ref] = await tx
      .select({ n: count() })
      .from(sirhAttributionsMateriel)
      .where(
        and(
          eq(sirhAttributionsMateriel.materielId, id),
          isNull(sirhAttributionsMateriel.deletedAt),
        ),
      );
    const blocage = messageBlocageSuppressionMateriel(ref?.n ?? 0);
    if (blocage) return { type: 'bloque' as const, message: blocage };

    await tx
      .update(sirhMateriels)
      .set({ deletedAt: new Date(), updatedBy: ctx.utilisateur.id })
      .where(eq(sirhMateriels.id, id));
    await auditLogIn(tx, { action: 'delete', tableName: 'sirh_materiels', rowId: id, before });
    return { type: 'ok' as const };
  });

  if (resultat.type === 'introuvable') return { ok: false, error: 'Matériel introuvable.' };
  if (resultat.type === 'bloque') return { ok: false, error: resultat.message };
  revalidatePath(baseSirh(ctx), 'layout');
  return { ok: true, data: undefined };
}

/** Remet un matériel EN STOCK à un collaborateur actif (statut → attribué). */
export async function attribuerMateriel(
  input: AttributionMaterielInput,
): Promise<ActionResult<{ id: string }>> {
  const ctx = await exigerContexteSirhAction(ROLES_SIRH_GESTION);
  const parsed = attributionMaterielSchema.safeParse(input);
  if (!parsed.success) return invalide(parsed.error);
  const data = parsed.data;
  if (data.dateRemise > aujourdhuiIso()) {
    return {
      ok: false,
      error: 'La date de remise ne peut pas être dans le futur.',
      fieldErrors: { dateRemise: ['Date dans le futur.'] },
    };
  }

  try {
    const resultat = await withTenant(ctx.entreprise.id, async (tx) => {
      const [materiel] = await tx
        .select()
        .from(sirhMateriels)
        .where(and(eq(sirhMateriels.id, data.materielId), isNull(sirhMateriels.deletedAt)));
      if (!materiel) return { type: 'materiel' as const };
      if (!peutAttribuer(materiel.statut)) return { type: 'indisponible' as const };

      const [employe] = await tx
        .select({ id: employes.id, actif: employes.actif })
        .from(employes)
        .where(and(eq(employes.id, data.employeId), isNull(employes.deletedAt)));
      if (!employe) return { type: 'employe' as const };
      if (!employe.actif) return { type: 'inactif' as const };

      const [enCours] = await tx
        .select({ id: sirhAttributionsMateriel.id })
        .from(sirhAttributionsMateriel)
        .where(
          and(
            eq(sirhAttributionsMateriel.materielId, data.materielId),
            isNull(sirhAttributionsMateriel.dateRetour),
            isNull(sirhAttributionsMateriel.deletedAt),
          ),
        );
      if (enCours) return { type: 'indisponible' as const };

      const valeurs = {
        materielId: data.materielId,
        employeId: data.employeId,
        dateRemise: data.dateRemise,
        etatRemise: data.etatRemise,
        dechargeSignee: data.dechargeSignee,
        commentaire: data.commentaire,
      };
      const [inserted] = await tx
        .insert(sirhAttributionsMateriel)
        .values({
          entrepriseId: ctx.entreprise.id,
          ...valeurs,
          createdBy: ctx.utilisateur.id,
          updatedBy: ctx.utilisateur.id,
        })
        .returning({ id: sirhAttributionsMateriel.id });
      if (!inserted) throw new Error('INSERT sirh_attributions_materiel échoué.');
      await auditLogIn(tx, {
        action: 'insert',
        tableName: 'sirh_attributions_materiel',
        rowId: inserted.id,
        after: valeurs,
      });

      const statut = statutApresAttribution();
      await tx
        .update(sirhMateriels)
        .set({ statut, updatedBy: ctx.utilisateur.id })
        .where(eq(sirhMateriels.id, data.materielId));
      await auditLogIn(tx, {
        action: 'update',
        tableName: 'sirh_materiels',
        rowId: data.materielId,
        before: materiel,
        after: { statut },
      });
      return { type: 'ok' as const, id: inserted.id };
    });

    switch (resultat.type) {
      case 'materiel':
        return { ok: false, error: 'Matériel introuvable.' };
      case 'indisponible':
        return {
          ok: false,
          error:
            'Ce matériel n’est pas disponible (déjà attribué, en réparation, perdu ou réformé).',
        };
      case 'employe':
        return {
          ok: false,
          error: 'Collaborateur introuvable.',
          fieldErrors: { employeId: ['Collaborateur introuvable.'] },
        };
      case 'inactif':
        return {
          ok: false,
          error: 'Ce collaborateur n’est plus actif.',
          fieldErrors: { employeId: ['Collaborateur inactif.'] },
        };
      case 'ok':
        revalidatePath(baseSirh(ctx), 'layout');
        return { ok: true, data: { id: resultat.id } };
    }
  } catch (err) {
    const message = messageErreurContrainte(err, {
      unicite: 'Ce matériel a déjà une attribution en cours.',
    });
    if (message) return { ok: false, error: message };
    throw err;
  }
}

/**
 * Restitution : clôt l'attribution en cours (date de retour ≥ date de remise,
 * état au retour) ; le matériel repasse en stock, ou en réparation si un
 * défaut est signalé.
 */
export async function restituerMateriel(input: RestitutionMaterielInput): Promise<ActionResult> {
  const ctx = await exigerContexteSirhAction(ROLES_SIRH_GESTION);
  const parsed = restitutionMaterielSchema.safeParse(input);
  if (!parsed.success) return invalide(parsed.error);
  const data = parsed.data;
  if (data.dateRetour > aujourdhuiIso()) {
    return {
      ok: false,
      error: 'La date de retour ne peut pas être dans le futur.',
      fieldErrors: { dateRetour: ['Date dans le futur.'] },
    };
  }

  try {
    const resultat = await withTenant(ctx.entreprise.id, async (tx) => {
      const [materiel] = await tx
        .select()
        .from(sirhMateriels)
        .where(and(eq(sirhMateriels.id, data.materielId), isNull(sirhMateriels.deletedAt)));
      if (!materiel) return { type: 'materiel' as const };

      const [attribution] = await tx
        .select()
        .from(sirhAttributionsMateriel)
        .where(
          and(
            eq(sirhAttributionsMateriel.materielId, data.materielId),
            isNull(sirhAttributionsMateriel.dateRetour),
            isNull(sirhAttributionsMateriel.deletedAt),
          ),
        );
      if (!attribution) return { type: 'aucune' as const };
      const erreurDates = controleRestitution(attribution.dateRemise, data.dateRetour);
      if (erreurDates) return { type: 'dates' as const, dateRemise: attribution.dateRemise };

      const cloture = {
        dateRetour: data.dateRetour,
        etatRetour: data.etatRetour,
        // Le commentaire de retour complète celui de la remise.
        commentaire: data.commentaire
          ? [attribution.commentaire, `Retour : ${data.commentaire}`].filter(Boolean).join('\n')
          : attribution.commentaire,
      };
      await tx
        .update(sirhAttributionsMateriel)
        .set({ ...cloture, updatedBy: ctx.utilisateur.id })
        .where(eq(sirhAttributionsMateriel.id, attribution.id));
      await auditLogIn(tx, {
        action: 'update',
        tableName: 'sirh_attributions_materiel',
        rowId: attribution.id,
        before: attribution,
        after: cloture,
      });

      const statut = statutApresRestitution(data.signalerReparation);
      await tx
        .update(sirhMateriels)
        .set({ statut, updatedBy: ctx.utilisateur.id })
        .where(eq(sirhMateriels.id, data.materielId));
      await auditLogIn(tx, {
        action: 'update',
        tableName: 'sirh_materiels',
        rowId: data.materielId,
        before: materiel,
        after: { statut },
      });
      return { type: 'ok' as const };
    });

    switch (resultat.type) {
      case 'materiel':
        return { ok: false, error: 'Matériel introuvable.' };
      case 'aucune':
        return { ok: false, error: 'Ce matériel n’a pas d’attribution en cours.' };
      case 'dates':
        return {
          ok: false,
          error: `La date de retour doit être postérieure ou égale à la date de remise (${formatDateFr(resultat.dateRemise)}).`,
          fieldErrors: { dateRetour: ['Antérieure à la date de remise.'] },
        };
      case 'ok':
        revalidatePath(baseSirh(ctx), 'layout');
        return { ok: true, data: undefined };
    }
  } catch (err) {
    const message = messageErreurContrainte(err, {
      controle: 'La date de retour doit être postérieure ou égale à la date de remise.',
    });
    if (message) return { ok: false, error: message };
    throw err;
  }
}
