import 'server-only';

import { and, asc, desc, eq, isNotNull, isNull } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import { z } from 'zod';

import type { TenantContext } from '@/lib/auth/tenant-guards';
import { withTenant, type TenantTx } from '@/lib/db/with-tenant';
import { employes } from '@/db/schema/employes';
import { raisonsSociales } from '@/db/schema/raisons-sociales';
import { societes } from '@/db/schema/societes';
import {
  sirhCollaborateurs,
  sirhContrats,
  sirhEquipeMembres,
  sirhEquipes,
  sirhHoraires,
  sirhPostes,
  sirhSites,
} from '@/db/schema/test-sirh';
import { utilisateurs } from '@/db/schema/utilisateurs';
import type {
  CategorieProfessionnelle,
  MotifFinContrat,
  TempsTravail,
  TypeContratSirh,
} from '@/lib/validation/test-sirh/enums';

import { employeExiste, employeIdDeLUtilisateur } from '../acces';
import { aujourdhuiIso, type IsoDate } from '../calendrier';
import { exigerContexteSirhAction } from '../contexte';
import { nomComplet } from '../format';
import { membreActif } from '../organisation/membres';
import {
  ROLES_SIRH_GESTION,
  ROLES_SIRH_LECTURE,
  ROLES_SIRH_LIBRE_SERVICE,
  ROLES_SIRH_PAIE,
  peutLireSirh,
  peutVoirPaieSirh,
} from '../permissions';
import {
  alertesContrats,
  calculerKpiCollaborateurs,
  comparerAlertes,
  construireLigneRegistre,
  contratEnCours,
  dateAncienneteEffective,
  syntheseCollaborateur,
  typeContratDepuisFicheRh,
  type AlerteContratIdentifiee,
  type ContratPeriode,
  type ContratRegistre,
  type KpiCollaborateurs,
  type StatutCollaborateur,
  type SyntheseCollaborateur,
} from './contrats';
import { numeroterRegistre, type LigneRegistreNumerotee } from './registre';
import type { PrefillFicheRh } from './saisie-contrat';

/**
 * Lectures — Test SIRH › Collaborateurs. Fonctions `server-only` (pas des
 * server actions) appelées depuis les Server Components.
 *
 * ⚠️ Les lignes `employes` ne sont JAMAIS renvoyées entières (NIR / IBAN /
 * salaires déchiffrés) : uniquement des colonnes explicites. Les salaires des
 * contrats ne sont lus (donc déchiffrés) qu'avec le droit PAIE.
 */

const UUID = z.string().uuid();

function estUuid(valeur: string): boolean {
  return UUID.safeParse(valeur).success;
}

/**
 * Lecture d'un dossier : droit de lecture SIRH, ou sa propre fiche (libre-service,
 * pour « Mon espace »). À appeler DANS `withTenant`.
 */
async function peutConsulterEmploye(
  tx: TenantTx,
  ctx: TenantContext,
  employeId: string,
): Promise<boolean> {
  if (!(await employeExiste(tx, employeId))) return false;
  if (peutLireSirh(ctx.utilisateur.role)) return true;
  return (await employeIdDeLUtilisateur(tx, ctx.utilisateur.id)) === employeId;
}

type ContratResume = ContratPeriode & { employeId: string; intitulePoste: string | null };

/** Versions de contrat non supprimées, regroupées par employé (sans rémunération). */
async function chargerContratsParEmploye(
  tx: TenantTx,
  employeId?: string,
): Promise<Map<string, ContratResume[]>> {
  const rows = await tx
    .select({
      id: sirhContrats.id,
      employeId: sirhContrats.employeId,
      typeContrat: sirhContrats.typeContrat,
      dateDebut: sirhContrats.dateDebut,
      dateFin: sirhContrats.dateFin,
      dateFinPeriodeEssai: sirhContrats.dateFinPeriodeEssai,
      motifFin: sirhContrats.motifFin,
      intitulePoste: sirhContrats.intitulePoste,
    })
    .from(sirhContrats)
    .where(
      employeId
        ? and(isNull(sirhContrats.deletedAt), eq(sirhContrats.employeId, employeId))
        : isNull(sirhContrats.deletedAt),
    );
  const parEmploye = new Map<string, ContratResume[]>();
  for (const r of rows) {
    const liste = parEmploye.get(r.employeId);
    if (liste) liste.push(r);
    else parEmploye.set(r.employeId, [r]);
  }
  return parEmploye;
}

