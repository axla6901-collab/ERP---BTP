'use server';

import { and, eq, isNull, ne } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';

import { auditLogIn } from '@/lib/audit/log';
import type { ActionResult } from '@/lib/common/action-result';
import { withTenant } from '@/lib/db/with-tenant';
import { societes } from '@/db/schema/societes';
import { sirhContrats, sirhPostes, sirhSites } from '@/db/schema/test-sirh';
import {
  contratSchema,
  terminerContratSchema,
  type ContratInput,
  type TerminerContratInput,
} from '@/lib/validation/test-sirh/collaborateurs';

import { employeExiste } from '../acces';
import { baseSirh, exigerContexteSirhAction } from '../contexte';
import { messageErreurContrainte } from '../erreurs';
import { formatDateFr } from '../format';
import { ROLES_SIRH_GESTION, peutVoirPaieSirh } from '../permissions';
import { estRemplace, normaliserTempsTravail, planifierVersion } from './contrats';

/**
 * Server actions — versions de contrat (`sirh_contrats`, Factorial
 * contracts/ContractVersion + Compensation). Gestion réservée à
 * ROLES_SIRH_GESTION ; la rémunération (colonnes chiffrées) n'est écrite qu'avec
 * le droit PAIE (`peutVoirPaieSirh`).
 */

export type ResultatEnregistrementContrat = {
  id: string;
  /** Versions précédentes closes la veille de la nouvelle (avenant). */
  versionsCloses: Array<{ id: string; dateFin: string }>;
};

const MESSAGE_CONTROLE =
  'Contrat incohérent (dates, période d’essai, durée hebdomadaire ou jours de forfait).';

function erreurChamp(champ: string, message: string): ActionResult<never> {
  return { ok: false, error: message, fieldErrors: { [champ]: [message] } };
}

function revaliderContrats(base: string, employeId: string) {
  revalidatePath(`${base}/collaborateurs`);
  revalidatePath(`${base}/collaborateurs/${employeId}`);
  revalidatePath(`${base}/collaborateurs/registre`);
}

/**
 * Crée (sans `id`) ou modifie (avec `id`) une version de contrat. À la création,
 * une version antérieure encore ouverte est close la veille du début de la
 * nouvelle ; tout autre chevauchement est refusé.
 */
