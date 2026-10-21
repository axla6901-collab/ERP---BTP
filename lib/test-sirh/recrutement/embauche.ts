'use server';

import { and, count, eq, isNull } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';

import { auditLogIn } from '@/lib/audit/log';
import type { ActionResult } from '@/lib/common/action-result';
import { withTenant } from '@/lib/db/with-tenant';
import { employes } from '@/db/schema/employes';
import {
  sirhCandidats,
  sirhCandidatures,
  sirhCollaborateurs,
  sirhContrats,
  sirhOffres,
  sirhPostes,
} from '@/db/schema/test-sirh';
import { embaucheSchema, type EmbaucheInput } from '@/lib/validation/test-sirh/recrutement';

import { aujourdhuiIso } from '../calendrier';
import { baseSirh, exigerContexteSirhAction } from '../contexte';
import { messageErreurContrainte } from '../erreurs';
import { ROLES_SIRH_GESTION } from '../permissions';
import {
  datesOffrePourStatut,
  offreEstPourvue,
  transitionCandidature,
  typeContratRhDepuisSirh,
} from './pipeline';

/**
 * Embauche d'un candidat — passerelle recrutement → RH (gestion RH uniquement).
 *
 * Dans une seule transaction :
 *   1. crée la fiche `employes` (identité + coordonnées du candidat, date
 *      d'entrée, type de contrat RH mappé depuis le type SIRH, société d'intérim
 *      si intérim — CHECK `chk_employes_interim_societe`), puis le dossier SIRH :
 *      affectation `sirh_collaborateurs` (poste et site de l'offre) et première
 *      version `sirh_contrats` (type SIRH choisi, poste figé, à compléter) ;
 *   2. rattache le candidat à l'employé (`sirh_candidats.employe_id`) ;
 *   3. passe la candidature à l'étape « embauche » ;
 *   4. passe l'offre à « pourvue » dès que les embauches couvrent ses postes.
 */

export type ResultatEmbauche = {
  /** Fiche employé créée (dossier collaborateur `/test-sirh/collaborateurs/<id>`). */
  employeId: string;
  /** L'offre vient de passer au statut « Pourvue ». */
  offrePourvue: boolean;
};