function libelleSociete(raison: string | null, code: string | null): string | null {
  if (!raison) return code;
  return code ? `${raison} (${code})` : raison;
}

// ─────────────────────────────────────────────────────────────
// Liste des collaborateurs + indicateurs
// ─────────────────────────────────────────────────────────────

export type ContratEnCoursResume = {
  id: string;
  typeContrat: TypeContratSirh;
  dateDebut: IsoDate;
  dateFin: IsoDate | null;
};

/** Ligne de la liste des collaborateurs (sérialisable, aucune donnée sensible). */
export type CollaborateurLigne = SyntheseCollaborateur & {
  /** = employes.id */
  id: string;
  nom: string;
  prenom: string;
  matricule: string | null;
  actif: boolean;
  posteIntitule: string | null;
  siteNom: string | null;
  /** « Prénom Nom » du manager. */
  managerNom: string | null;
  contrat: ContratEnCoursResume | null;
  /** Équipes dont il est membre à la date du jour. */
  equipes: Array<{ id: string; nom: string; couleur: string }>;
  dateAnciennete: IsoDate | null;
};

/** Tous les collaborateurs (employés non supprimés) joints à leur extension SIRH. */
export async function listerCollaborateurs(): Promise<CollaborateurLigne[]> {
  const ctx = await exigerContexteSirhAction(ROLES_SIRH_LECTURE);
  const today = aujourdhuiIso();
  return withTenant(ctx.entreprise.id, async (tx) => {
    const manager = alias(employes, 'manager');
    const rows = await tx
      .select({
        id: employes.id,
        nom: employes.nom,
        prenom: employes.prenom,
        matricule: employes.matricule,
        actif: employes.actif,
        dateEntree: employes.dateEntree,
        dateEmbauche: employes.dateEmbauche,
        dateSortie: employes.dateSortie,
        qualification: employes.qualification,
        dateAnciennete: sirhCollaborateurs.dateAnciennete,
        posteIntitule: sirhPostes.intitule,
        siteNom: sirhSites.nom,
        managerNom: manager.nom,
        managerPrenom: manager.prenom,
      })
      .from(employes)
      .leftJoin(
        sirhCollaborateurs,
        and(eq(sirhCollaborateurs.employeId, employes.id), isNull(sirhCollaborateurs.deletedAt)),
      )
      .leftJoin(sirhPostes, eq(sirhPostes.id, sirhCollaborateurs.posteId))
      .leftJoin(sirhSites, eq(sirhSites.id, sirhCollaborateurs.siteId))
      .leftJoin(manager, eq(manager.id, sirhCollaborateurs.managerId))
      .where(isNull(employes.deletedAt))
      .orderBy(asc(employes.nom), asc(employes.prenom));

    const contrats = await chargerContratsParEmploye(tx);
    const membres = await tx
      .select({
        employeId: sirhEquipeMembres.employeId,
        dateDebut: sirhEquipeMembres.dateDebut,
        dateFin: sirhEquipeMembres.dateFin,
        equipeId: sirhEquipes.id,
        nom: sirhEquipes.nom,
        couleur: sirhEquipes.couleur,
      })
      .from(sirhEquipeMembres)
      .innerJoin(sirhEquipes, eq(sirhEquipes.id, sirhEquipeMembres.equipeId))
      .where(and(isNull(sirhEquipeMembres.deletedAt), isNull(sirhEquipes.deletedAt)))
      .orderBy(asc(sirhEquipes.nom));
    const equipesParEmploye = new Map<string, CollaborateurLigne['equipes']>();
    for (const m of membres) {
      if (!membreActif(m, today)) continue;
      const liste = equipesParEmploye.get(m.employeId) ?? [];
      if (!liste.some((e) => e.id === m.equipeId)) {
        liste.push({ id: m.equipeId, nom: m.nom, couleur: m.couleur });
      }
      equipesParEmploye.set(m.employeId, liste);
    }

    return rows.map((r) => {
      const contratsEmploye = contrats.get(r.id) ?? [];
      const enCours = contratEnCours(contratsEmploye, today);
      return {
        ...syntheseCollaborateur(r, contratsEmploye, today),
        id: r.id,
        nom: r.nom,
        prenom: r.prenom,
        matricule: r.matricule,
        actif: r.actif,
        posteIntitule: r.posteIntitule ?? enCours?.intitulePoste ?? r.qualification,
        siteNom: r.siteNom,
        managerNom: r.managerNom ? nomComplet(r.managerPrenom, r.managerNom) : null,
        contrat: enCours
          ? {
              id: enCours.id,
              typeContrat: enCours.typeContrat,
              dateDebut: enCours.dateDebut,
              dateFin: enCours.dateFin,
            }
          : null,
        equipes: equipesParEmploye.get(r.id) ?? [],
        dateAnciennete: dateAncienneteEffective(
          {
            dateAnciennete: r.dateAnciennete,
            dateEmbauche: r.dateEmbauche,
            dateEntree: r.dateEntree,
          },
          contratsEmploye,
        ),
      };
    });
  });
}

