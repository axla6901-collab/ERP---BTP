import 'server-only';

import { and, asc, desc, eq, gte, inArray, isNull, lte, or, type SQL } from 'drizzle-orm';

import type { TenantTx } from '@/lib/db/with-tenant';
import { employes } from '@/db/schema/employes';
import {
  sirhAbsences,
  sirhCollaborateurs,
  sirhCompteurAjustements,
  sirhCompteurs,
  sirhEquipeMembres,
  sirhEquipes,
  sirhJoursFeries,
  sirhTypesAbsence,
} from '@/db/schema/test-sirh';
import { utilisateurs } from '@/db/schema/utilisateurs';
import { STATUTS_DEMANDE_ACTIFS } from '@/lib/validation/test-sirh/enums';

import { ajouterJours, type IsoDate } from '../calendrier';
import { nomComplet, versNombre } from '../format';

import { datesFeriesApplicables, type FerieSite } from './regles';
import { calculerSolde, dureeDansPeriode } from './soldes';
import type { AbsenceLigne, AjustementLigne, CompteurLigne } from './types';

/**
 * Accès aux données partagés par les lectures (`queries.ts`) et les server
 * actions du domaine Absences. Toutes ces fonctions reçoivent la transaction
 * `withTenant` (RLS posée) : elles ne vérifient AUCUN droit — c'est le rôle de
 * l'appelant.
 */

/** Jours fériés CHÔMÉS de [debut, fin] (globaux et par site), triés par date. */
export async function chargerFeriesChomes(
  tx: TenantTx,
  debut: IsoDate,
  fin: IsoDate,
): Promise<Array<FerieSite & { libelle: string }>> {
  return tx
    .select({
      date: sirhJoursFeries.dateFerie,
      libelle: sirhJoursFeries.libelle,
      siteId: sirhJoursFeries.siteId,
    })
    .from(sirhJoursFeries)
    .where(
      and(
        isNull(sirhJoursFeries.deletedAt),
        eq(sirhJoursFeries.chome, true),
        gte(sirhJoursFeries.dateFerie, debut),
        lte(sirhJoursFeries.dateFerie, fin),
      ),
    )
    .orderBy(asc(sirhJoursFeries.dateFerie));
}

/** Site de rattachement SIRH (`sirh_collaborateurs.site_id`) de chaque employé. */
export async function sitesDesEmployes(
  tx: TenantTx,
  employeIds: readonly string[],
): Promise<Map<string, string | null>> {
  if (employeIds.length === 0) return new Map();
  const rows = await tx
    .select({ employeId: sirhCollaborateurs.employeId, siteId: sirhCollaborateurs.siteId })
    .from(sirhCollaborateurs)
    .where(
      and(
        inArray(sirhCollaborateurs.employeId, [...employeIds]),
        isNull(sirhCollaborateurs.deletedAt),
      ),
    );
  return new Map(rows.map((r) => [r.employeId, r.siteId]));
}

/** Équipes (actives) dont l'employé est membre sur tout ou partie de [debut, fin]. */
export async function equipesDeLEmploye(
  tx: TenantTx,
  employeId: string,
  debut: IsoDate,
  fin: IsoDate,
): Promise<string[]> {
  const rows = await tx
    .select({ equipeId: sirhEquipeMembres.equipeId })
    .from(sirhEquipeMembres)
    .innerJoin(sirhEquipes, eq(sirhEquipes.id, sirhEquipeMembres.equipeId))
    .where(
      and(
        eq(sirhEquipeMembres.employeId, employeId),
        isNull(sirhEquipeMembres.deletedAt),
        isNull(sirhEquipes.deletedAt),
        or(isNull(sirhEquipeMembres.dateDebut), lte(sirhEquipeMembres.dateDebut, fin)),
        or(isNull(sirhEquipeMembres.dateFin), gte(sirhEquipeMembres.dateFin, debut)),
      ),
    );
  return [...new Set(rows.map((r) => r.equipeId))];
}

/** Emails des comptes utilisateurs (demandeur, valideur) — table globale. */
async function emailsUtilisateurs(
  tx: TenantTx,
  ids: ReadonlyArray<string | null>,
): Promise<Map<string, string>> {
  const uniques = [...new Set(ids.filter((v): v is string => Boolean(v)))];
  if (uniques.length === 0) return new Map();
  const rows = await tx
    .select({ id: utilisateurs.id, email: utilisateurs.email })
    .from(utilisateurs)
    .where(inArray(utilisateurs.id, uniques));
  return new Map(rows.map((r) => [r.id, r.email]));
}

/**
 * Demandes d'absence (non supprimées) répondant à `condition`, avec employé et
 * type, converties en lignes sérialisables. Tri par date de début.
 */