export async function enregistrerContrat(
  input: ContratInput,
): Promise<ActionResult<ResultatEnregistrementContrat>> {
  const ctx = await exigerContexteSirhAction(ROLES_SIRH_GESTION);
  const parsed = contratSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: 'Données invalides.',
      fieldErrors: parsed.error.flatten().fieldErrors as Record<string, string[]>,
    };
  }
  const data = normaliserTempsTravail(parsed.data);
  const avecRemuneration = peutVoirPaieSirh(ctx.utilisateur.role);

  try {
    const resultat = await withTenant(
      ctx.entreprise.id,
      async (tx): Promise<ActionResult<ResultatEnregistrementContrat>> => {
        if (!(await employeExiste(tx, data.employeId))) {
          return { ok: false, error: 'Collaborateur introuvable.' };
        }
        if (data.posteId) {
          const [poste] = await tx
            .select({ id: sirhPostes.id })
            .from(sirhPostes)
            .where(and(eq(sirhPostes.id, data.posteId), isNull(sirhPostes.deletedAt)));
          if (!poste) return erreurChamp('posteId', 'Poste introuvable.');
        }
        if (data.siteId) {
          const [site] = await tx
            .select({ id: sirhSites.id })
            .from(sirhSites)
            .where(and(eq(sirhSites.id, data.siteId), isNull(sirhSites.deletedAt)));
          if (!site) return erreurChamp('siteId', 'Site introuvable.');
        }
        if (data.societeId) {
          const [societe] = await tx
            .select({ id: societes.id })
            .from(societes)
            .where(and(eq(societes.id, data.societeId), isNull(societes.deletedAt)));
          if (!societe) return erreurChamp('societeId', 'Société introuvable.');
        }

        let before: typeof sirhContrats.$inferSelect | undefined;
        if (data.id) {
          [before] = await tx
            .select()
            .from(sirhContrats)
            .where(
              and(
                eq(sirhContrats.id, data.id),
                eq(sirhContrats.employeId, data.employeId),
                isNull(sirhContrats.deletedAt),
              ),
            );
          if (!before) return { ok: false, error: 'Contrat introuvable.' };
        }

        const autres = await tx
          .select({
            id: sirhContrats.id,
            dateDebut: sirhContrats.dateDebut,
            dateFin: sirhContrats.dateFin,
            motifFin: sirhContrats.motifFin,
          })
          .from(sirhContrats)
          .where(
            and(
              eq(sirhContrats.employeId, data.employeId),
              isNull(sirhContrats.deletedAt),
              data.id ? ne(sirhContrats.id, data.id) : undefined,
            ),
          );
        const plan = planifierVersion(
          { dateDebut: data.dateDebut, dateFin: data.dateFin },
          autres,
          { creation: !data.id },
        );
        if (!plan.ok) return erreurChamp('dateDebut', plan.message);

        const colonnes = {
          typeContrat: data.typeContrat,
          motifRecours: data.motifRecours,
          dateDebut: data.dateDebut,
          dateFin: data.dateFin,
          dateFinPeriodeEssai: data.dateFinPeriodeEssai,
          motifFin: data.motifFin,
          posteId: data.posteId,
          intitulePoste: data.intitulePoste,
          categorie: data.categorie,
          niveau: data.niveau,
          coefficient: data.coefficient,
          tempsTravail: data.tempsTravail,
          heuresHebdo: data.heuresHebdo,
          joursForfait: data.joursForfait,
          conventionCollective: data.conventionCollective,
          societeId: data.societeId,
          siteId: data.siteId,
          notes: data.notes,
        };
        // Rémunération : écrite seulement avec le droit PAIE (sinon inchangée).
        const remuneration = avecRemuneration
          ? { salaireBrutMensuel: data.salaireBrutMensuel, tauxHoraireBrut: data.tauxHoraireBrut }
          : {};
        // Audit : colonnes réellement écrites (salaires caviardés par auditLogIn).
        const apres = { employeId: data.employeId, ...colonnes, ...remuneration };

        for (const v of plan.aClore) {
          const precedente = autres.find((a) => a.id === v.id);
          await tx
            .update(sirhContrats)
            .set({ dateFin: v.dateFin, updatedBy: ctx.utilisateur.id })
            .where(eq(sirhContrats.id, v.id));
          await auditLogIn(tx, {
            action: 'update',
            tableName: 'sirh_contrats',
            rowId: v.id,
            before: { dateFin: precedente?.dateFin ?? null },
            after: { dateFin: v.dateFin },
          });
        }

        if (data.id && before) {
          await tx
            .update(sirhContrats)
            .set({ ...colonnes, ...remuneration, updatedBy: ctx.utilisateur.id })
            .where(eq(sirhContrats.id, data.id));
          await auditLogIn(tx, {
            action: 'update',
            tableName: 'sirh_contrats',
            rowId: data.id,
            before,
            after: apres,
          });
          return { ok: true, data: { id: data.id, versionsCloses: plan.aClore } };
        }

        const [inserted] = await tx
          .insert(sirhContrats)
          .values({
            entrepriseId: ctx.entreprise.id,
            employeId: data.employeId,
            ...colonnes,
            ...remuneration,
            createdBy: ctx.utilisateur.id,
            updatedBy: ctx.utilisateur.id,
          })
          .returning({ id: sirhContrats.id });
        if (!inserted) throw new Error('INSERT sirh_contrats échoué.');
        await auditLogIn(tx, {
          action: 'insert',
          tableName: 'sirh_contrats',
          rowId: inserted.id,
          after: apres,
        });
        return { ok: true, data: { id: inserted.id, versionsCloses: plan.aClore } };
      },
    );
    if (resultat.ok) revaliderContrats(baseSirh(ctx), data.employeId);
    return resultat;
  } catch (err) {
    const message = messageErreurContrainte(err, { controle: MESSAGE_CONTROLE });
    if (message) return { ok: false, error: message };
    throw err;
  }
}