/**
 * Indicateurs RH (tableau de bord) : effectif actif, arrivées à venir,
 * répartition par famille de contrat, arrivées / départs sur 30 jours, fins de
 * contrat dans les 60 jours.
 */
export async function kpiCollaborateurs(): Promise<KpiCollaborateurs> {
  const ctx = await exigerContexteSirhAction(ROLES_SIRH_LECTURE);
  const today = aujourdhuiIso();
  return withTenant(ctx.entreprise.id, async (tx) => {
    const emps = await tx
      .select({
        id: employes.id,
        actif: employes.actif,
        dateEntree: employes.dateEntree,
        dateEmbauche: employes.dateEmbauche,
        dateSortie: employes.dateSortie,
      })
      .from(employes)
      .where(isNull(employes.deletedAt));
    const contrats = await chargerContratsParEmploye(tx);
    return calculerKpiCollaborateurs(
      emps.map((e) => syntheseCollaborateur(e, contrats.get(e.id) ?? [], today)),
      today,
    );
  });
}

// ─────────────────────────────────────────────────────────────
// Alertes contrats (tableau de bord)
// ─────────────────────────────────────────────────────────────

export type AlerteContratCollaborateur = AlerteContratIdentifiee & {
  employeId: string;
  /** « Prénom Nom ». */
  employeNom: string;
};

/**
 * Alertes contractuelles de tous les collaborateurs : fins de période d'essai
 * (≤ 15 j), fins de contrat sans décision (≤ 30 j), contrats échus sans motif.
 * Triées : critiques d'abord, puis par date.
 */
export async function listerAlertesContrats(): Promise<AlerteContratCollaborateur[]> {
  const ctx = await exigerContexteSirhAction(ROLES_SIRH_LECTURE);
  const today = aujourdhuiIso();
  return withTenant(ctx.entreprise.id, async (tx) => {
    const emps = await tx
      .select({ id: employes.id, nom: employes.nom, prenom: employes.prenom })
      .from(employes)
      .where(isNull(employes.deletedAt));
    const contrats = await chargerContratsParEmploye(tx);
    return emps
      .flatMap((e) =>
        alertesContrats(contrats.get(e.id) ?? [], today).map((a) => ({
          ...a,
          employeId: e.id,
          employeNom: nomComplet(e.prenom, e.nom),
        })),
      )
      .sort(comparerAlertes);
  });
}