export async function embaucherCandidat(
  input: EmbaucheInput,
): Promise<ActionResult<ResultatEmbauche>> {
  const ctx = await exigerContexteSirhAction(ROLES_SIRH_GESTION);
  const parsed = embaucheSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: 'Données invalides.',
      fieldErrors: parsed.error.flatten().fieldErrors as Record<string, string[]>,
    };
  }
  const data = parsed.data;
  const typeContrat = typeContratRhDepuisSirh(data.typeContrat);
  const today = aujourdhuiIso();

  try {
    const resultat = await withTenant(ctx.entreprise.id, async (tx) => {
      const [ligne] = await tx
        .select({ candidature: sirhCandidatures, candidat: sirhCandidats, offre: sirhOffres })
        .from(sirhCandidatures)
        .innerJoin(
          sirhCandidats,
          and(eq(sirhCandidats.id, sirhCandidatures.candidatId), isNull(sirhCandidats.deletedAt)),
        )
        .innerJoin(
          sirhOffres,
          and(eq(sirhOffres.id, sirhCandidatures.offreId), isNull(sirhOffres.deletedAt)),
        )
        .where(and(eq(sirhCandidatures.id, data.candidatureId), isNull(sirhCandidatures.deletedAt)))
        .limit(1);
      if (!ligne) return { type: 'erreur' as const, message: 'Candidature introuvable.' };
      const { candidature, candidat, offre } = ligne;

      const verdict = transitionCandidature(candidature.etape, 'embauche');
      if (!verdict.ok) return { type: 'erreur' as const, message: verdict.raison };
      if (candidat.employeId) {
        return {
          type: 'erreur' as const,
          message: 'Ce candidat a déjà été embauché : sa fiche collaborateur existe.',
        };
      }

      // 1. Fiche employé (module RH).
      const valeursEmploye = {
        nom: candidat.nom,
        prenom: candidat.prenom,
        email: candidat.email,
        telephoneMobile: candidat.telephone,
        typeContrat,
        societeInterim: typeContrat === 'INT' ? data.societeInterim : null,
        dateEntree: data.dateEntree,
        dateEmbauche: data.dateEntree,
        actif: true,
      };
      const [employe] = await tx
        .insert(employes)
        .values({
          entrepriseId: ctx.entreprise.id,
          ...valeursEmploye,
          createdBy: ctx.utilisateur.id,
          updatedBy: ctx.utilisateur.id,
        })
        .returning({ id: employes.id });
      if (!employe) throw new Error('INSERT employes échoué.');
      await auditLogIn(tx, {
        action: 'insert',
        tableName: 'employes',
        rowId: employe.id,
        after: { ...valeursEmploye, origine: 'recrutement', candidatureId: candidature.id },
      });

      // 1 bis. Dossier SIRH : affectation (poste et site de l'offre) + 1re version
      // de contrat, pour que le dossier collaborateur soit exploitable d'emblée.
      const [poste] = offre.posteId
        ? await tx
            .select()
            .from(sirhPostes)
            .where(and(eq(sirhPostes.id, offre.posteId), isNull(sirhPostes.deletedAt)))
            .limit(1)
        : [];
      const valeursAffectation = {
        employeId: employe.id,
        posteId: poste?.id ?? null,
        siteId: offre.siteId,
        dateAnciennete: data.dateEntree,
      };
      const [affectation] = await tx
        .insert(sirhCollaborateurs)
        .values({
          entrepriseId: ctx.entreprise.id,
          ...valeursAffectation,
          createdBy: ctx.utilisateur.id,
          updatedBy: ctx.utilisateur.id,
        })
        .returning({ id: sirhCollaborateurs.id });
      if (!affectation) throw new Error('INSERT sirh_collaborateurs échoué.');
      await auditLogIn(tx, {
        action: 'insert',
        tableName: 'sirh_collaborateurs',
        rowId: affectation.id,
        after: { ...valeursAffectation, origine: 'recrutement' },
      });

      const valeursContrat = {
        employeId: employe.id,
        typeContrat: data.typeContrat,
        dateDebut: data.dateEntree,
        posteId: poste?.id ?? null,
        intitulePoste: poste?.intitule ?? offre.titre,
        categorie: poste?.categorie ?? null,
        niveau: poste?.niveau ?? null,
        coefficient: poste?.coefficient ?? null,
        siteId: offre.siteId,
        notes:
          'Version créée à l’embauche (recrutement) : compléter le temps de travail, la rémunération, ' +
          'le motif de recours et la date de fin le cas échéant.',
      };
      const [contrat] = await tx
        .insert(sirhContrats)
        .values({
          entrepriseId: ctx.entreprise.id,
          ...valeursContrat,
          createdBy: ctx.utilisateur.id,
          updatedBy: ctx.utilisateur.id,
        })
        .returning({ id: sirhContrats.id });
      if (!contrat) throw new Error('INSERT sirh_contrats échoué.');
      await auditLogIn(tx, {
        action: 'insert',
        tableName: 'sirh_contrats',
        rowId: contrat.id,
        after: { ...valeursContrat, origine: 'recrutement' },
      });

      // 2. Passerelle candidat → employé.
      await tx
        .update(sirhCandidats)
        .set({ employeId: employe.id, updatedBy: ctx.utilisateur.id })
        .where(eq(sirhCandidats.id, candidat.id));
      await auditLogIn(tx, {
        action: 'update',
        tableName: 'sirh_candidats',
        rowId: candidat.id,
        before: candidat,
        after: { employeId: employe.id },
      });

      // 3. Candidature close « embauche ».
      await tx
        .update(sirhCandidatures)
        .set({ etape: 'embauche', motifRefus: null, updatedBy: ctx.utilisateur.id })
        .where(eq(sirhCandidatures.id, candidature.id));
      await auditLogIn(tx, {
        action: 'update',
        tableName: 'sirh_candidatures',
        rowId: candidature.id,
        before: candidature,
        after: { etape: 'embauche', motifRefus: null },
      });

      // 4. Offre pourvue dès que les embauches couvrent le nombre de postes.
      const [embauches] = await tx
        .select({ n: count() })
        .from(sirhCandidatures)
        .where(
          and(
            eq(sirhCandidatures.offreId, offre.id),
            eq(sirhCandidatures.etape, 'embauche'),
            isNull(sirhCandidatures.deletedAt),
          ),
        );
      let offrePourvue = false;
      if (offre.statut !== 'pourvue' && offreEstPourvue(embauches?.n ?? 0, offre.nbPostes)) {
        const afterOffre = {
          statut: 'pourvue' as const,
          ...datesOffrePourStatut('pourvue', offre, today),
        };
        await tx
          .update(sirhOffres)
          .set({ ...afterOffre, updatedBy: ctx.utilisateur.id })
          .where(eq(sirhOffres.id, offre.id));
        await auditLogIn(tx, {
          action: 'update',
          tableName: 'sirh_offres',
          rowId: offre.id,
          before: offre,
          after: afterOffre,
        });
        offrePourvue = true;
      }

      return { type: 'ok' as const, employeId: employe.id, offrePourvue };
    });

    if (resultat.type === 'erreur') return { ok: false, error: resultat.message };
    // Recrutement, collaborateurs, onboarding, tableau de bord… + liste RH des employés.
    revalidatePath(baseSirh(ctx), 'layout');
    revalidatePath(`/${ctx.entreprise.slug}/rh`, 'layout');
    return {
      ok: true,
      data: { employeId: resultat.employeId, offrePourvue: resultat.offrePourvue },
    };
  } catch (err) {
    const message = messageErreurContrainte(err, {
      controle: 'Fiche employé incohérente (société d’intérim ou email).',
    });
    if (message) return { ok: false, error: message };
    throw err;
  }
}
