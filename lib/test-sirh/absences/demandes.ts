'use server';

import { and, eq, gte, inArray, isNull, lte, sql } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';

import { auditLogIn } from '@/lib/audit/log';
import type { ActionResult } from '@/lib/common/action-result';
import { withTenant, type TenantTx } from '@/lib/db/with-tenant';
import {
  sirhAbsences,
  sirhCompteurs,
  sirhDocuments,
  sirhPeriodesBloquees,
  sirhTypesAbsence,
} from '@/db/schema/test-sirh';
import {
  demandeAbsenceSchema,
  idAbsenceSchema,
  type DemandeAbsenceInput,
} from '@/lib/validation/test-sirh/absences';
import { decisionSchema, type DecisionInput } from '@/lib/validation/test-sirh/commun';
import {
  LIBELLES_STATUT_DEMANDE,
  STATUTS_DEMANDE_ACTIFS,
  type UniteDecompte,
} from '@/lib/validation/test-sirh/enums';

import { employeIdDeLUtilisateur, peutAgirPourEmploye } from '../acces';
import { ajouterJours, aujourdhuiIso } from '../calendrier';
import { baseSirh, exigerContexteSirhAction } from '../contexte';
import { messageErreurContrainte } from '../erreurs';
import { peutGererSirh, ROLES_SIRH_VALIDATION } from '../permissions';

import {
  chargerCompteursLignes,
  chargerFeriesChomes,
  equipesDeLEmploye,
  sitesDesEmployes,
} from './donnees';
import {
  calculerDureeDemande,
  datesFeriesApplicables,
  libellePlage,
  periodeBloqueeApplicable,
  statutInitialDemande,
  trouverChevauchement,
  verifierAnnulation,
  verifierDecision,
} from './regles';
import { messageSoldeInsuffisant } from './soldes';
import type { ResultatDecisionAbsence, ResultatDemandeAbsence } from './types';

/**
 * Server actions — workflow des demandes d'absence (Factorial Leave) :
 * demande (libre-service ou gestion RH), décision (valideurs), annulation.
 */

type Issue<T> =
  | { type: 'ok'; data: T }
  | { type: 'erreur'; message: string }
  | { type: 'champ'; champ: string; message: string };

function versResultat<T>(r: Exclude<Issue<T>, { type: 'ok' }>): ActionResult<T> {
  if (r.type === 'champ') {
    return { ok: false, error: r.message, fieldErrors: { [r.champ]: [r.message] } };
  }
  return { ok: false, error: r.message };
}

/**
 * Avertissement de solde (types avec solde) pour l'employé / type / date :
 * - `base = 'soldePrevisionnel'` à la demande (demandes en attente déduites) ;
 * - `base = 'solde'` à l'approbation (la demande approuvée est déjà « en attente »).
 */
async function avertissementSolde(
  tx: TenantTx,
  p: {
    employeId: string;
    typeAbsenceId: string;
    date: string;
    duree: number;
    unite: UniteDecompte;
    base: 'solde' | 'soldePrevisionnel';
  },
): Promise<string | null> {
  const [compteur] = await chargerCompteursLignes(
    tx,
    and(
      eq(sirhCompteurs.employeId, p.employeId),
      eq(sirhCompteurs.typeAbsenceId, p.typeAbsenceId),
      lte(sirhCompteurs.periodeDebut, p.date),
      gte(sirhCompteurs.periodeFin, p.date),
    ),
  );
  if (!compteur) {
    return 'Aucun compteur de droits ne couvre cette date : le solde n’a pas pu être vérifié.';
  }
  return messageSoldeInsuffisant(compteur[p.base], p.duree, p.unite);
}

/**
 * Crée une demande d'absence. Appelable par TOUT rôle pour sa propre fiche
 * (libre-service) ; un gestionnaire RH peut saisir pour n'importe quel employé
 * et l'approuver directement (`approuverDirectement`).
 *
 * Contrôles : type actif, justificatif (obligatoire selon le type, rattaché à
 * l'employé), durée > 0 (fériés chômés du site exclus), pas de chevauchement
 * avec une absence active, aucune période bloquée applicable (refus). Solde
 * insuffisant → avertissement NON bloquant. Type sans validation → approuvée.
 */