// ─────────────────────────────────────────────────────────────
// Dossier collaborateur
// ─────────────────────────────────────────────────────────────

/** Extension SIRH de l'employé (sirh_collaborateurs) avec libellés résolus. */
export type AffectationCollaborateur = {
  id: string;
  posteId: string | null;
  posteIntitule: string | null;
  siteId: string | null;
  siteNom: string | null;
  managerId: string | null;
  managerNom: string | null;
  horaireId: string | null;
  horaireNom: string | null;
  societeId: string | null;
  societeLibelle: string | null;
  emailProfessionnel: string | null;
  telephoneProfessionnel: string | null;
  dateAnciennete: IsoDate | null;
  notes: string | null;
};

/** En-tête et affectation du dossier collaborateur (sérialisable, sans donnée sensible). */
export type DossierCollaborateur = {
  employeId: string;
  nom: string;
  prenom: string;
  matricule: string | null;
  actif: boolean;
  dateEntree: IsoDate | null;
  dateEmbauche: IsoDate | null;
  dateSortie: IsoDate | null;
  statut: StatutCollaborateur;
  utilisateurId: string | null;
  utilisateurEmail: string | null;
  affectation: AffectationCollaborateur | null;
  /** Poste affiché : affectation, sinon contrat en cours, sinon qualification RH. */
  posteLibelle: string | null;
  siteLibelle: string | null;
  /** Date d'ancienneté effective (reprise SIRH, sinon embauche / entrée / 1er contrat). */
  dateAnciennete: IsoDate | null;
  contratEnCours: ContratEnCoursResume | null;
};

/**
 * Dossier d'un collaborateur (null si introuvable, hors tenant ou non autorisé).
 * Accessible avec le droit de lecture SIRH, ou pour sa propre fiche.
 */