export async function chargerAbsencesLignes(
  tx: TenantTx,
  condition: SQL | undefined,
  opts: { ordre?: 'asc' | 'desc'; limite?: number } = {},
): Promise<AbsenceLigne[]> {
  const rows = await tx
    .select({
      id: sirhAbsences.id,
      employeId: sirhAbsences.employeId,
      nom: employes.nom,
      prenom: employes.prenom,
      matricule: employes.matricule,
      typeAbsenceId: sirhAbsences.typeAbsenceId,
      typeCode: sirhTypesAbsence.code,
      typeLibelle: sirhTypesAbsence.libelle,
      couleur: sirhTypesAbsence.couleur,
      unite: sirhTypesAbsence.uniteDecompte,
      categorie: sirhTypesAbsence.categorie,
      avecSolde: sirhTypesAbsence.avecSolde,
      dateDebut: sirhAbsences.dateDebut,
      dateFin: sirhAbsences.dateFin,
      demiJourneeDebut: sirhAbsences.demiJourneeDebut,
      demiJourneeFin: sirhAbsences.demiJourneeFin,
      duree: sirhAbsences.duree,
      motif: sirhAbsences.motif,
      statut: sirhAbsences.statut,
      demandePar: sirhAbsences.demandePar,
      valideurId: sirhAbsences.valideurId,
      dateDecision: sirhAbsences.dateDecision,
      commentaireDecision: sirhAbsences.commentaireDecision,
      justificatifDocumentId: sirhAbsences.justificatifDocumentId,
      createdAt: sirhAbsences.createdAt,
    })
    .from(sirhAbsences)
    .innerJoin(employes, eq(employes.id, sirhAbsences.employeId))
    .innerJoin(sirhTypesAbsence, eq(sirhTypesAbsence.id, sirhAbsences.typeAbsenceId))
    .where(and(isNull(sirhAbsences.deletedAt), condition))
    .orderBy(
      opts.ordre === 'asc' ? asc(sirhAbsences.dateDebut) : desc(sirhAbsences.dateDebut),
      asc(employes.nom),
      asc(employes.prenom),
    )
    .limit(opts.limite ?? 2000);

  const emails = await emailsUtilisateurs(
    tx,
    rows.flatMap((r) => [r.demandePar, r.valideurId]),
  );
  return rows.map((r) => ({
    id: r.id,
    employeId: r.employeId,
    employe: nomComplet(r.prenom, r.nom),
    matricule: r.matricule,
    typeAbsenceId: r.typeAbsenceId,
    typeCode: r.typeCode,
    typeLibelle: r.typeLibelle,
    couleur: r.couleur,
    unite: r.unite,
    categorie: r.categorie,
    avecSolde: r.avecSolde,
    dateDebut: r.dateDebut,
    dateFin: r.dateFin,
    demiJourneeDebut: r.demiJourneeDebut,
    demiJourneeFin: r.demiJourneeFin,
    duree: versNombre(r.duree) ?? 0,
    motif: r.motif,
    statut: r.statut,
    demandeParId: r.demandePar,
    demandePar: r.demandePar ? (emails.get(r.demandePar) ?? null) : null,
    valideur: r.valideurId ? (emails.get(r.valideurId) ?? null) : null,
    dateDecision: r.dateDecision ? r.dateDecision.toISOString() : null,
    commentaireDecision: r.commentaireDecision,
    justificatifDocumentId: r.justificatifDocumentId,
    createdAt: r.createdAt.toISOString(),
  }));
}

/**
 * Compteurs (non supprimés) répondant à `condition`, avec leur synthèse :
 * Σ ajustements, pris (absences approuvées), en attente, solde. Les absences à
 * cheval sur deux périodes sont ventilées (`dureeDansPeriode`).
 */