export async function demanderAbsence(
  input: DemandeAbsenceInput,
): Promise<ActionResult<ResultatDemandeAbsence>> {
  const ctx = await exigerContexteSirhAction();
  const parsed = demandeAbsenceSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: 'Données invalides.',
      fieldErrors: parsed.error.flatten().fieldErrors as Record<string, string[]>,
    };
  }
  const data = parsed.data;
  const gestionnaire = peutGererSirh(ctx.utilisateur.role);

  try {
    const r = await withTenant(
      ctx.entreprise.id,
      async (tx): Promise<Issue<ResultatDemandeAbsence>> => {
        if (!(await peutAgirPourEmploye(tx, ctx, data.employeId))) {
          return {
            type: 'erreur',
            message:
              'Accès refusé : vous ne pouvez saisir une absence que pour votre propre fiche.',
          };
        }
        // Sérialise les demandes d'un même employé (contrôle de chevauchement fiable).
        await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${data.employeId}))`);

        const [type] = await tx
          .select()
          .from(sirhTypesAbsence)
          .where(
            and(eq(sirhTypesAbsence.id, data.typeAbsenceId), isNull(sirhTypesAbsence.deletedAt)),
          );
        if (!type || !type.actif) {
          return {
            type: 'champ',
            champ: 'typeAbsenceId',
            message: 'Type d’absence introuvable ou désactivé.',
          };
        }
        // Unité « heures » : durée saisie, les demi-journées n'ont pas de sens.
        const enHeures = type.uniteDecompte === 'heures';
        const plage = {
          dateDebut: data.dateDebut,
          dateFin: data.dateFin,
          demiJourneeDebut: enHeures ? false : data.demiJourneeDebut,
          demiJourneeFin: enHeures ? false : data.demiJourneeFin,
        };

        if (type.justificatifRequis && !data.justificatifDocumentId) {
          return {
            type: 'champ',
            champ: 'justificatifDocumentId',
            message: `Justificatif obligatoire pour « ${type.libelle} ».`,
          };
        }
        if (data.justificatifDocumentId) {
          const [doc] = await tx
            .select({ employeId: sirhDocuments.employeId })
            .from(sirhDocuments)
            .where(
              and(
                eq(sirhDocuments.id, data.justificatifDocumentId),
                isNull(sirhDocuments.deletedAt),
              ),
            );
          if (!doc || doc.employeId !== data.employeId) {
            return {
              type: 'champ',
              champ: 'justificatifDocumentId',
              message: 'Justificatif introuvable pour cet employé.',
            };
          }
        }

        let duree: number | null;
        if (enHeures) {
          duree = calculerDureeDemande({
            ...plage,
            unite: 'heures',
            feries: [],
            dureeHeures: data.dureeHeures,
          });
          if (duree === null) {
            return {
              type: 'champ',
              champ: 'dureeHeures',
              message: 'Durée en heures requise pour ce type d’absence.',
            };
          }
        } else {
          const sites = await sitesDesEmployes(tx, [data.employeId]);
          const feries = await chargerFeriesChomes(
            tx,
            data.dateDebut,
            ajouterJours(data.dateFin, 1),
          );
          duree = calculerDureeDemande({
            ...plage,
            unite: type.uniteDecompte,
            feries: datesFeriesApplicables(feries, sites.get(data.employeId) ?? null),
          });
          if (!duree) {
            return {
              type: 'erreur',
              message: 'Aucun jour décompté sur cette période (week-end ou jours fériés).',
            };
          }
        }

        const existantes = await tx
          .select({
            id: sirhAbsences.id,
            statut: sirhAbsences.statut,
            dateDebut: sirhAbsences.dateDebut,
            dateFin: sirhAbsences.dateFin,
            demiJourneeDebut: sirhAbsences.demiJourneeDebut,
            demiJourneeFin: sirhAbsences.demiJourneeFin,
          })
          .from(sirhAbsences)
          .where(
            and(
              eq(sirhAbsences.employeId, data.employeId),
              isNull(sirhAbsences.deletedAt),
              inArray(sirhAbsences.statut, [...STATUTS_DEMANDE_ACTIFS]),
              lte(sirhAbsences.dateDebut, data.dateFin),
              gte(sirhAbsences.dateFin, data.dateDebut),
            ),
          );
        const conflit = trouverChevauchement(plage, existantes);
        if (conflit) {
          return {
            type: 'erreur',
            message: `Chevauchement avec une absence ${LIBELLES_STATUT_DEMANDE[conflit.statut].toLowerCase()} ${libellePlage(conflit)}.`,
          };
        }

        const periodes = await tx
          .select({
            id: sirhPeriodesBloquees.id,
            libelle: sirhPeriodesBloquees.libelle,
            dateDebut: sirhPeriodesBloquees.dateDebut,
            dateFin: sirhPeriodesBloquees.dateFin,
            typeAbsenceId: sirhPeriodesBloquees.typeAbsenceId,
            equipeId: sirhPeriodesBloquees.equipeId,
          })
          .from(sirhPeriodesBloquees)
          .where(
            and(
              isNull(sirhPeriodesBloquees.deletedAt),
              lte(sirhPeriodesBloquees.dateDebut, data.dateFin),
              gte(sirhPeriodesBloquees.dateFin, data.dateDebut),
            ),
          );
        if (periodes.length > 0) {
          const equipes = await equipesDeLEmploye(tx, data.employeId, data.dateDebut, data.dateFin);
          const blocage = periodeBloqueeApplicable(
            {
              dateDebut: data.dateDebut,
              dateFin: data.dateFin,
              typeAbsenceId: data.typeAbsenceId,
              necessiteValidation: type.necessiteValidation,
            },
            equipes,
            periodes,
          );
          if (blocage) {
            return {
              type: 'erreur',
              message: `Période bloquée « ${blocage.libelle} » ${libellePlage({
                dateDebut: blocage.dateDebut,
                dateFin: blocage.dateFin,
                demiJourneeDebut: false,
                demiJourneeFin: false,
              })} : aucune absence de ce type ne peut y être posée.`,
            };
          }
        }

        const avertissement = type.avecSolde
          ? await avertissementSolde(tx, {
              employeId: data.employeId,
              typeAbsenceId: data.typeAbsenceId,
              date: data.dateDebut,
              duree,
              unite: type.uniteDecompte,
              base: 'soldePrevisionnel',
            })
          : null;

        const statut = statutInitialDemande({
          necessiteValidation: type.necessiteValidation,
          approuverDirectement: data.approuverDirectement,
          estGestionnaire: gestionnaire,
        });
        const approuveeParGestion = statut === 'approuvee' && type.necessiteValidation;
        const [inserted] = await tx
          .insert(sirhAbsences)
          .values({
            entrepriseId: ctx.entreprise.id,
            employeId: data.employeId,
            typeAbsenceId: data.typeAbsenceId,
            dateDebut: data.dateDebut,
            dateFin: data.dateFin,
            demiJourneeDebut: plage.demiJourneeDebut,
            demiJourneeFin: plage.demiJourneeFin,
            duree: duree.toFixed(2),
            motif: data.motif,
            statut,
            demandePar: ctx.utilisateur.id,
            valideurId: approuveeParGestion ? ctx.utilisateur.id : null,
            dateDecision: statut === 'approuvee' ? new Date() : null,
            commentaireDecision: approuveeParGestion
              ? 'Saisie et approuvée directement par la gestion RH.'
              : null,
            justificatifDocumentId: data.justificatifDocumentId,
            createdBy: ctx.utilisateur.id,
            updatedBy: ctx.utilisateur.id,
          })
          .returning({ id: sirhAbsences.id });
        if (!inserted) throw new Error('INSERT sirh_absences échoué.');
        await auditLogIn(tx, {
          action: 'insert',
          tableName: 'sirh_absences',
          rowId: inserted.id,
          after: { ...data, duree, statut },
        });
        return { type: 'ok', data: { id: inserted.id, statut, duree, avertissement } };
      },
    );

    if (r.type !== 'ok') return versResultat(r);
    revalidatePath(baseSirh(ctx), 'layout');
    return { ok: true, data: r.data };
  } catch (err) {
    const message = messageErreurContrainte(err, {
      controle: 'Dates ou demi-journées incohérentes.',
      reference: 'Employé, type d’absence ou justificatif introuvable.',
    });
    if (message) return { ok: false, error: message };
    throw err;
  }
}

/**
 * Approuve ou refuse une demande en attente (rôles VALIDATION), avec un
 * commentaire optionnel. Un valideur ne décide pas sa propre demande, sauf
 * gestionnaire RH (admin / RH). Approbation au-delà du solde → avertissement.
 */
export async function deciderAbsence(
  input: DecisionInput,
): Promise<ActionResult<ResultatDecisionAbsence>> {
  const ctx = await exigerContexteSirhAction(ROLES_SIRH_VALIDATION);
  const parsed = decisionSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: 'Données invalides.',
      fieldErrors: parsed.error.flatten().fieldErrors as Record<string, string[]>,
    };
  }
  const data = parsed.data;
  const gestionnaire = peutGererSirh(ctx.utilisateur.role);

  const r = await withTenant(
    ctx.entreprise.id,
    async (tx): Promise<Issue<ResultatDecisionAbsence>> => {
      const [before] = await tx
        .select()
        .from(sirhAbsences)
        .where(and(eq(sirhAbsences.id, data.id), isNull(sirhAbsences.deletedAt)));
      if (!before) return { type: 'erreur', message: 'Demande introuvable.' };

      const moi = await employeIdDeLUtilisateur(tx, ctx.utilisateur.id);
      const verdict = verifierDecision({
        statut: before.statut,
        estPropreDemande: moi !== null && before.employeId === moi,
        estGestionnaire: gestionnaire,
      });
      if (!verdict.ok) return { type: 'erreur', message: verdict.raison };

      const statut = data.decision === 'approuver' ? 'approuvee' : 'refusee';
      let avertissement: string | null = null;
      if (statut === 'approuvee') {
        const [type] = await tx
          .select({
            avecSolde: sirhTypesAbsence.avecSolde,
            unite: sirhTypesAbsence.uniteDecompte,
          })
          .from(sirhTypesAbsence)
          .where(eq(sirhTypesAbsence.id, before.typeAbsenceId));
        if (type?.avecSolde) {
          avertissement = await avertissementSolde(tx, {
            employeId: before.employeId,
            typeAbsenceId: before.typeAbsenceId,
            date: before.dateDebut,
            duree: Number(before.duree),
            unite: type.unite,
            base: 'solde',
          });
        }
      }

      const valeurs = {
        statut,
        valideurId: ctx.utilisateur.id,
        dateDecision: new Date(),
        commentaireDecision: data.commentaire,
        updatedBy: ctx.utilisateur.id,
      } as const;
      await tx
        .update(sirhAbsences)
        .set(valeurs)
        .where(and(eq(sirhAbsences.id, data.id), eq(sirhAbsences.statut, 'en_attente')));
      await auditLogIn(tx, {
        action: 'update',
        tableName: 'sirh_absences',
        rowId: data.id,
        before,
        after: { statut, commentaireDecision: data.commentaire },
      });
      return { type: 'ok', data: { statut, avertissement } };
    },
  );

  if (r.type !== 'ok') return versResultat(r);
  revalidatePath(baseSirh(ctx), 'layout');
  return { ok: true, data: r.data };
}

/**
 * Annule une demande : le demandeur tant qu'elle est en attente ou approuvée
 * et pas encore commencée ; la gestion RH à tout moment (en attente / approuvée).
 */
export async function annulerAbsence(id: string): Promise<ActionResult> {
  const ctx = await exigerContexteSirhAction();
  if (!idAbsenceSchema.safeParse(id).success) return { ok: false, error: 'Demande invalide.' };
  const gestionnaire = peutGererSirh(ctx.utilisateur.role);

  const r = await withTenant(ctx.entreprise.id, async (tx): Promise<Issue<undefined>> => {
    const [before] = await tx
      .select()
      .from(sirhAbsences)
      .where(and(eq(sirhAbsences.id, id), isNull(sirhAbsences.deletedAt)));
    if (!before) return { type: 'erreur', message: 'Demande introuvable.' };

    const moi = await employeIdDeLUtilisateur(tx, ctx.utilisateur.id);
    const verdict = verifierAnnulation({
      statut: before.statut,
      dateDebut: before.dateDebut,
      today: aujourdhuiIso(),
      estGestionnaire: gestionnaire,
      estDemandeur:
        (moi !== null && before.employeId === moi) || before.demandePar === ctx.utilisateur.id,
    });
    if (!verdict.ok) return { type: 'erreur', message: verdict.raison };

    await tx
      .update(sirhAbsences)
      .set({ statut: 'annulee', updatedBy: ctx.utilisateur.id })
      .where(and(eq(sirhAbsences.id, id), eq(sirhAbsences.statut, before.statut)));
    await auditLogIn(tx, {
      action: 'update',
      tableName: 'sirh_absences',
      rowId: id,
      before,
      after: { statut: 'annulee' },
    });
    return { type: 'ok', data: undefined };
  });

  if (r.type !== 'ok') return versResultat(r);
  revalidatePath(baseSirh(ctx), 'layout');
  return { ok: true, data: undefined };
}