export async function lireDossierCollaborateur(
  employeId: string,
): Promise<DossierCollaborateur | null> {
  const ctx = await exigerContexteSirhAction(ROLES_SIRH_LIBRE_SERVICE);
  if (!estUuid(employeId)) return null;
  const today = aujourdhuiIso();

  return withTenant(ctx.entreprise.id, async (tx) => {
    if (!(await peutConsulterEmploye(tx, ctx, employeId))) return null;

    const [e] = await tx
      .select({
        id: employes.id,
        nom: employes.nom,
        prenom: employes.prenom,
        matricule: employes.matricule,
        actif: employes.actif,
        dateEntree: employes.dateEntree,
        dateEmbauche: employes.dateEmbauche,
        dateSortie: employes.dateSortie,
        qualification: employes.qualification,
        utilisateurId: employes.utilisateurId,
      })
      .from(employes)
      .where(and(eq(employes.id, employeId), isNull(employes.deletedAt)))
      .limit(1);
    if (!e) return null;

    const manager = alias(employes, 'manager');
    const [a] = await tx
      .select({
        id: sirhCollaborateurs.id,
        posteId: sirhCollaborateurs.posteId,
        posteIntitule: sirhPostes.intitule,
        siteId: sirhCollaborateurs.siteId,
        siteNom: sirhSites.nom,
        managerId: sirhCollaborateurs.managerId,
        managerNom: manager.nom,
        managerPrenom: manager.prenom,
        horaireId: sirhCollaborateurs.horaireId,
        horaireNom: sirhHoraires.nom,
        societeId: sirhCollaborateurs.societeId,
        societeCode: societes.code,
        societeRaison: raisonsSociales.raisonSociale,
        emailProfessionnel: sirhCollaborateurs.emailProfessionnel,
        telephoneProfessionnel: sirhCollaborateurs.telephoneProfessionnel,
        dateAnciennete: sirhCollaborateurs.dateAnciennete,
        notes: sirhCollaborateurs.notes,
      })
      .from(sirhCollaborateurs)
      .leftJoin(sirhPostes, eq(sirhPostes.id, sirhCollaborateurs.posteId))
      .leftJoin(sirhSites, eq(sirhSites.id, sirhCollaborateurs.siteId))
      .leftJoin(manager, eq(manager.id, sirhCollaborateurs.managerId))
      .leftJoin(sirhHoraires, eq(sirhHoraires.id, sirhCollaborateurs.horaireId))
      .leftJoin(societes, eq(societes.id, sirhCollaborateurs.societeId))
      .leftJoin(raisonsSociales, eq(raisonsSociales.id, societes.raisonSocialeId))
      .where(and(eq(sirhCollaborateurs.employeId, employeId), isNull(sirhCollaborateurs.deletedAt)))
      .limit(1);

    let utilisateurEmail: string | null = null;
    if (e.utilisateurId) {
      const [compte] = await tx
        .select({ email: utilisateurs.email })
        .from(utilisateurs)
        .where(eq(utilisateurs.id, e.utilisateurId))
        .limit(1);
      utilisateurEmail = compte?.email ?? null;
    }

    const contrats = (await chargerContratsParEmploye(tx, employeId)).get(employeId) ?? [];
    const enCours = contratEnCours(contrats, today);
    const synthese = syntheseCollaborateur(e, contrats, today);

    const affectation: AffectationCollaborateur | null = a
      ? {
          id: a.id,
          posteId: a.posteId,
          posteIntitule: a.posteIntitule,
          siteId: a.siteId,
          siteNom: a.siteNom,
          managerId: a.managerId,
          managerNom: a.managerNom ? nomComplet(a.managerPrenom, a.managerNom) : null,
          horaireId: a.horaireId,
          horaireNom: a.horaireNom,
          societeId: a.societeId,
          societeLibelle: libelleSociete(a.societeRaison, a.societeCode),
          emailProfessionnel: a.emailProfessionnel,
          telephoneProfessionnel: a.telephoneProfessionnel,
          dateAnciennete: a.dateAnciennete,
          notes: a.notes,
        }
      : null;

    return {
      employeId: e.id,
      nom: e.nom,
      prenom: e.prenom,
      matricule: e.matricule,
      actif: e.actif,
      dateEntree: synthese.dateEntree,
      dateEmbauche: e.dateEmbauche,
      dateSortie: e.dateSortie,
      statut: synthese.statut,
      utilisateurId: e.utilisateurId,
      utilisateurEmail,
      affectation,
      posteLibelle: affectation?.posteIntitule ?? enCours?.intitulePoste ?? e.qualification,
      siteLibelle: affectation?.siteNom ?? null,
      dateAnciennete: dateAncienneteEffective(
        {
          dateAnciennete: affectation?.dateAnciennete ?? null,
          dateEmbauche: e.dateEmbauche,
          dateEntree: e.dateEntree,
        },
        contrats,
      ),
      contratEnCours: enCours
        ? {
            id: enCours.id,
            typeContrat: enCours.typeContrat,
            dateDebut: enCours.dateDebut,
            dateFin: enCours.dateFin,
          }
        : null,
    };
  });
}

/** Version de contrat du dossier (sérialisable). */
export type ContratCollaborateur = {
  id: string;
  employeId: string;
  typeContrat: TypeContratSirh;
  motifRecours: string | null;
  dateDebut: IsoDate;
  dateFin: IsoDate | null;
  dateFinPeriodeEssai: IsoDate | null;
  motifFin: MotifFinContrat | null;
  posteId: string | null;
  /** Intitulé actuel du poste au catalogue. */
  posteIntitule: string | null;
  /** Intitulé figé à la signature. */
  intitulePoste: string | null;
  categorie: CategorieProfessionnelle | null;
  niveau: string | null;
  coefficient: string | null;
  tempsTravail: TempsTravail;
  heuresHebdo: string | null;
  joursForfait: number | null;
  conventionCollective: string | null;
  societeId: string | null;
  societeLibelle: string | null;
  siteId: string | null;
  siteNom: string | null;
  notes: string | null;
  /** Rémunération — `null` sans le droit PAIE (jamais lue ni envoyée au client). */
  salaireBrutMensuel: string | null;
  tauxHoraireBrut: string | null;
};