export async function chargerCompteursLignes(
  tx: TenantTx,
  condition: SQL | undefined,
): Promise<CompteurLigne[]> {
  const compteurs = await tx
    .select({
      id: sirhCompteurs.id,
      employeId: sirhCompteurs.employeId,
      nom: employes.nom,
      prenom: employes.prenom,
      matricule: employes.matricule,
      typeAbsenceId: sirhCompteurs.typeAbsenceId,
      typeCode: sirhTypesAbsence.code,
      typeLibelle: sirhTypesAbsence.libelle,
      couleur: sirhTypesAbsence.couleur,
      unite: sirhTypesAbsence.uniteDecompte,
      periodeDebut: sirhCompteurs.periodeDebut,
      periodeFin: sirhCompteurs.periodeFin,
      droitsAcquis: sirhCompteurs.droitsAcquis,
      report: sirhCompteurs.report,
      notes: sirhCompteurs.notes,
    })
    .from(sirhCompteurs)
    .innerJoin(employes, eq(employes.id, sirhCompteurs.employeId))
    .innerJoin(sirhTypesAbsence, eq(sirhTypesAbsence.id, sirhCompteurs.typeAbsenceId))
    .where(and(isNull(sirhCompteurs.deletedAt), condition))
    .orderBy(
      asc(employes.nom),
      asc(employes.prenom),
      asc(sirhTypesAbsence.ordre),
      desc(sirhCompteurs.periodeDebut),
    );
  if (compteurs.length === 0) return [];

  const ajustements = await tx
    .select({
      id: sirhCompteurAjustements.id,
      compteurId: sirhCompteurAjustements.compteurId,
      dateAjustement: sirhCompteurAjustements.dateAjustement,
      valeur: sirhCompteurAjustements.valeur,
      motif: sirhCompteurAjustements.motif,
    })
    .from(sirhCompteurAjustements)
    .where(
      and(
        inArray(
          sirhCompteurAjustements.compteurId,
          compteurs.map((c) => c.id),
        ),
        isNull(sirhCompteurAjustements.deletedAt),
      ),
    )
    .orderBy(asc(sirhCompteurAjustements.dateAjustement));
  const ajustementsParCompteur = new Map<string, AjustementLigne[]>();
  for (const a of ajustements) {
    const liste = ajustementsParCompteur.get(a.compteurId) ?? [];
    liste.push({
      id: a.id,
      dateAjustement: a.dateAjustement,
      valeur: versNombre(a.valeur) ?? 0,
      motif: a.motif,
    });
    ajustementsParCompteur.set(a.compteurId, liste);
  }

  const employeIds = [...new Set(compteurs.map((c) => c.employeId))];
  const typeIds = [...new Set(compteurs.map((c) => c.typeAbsenceId))];
  const debutMin = compteurs.reduce(
    (m, c) => (c.periodeDebut < m ? c.periodeDebut : m),
    '9999-12-31',
  );
  const finMax = compteurs.reduce((m, c) => (c.periodeFin > m ? c.periodeFin : m), '0000-01-01');

  const absences = await tx
    .select({
      employeId: sirhAbsences.employeId,
      typeAbsenceId: sirhAbsences.typeAbsenceId,
      statut: sirhAbsences.statut,
      dateDebut: sirhAbsences.dateDebut,
      dateFin: sirhAbsences.dateFin,
      demiJourneeDebut: sirhAbsences.demiJourneeDebut,
      demiJourneeFin: sirhAbsences.demiJourneeFin,
      duree: sirhAbsences.duree,
    })
    .from(sirhAbsences)
    .where(
      and(
        isNull(sirhAbsences.deletedAt),
        inArray(sirhAbsences.employeId, employeIds),
        inArray(sirhAbsences.typeAbsenceId, typeIds),
        inArray(sirhAbsences.statut, [...STATUTS_DEMANDE_ACTIFS]),
        lte(sirhAbsences.dateDebut, finMax),
        gte(sirhAbsences.dateFin, debutMin),
      ),
    );
  const absencesParCle = new Map<string, typeof absences>();
  for (const a of absences) {
    const cle = `${a.employeId}|${a.typeAbsenceId}`;
    const liste = absencesParCle.get(cle) ?? [];
    liste.push(a);
    absencesParCle.set(cle, liste);
  }

  const feries = await chargerFeriesChomes(tx, debutMin, ajouterJours(finMax, 1));
  const sites = await sitesDesEmployes(tx, employeIds);

  return compteurs.map((c) => {
    const feriesEmploye = datesFeriesApplicables(feries, sites.get(c.employeId) ?? null);
    const periode = { debut: c.periodeDebut, fin: c.periodeFin };
    let pris = 0;
    let enAttente = 0;
    for (const a of absencesParCle.get(`${c.employeId}|${c.typeAbsenceId}`) ?? []) {
      const part = dureeDansPeriode(a, periode, c.unite, feriesEmploye);
      if (a.statut === 'approuvee') pris += part;
      else enAttente += part;
    }
    const liste = ajustementsParCompteur.get(c.id) ?? [];
    const synthese = calculerSolde({
      droitsAcquis: c.droitsAcquis,
      report: c.report,
      ajustements: liste.map((a) => a.valeur),
      pris,
      enAttente,
    });
    return {
      id: c.id,
      employeId: c.employeId,
      employe: nomComplet(c.prenom, c.nom),
      matricule: c.matricule,
      typeAbsenceId: c.typeAbsenceId,
      typeCode: c.typeCode,
      typeLibelle: c.typeLibelle,
      couleur: c.couleur,
      unite: c.unite,
      periodeDebut: c.periodeDebut,
      periodeFin: c.periodeFin,
      ...synthese,
      notes: c.notes,
      ajustements: liste,
    };
  });
}