/**
 * « Terminer le contrat » : pose la date de fin et le motif de fin sur la
 * dernière version (une version déjà remplacée ne se termine pas).
 */
export async function terminerContrat(input: TerminerContratInput): Promise<ActionResult> {
  const ctx = await exigerContexteSirhAction(ROLES_SIRH_GESTION);
  const parsed = terminerContratSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: 'Données invalides.',
      fieldErrors: parsed.error.flatten().fieldErrors as Record<string, string[]>,
    };
  }
  const data = parsed.data;

  try {
    const resultat = await withTenant(
      ctx.entreprise.id,
      async (tx): Promise<ActionResult<{ employeId: string }>> => {
        const [before] = await tx
          .select()
          .from(sirhContrats)
          .where(and(eq(sirhContrats.id, data.id), isNull(sirhContrats.deletedAt)));
        if (!before) return { ok: false, error: 'Contrat introuvable.' };
        if (data.dateFin < before.dateDebut) {
          return erreurChamp(
            'dateFin',
            `La date de fin doit être postérieure ou égale au début du contrat (${formatDateFr(before.dateDebut)}).`,
          );
        }
        const versions = await tx
          .select({ id: sirhContrats.id, dateDebut: sirhContrats.dateDebut })
          .from(sirhContrats)
          .where(and(eq(sirhContrats.employeId, before.employeId), isNull(sirhContrats.deletedAt)));
        if (estRemplace(before, versions)) {
          return {
            ok: false,
            error: 'Une version plus récente de ce contrat existe : terminez la dernière version.',
          };
        }

        await tx
          .update(sirhContrats)
          .set({ dateFin: data.dateFin, motifFin: data.motifFin, updatedBy: ctx.utilisateur.id })
          .where(eq(sirhContrats.id, data.id));
        await auditLogIn(tx, {
          action: 'update',
          tableName: 'sirh_contrats',
          rowId: data.id,
          before: { dateFin: before.dateFin, motifFin: before.motifFin },
          after: { dateFin: data.dateFin, motifFin: data.motifFin },
        });
        return { ok: true, data: { employeId: before.employeId } };
      },
    );
    if (!resultat.ok) return resultat;
    revaliderContrats(baseSirh(ctx), resultat.data.employeId);
    return { ok: true, data: undefined };
  } catch (err) {
    const message = messageErreurContrainte(err, { controle: MESSAGE_CONTROLE });
    if (message) return { ok: false, error: message };
    throw err;
  }
}

/**
 * Suppression (soft-delete) d'une version saisie par erreur. Aucune table ne
 * référence `sirh_contrats` : pas de garde-fou référentiel. Une version close
 * automatiquement par celle-ci n'est pas rouverte.
 */
export async function supprimerContrat(id: string): Promise<ActionResult> {
  const ctx = await exigerContexteSirhAction(ROLES_SIRH_GESTION);

  const resultat = await withTenant(
    ctx.entreprise.id,
    async (tx): Promise<ActionResult<{ employeId: string }>> => {
      const [before] = await tx
        .select()
        .from(sirhContrats)
        .where(and(eq(sirhContrats.id, id), isNull(sirhContrats.deletedAt)));
      if (!before) return { ok: false, error: 'Contrat introuvable.' };
      await tx
        .update(sirhContrats)
        .set({ deletedAt: new Date(), updatedBy: ctx.utilisateur.id })
        .where(eq(sirhContrats.id, id));
      await auditLogIn(tx, { action: 'delete', tableName: 'sirh_contrats', rowId: id, before });
      return { ok: true, data: { employeId: before.employeId } };
    },
  );

  if (!resultat.ok) return resultat;
  revaliderContrats(baseSirh(ctx), resultat.data.employeId);
  return { ok: true, data: undefined };
}