/**
 * Historique des versions de contrat d'un collaborateur, de la plus récente à la
 * plus ancienne. Accès : lecture SIRH ou sa propre fiche ; salaires uniquement
 * avec le droit PAIE (`peutVoirPaieSirh`).
 */
export async function listerContratsEmploye(employeId: string): Promise<ContratCollaborateur[]> {
  const ctx = await exigerContexteSirhAction(ROLES_SIRH_LIBRE_SERVICE);
  if (!estUuid(employeId)) return [];
  const avecRemuneration = peutVoirPaieSirh(ctx.utilisateur.role);

  return withTenant(ctx.entreprise.id, async (tx) => {
    if (!(await peutConsulterEmploye(tx, ctx, employeId))) return [];

    const rows = await tx
      .select({
        id: sirhContrats.id,
        employeId: sirhContrats.employeId,
        typeContrat: sirhContrats.typeContrat,
        motifRecours: sirhContrats.motifRecours,
        dateDebut: sirhContrats.dateDebut,
        dateFin: sirhContrats.dateFin,
        dateFinPeriodeEssai: sirhContrats.dateFinPeriodeEssai,
        motifFin: sirhContrats.motifFin,
        posteId: sirhContrats.posteId,
        posteIntitule: sirhPostes.intitule,
        intitulePoste: sirhContrats.intitulePoste,
        categorie: sirhContrats.categorie,
        niveau: sirhContrats.niveau,
        coefficient: sirhContrats.coefficient,
        tempsTravail: sirhContrats.tempsTravail,
        heuresHebdo: sirhContrats.heuresHebdo,
        joursForfait: sirhContrats.joursForfait,
        conventionCollective: sirhContrats.conventionCollective,
        societeId: sirhContrats.societeId,
        societeCode: societes.code,
        societeRaison: raisonsSociales.raisonSociale,
        siteId: sirhContrats.siteId,
        siteNom: sirhSites.nom,
        notes: sirhContrats.notes,
      })
      .from(sirhContrats)
      .leftJoin(sirhPostes, eq(sirhPostes.id, sirhContrats.posteId))
      .leftJoin(societes, eq(societes.id, sirhContrats.societeId))
      .leftJoin(raisonsSociales, eq(raisonsSociales.id, societes.raisonSocialeId))
      .leftJoin(sirhSites, eq(sirhSites.id, sirhContrats.siteId))
      .where(and(eq(sirhContrats.employeId, employeId), isNull(sirhContrats.deletedAt)))
      .orderBy(desc(sirhContrats.dateDebut));

    // Colonnes chiffrées lues séparément, et seulement avec le droit PAIE.
    const remunerations = new Map<string, { salaire: string | null; taux: string | null }>();
    if (avecRemuneration && rows.length > 0) {
      const salaires = await tx
        .select({
          id: sirhContrats.id,
          salaireBrutMensuel: sirhContrats.salaireBrutMensuel,
          tauxHoraireBrut: sirhContrats.tauxHoraireBrut,
        })
        .from(sirhContrats)
        .where(and(eq(sirhContrats.employeId, employeId), isNull(sirhContrats.deletedAt)));
      for (const s of salaires) {
        remunerations.set(s.id, { salaire: s.salaireBrutMensuel, taux: s.tauxHoraireBrut });
      }
    }

    return rows.map(({ societeCode, societeRaison, ...r }) => ({
      ...r,
      societeLibelle: libelleSociete(societeRaison, societeCode),
      salaireBrutMensuel: remunerations.get(r.id)?.salaire ?? null,
      tauxHoraireBrut: remunerations.get(r.id)?.taux ?? null,
    }));
  });
}

/** Appartenance d'un collaborateur à une équipe (historique compris). */
export type EquipeCollaborateur = {
  membreId: string;
  equipeId: string;
  nom: string;
  couleur: string;
  equipeActive: boolean;
  siteNom: string | null;
  estResponsable: boolean;
  dateDebut: IsoDate | null;
  dateFin: IsoDate | null;
};

/** Équipes du collaborateur (lecture SIRH ou sa propre fiche). */
export async function listerEquipesEmploye(employeId: string): Promise<EquipeCollaborateur[]> {
  const ctx = await exigerContexteSirhAction(ROLES_SIRH_LIBRE_SERVICE);
  if (!estUuid(employeId)) return [];
  return withTenant(ctx.entreprise.id, async (tx) => {
    if (!(await peutConsulterEmploye(tx, ctx, employeId))) return [];
    return tx
      .select({
        membreId: sirhEquipeMembres.id,
        equipeId: sirhEquipes.id,
        nom: sirhEquipes.nom,
        couleur: sirhEquipes.couleur,
        equipeActive: sirhEquipes.actif,
        siteNom: sirhSites.nom,
        estResponsable: sirhEquipeMembres.estResponsable,
        dateDebut: sirhEquipeMembres.dateDebut,
        dateFin: sirhEquipeMembres.dateFin,
      })
      .from(sirhEquipeMembres)
      .innerJoin(sirhEquipes, eq(sirhEquipes.id, sirhEquipeMembres.equipeId))
      .leftJoin(sirhSites, eq(sirhSites.id, sirhEquipes.siteId))
      .where(
        and(
          eq(sirhEquipeMembres.employeId, employeId),
          isNull(sirhEquipeMembres.deletedAt),
          isNull(sirhEquipes.deletedAt),
        ),
      )
      .orderBy(asc(sirhEquipes.nom));
  });
}

// ─────────────────────────────────────────────────────────────
// Registre unique du personnel
// ─────────────────────────────────────────────────────────────

/**
 * Registre unique du personnel (art. L1221-13 / D1221-23 C. trav.) : tous les
 * salariés non supprimés (sortis compris), ordre chronologique des entrées.
 */
export async function listerRegistrePersonnel(): Promise<LigneRegistreNumerotee[]> {
  const ctx = await exigerContexteSirhAction(ROLES_SIRH_PAIE);
  const today = aujourdhuiIso();
  return withTenant(ctx.entreprise.id, async (tx) => {
    const emps = await tx
      .select({
        id: employes.id,
        nom: employes.nom,
        prenom: employes.prenom,
        nationalite: employes.nationalite,
        dateNaissance: employes.dateNaissance,
        sexe: employes.sexe,
        qualification: employes.qualification,
        classification: employes.classification,
        typeContrat: employes.typeContrat,
        societeInterim: employes.societeInterim,
        heuresHebdoContractuelles: employes.heuresHebdoContractuelles,
        dateEntree: employes.dateEntree,
        dateEmbauche: employes.dateEmbauche,
        dateSortie: employes.dateSortie,
      })
      .from(employes)
      .where(isNull(employes.deletedAt));

    const rows = await tx
      .select({
        id: sirhContrats.id,
        employeId: sirhContrats.employeId,
        typeContrat: sirhContrats.typeContrat,
        dateDebut: sirhContrats.dateDebut,
        dateFin: sirhContrats.dateFin,
        dateFinPeriodeEssai: sirhContrats.dateFinPeriodeEssai,
        motifFin: sirhContrats.motifFin,
        intitulePoste: sirhContrats.intitulePoste,
        posteIntitule: sirhPostes.intitule,
        categorie: sirhContrats.categorie,
        niveau: sirhContrats.niveau,
        coefficient: sirhContrats.coefficient,
        tempsTravail: sirhContrats.tempsTravail,
      })
      .from(sirhContrats)
      .leftJoin(sirhPostes, eq(sirhPostes.id, sirhContrats.posteId))
      .where(isNull(sirhContrats.deletedAt));
    const contrats = new Map<string, ContratRegistre[]>();
    for (const { employeId, ...c } of rows) {
      const liste = contrats.get(employeId) ?? [];
      liste.push(c);
      contrats.set(employeId, liste);
    }

    return numeroterRegistre(
      emps.map((e) => construireLigneRegistre(e, contrats.get(e.id) ?? [], today)),
    );
  });
}

// ─────────────────────────────────────────────────────────────
// Aides à la saisie (gestion)
// ─────────────────────────────────────────────────────────────

/**
 * Champs contractuels de la fiche RH, pour pré-remplir une nouvelle version
 * (rémunération `null` sans le droit PAIE).
 */
export type PrefillContratFicheRh = PrefillFicheRh;

/** Lecture des champs « contrat » de la fiche RH (`employes`) d'un collaborateur. */
export async function lirePrefillContratDepuisFicheRh(
  employeId: string,
): Promise<PrefillContratFicheRh | null> {
  const ctx = await exigerContexteSirhAction(ROLES_SIRH_GESTION);
  if (!estUuid(employeId)) return null;
  const avecRemuneration = peutVoirPaieSirh(ctx.utilisateur.role);

  return withTenant(ctx.entreprise.id, async (tx) => {
    const [e] = await tx
      .select({
        typeContrat: employes.typeContrat,
        dateEmbauche: employes.dateEmbauche,
        dateEntree: employes.dateEntree,
        dateFinContrat: employes.dateFinContrat,
        qualification: employes.qualification,
        classification: employes.classification,
        coefficientHierarchique: employes.coefficientHierarchique,
        heuresHebdoContractuelles: employes.heuresHebdoContractuelles,
        conventionCollective: employes.conventionCollective,
      })
      .from(employes)
      .where(and(eq(employes.id, employeId), isNull(employes.deletedAt)))
      .limit(1);
    if (!e) return null;

    let salaireBrutMensuel: string | null = null;
    let tauxHoraireBrut: string | null = null;
    if (avecRemuneration) {
      const [r] = await tx
        .select({
          salaireMensuelBrut: employes.salaireMensuelBrut,
          tauxHoraireBrut: employes.tauxHoraireBrut,
        })
        .from(employes)
        .where(eq(employes.id, employeId))
        .limit(1);
      salaireBrutMensuel = r?.salaireMensuelBrut ?? null;
      tauxHoraireBrut = r?.tauxHoraireBrut ?? null;
    }

    return {
      typeContrat: typeContratDepuisFicheRh(e.typeContrat) ?? 'cdi',
      dateDebut: e.dateEmbauche ?? e.dateEntree,
      dateFin: e.dateFinContrat,
      intitulePoste: e.qualification,
      categorie: e.classification,
      coefficient: e.coefficientHierarchique,
      heuresHebdo: e.heuresHebdoContractuelles,
      conventionCollective: e.conventionCollective,
      salaireBrutMensuel,
      tauxHoraireBrut,
    };
  });
}

/** Compte utilisateur rattaché à un employé du tenant. */
export type CompteRattache = { utilisateurId: string; employeId: string; employeNom: string };

/** Rattachements compte ↔ employé existants (pour signaler les comptes déjà pris). */
export async function listerComptesRattaches(): Promise<CompteRattache[]> {
  const ctx = await exigerContexteSirhAction(ROLES_SIRH_GESTION);
  const rows = await withTenant(ctx.entreprise.id, (tx) =>
    tx
      .select({
        utilisateurId: employes.utilisateurId,
        employeId: employes.id,
        nom: employes.nom,
        prenom: employes.prenom,
      })
      .from(employes)
      .where(and(isNull(employes.deletedAt), isNotNull(employes.utilisateurId))),
  );
  return rows.flatMap((r) =>
    r.utilisateurId
      ? [
          {
            utilisateurId: r.utilisateurId,
            employeId: r.employeId,
            employeNom: nomComplet(r.prenom, r.nom),
          },
        ]
      : [],
  );
}
