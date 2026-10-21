import 'server-only';

import {
  and,
  asc,
  count,
  desc,
  eq,
  gte,
  inArray,
  isNull,
  lt,
  lte,
  ne,
  or,
  type SQL,
} from 'drizzle-orm';

import { withTenant, type TenantTx } from '@/lib/db/with-tenant';
import { employes } from '@/db/schema/employes';
import {
  sirhEquipeMembres,
  sirhFormations,
  sirhInscriptionsFormation,
  sirhSessionsFormation,
} from '@/db/schema/test-sirh';
import type {
  CategorieFormation,
  ModaliteFormation,
  ResultatFormation,
  StatutInscription,
  StatutSession,
} from '@/lib/validation/test-sirh/enums';

import { ajouterJours, aujourdhuiIso } from '../calendrier';
import { exigerContexteSirhAction } from '../contexte';
import { peutConsulterEmploye } from '../entretiens/droits';
import { nomComplet } from '../format';
import { ROLES_SIRH_LECTURE } from '../permissions';
import {
  agregerFormationAnnee,
  compterOccupants,
  coutSession,
  dernieresQualifications,
  joursAvantExpiration,
  placesRestantes,
  SEUIL_RECYCLAGE_JOURS,
  statutQualification,
  STATUTS_SESSION_A_VENIR,
  type StatutQualification,
} from './validite';

/**
 * Lectures — Test SIRH › Formation. Fonctions `server-only` appelées depuis
 * les Server Components ; données sérialisables. Les employés ne sont lus que
 * par colonnes explicites (jamais NIR / IBAN).
 */

const REGEX_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function estUuid(v: string | null | undefined): v is string {
  return typeof v === 'string' && REGEX_UUID.test(v);
}

// ─────────────────────────────────────────────────────────────
// Catalogue
// ─────────────────────────────────────────────────────────────

export type FormationLigne = {
  id: string;
  code: string | null;
  intitule: string;
  categorie: CategorieFormation;
  organisme: string | null;
  modalite: ModaliteFormation;
  dureeHeures: string | null;
  coutHt: string | null;
  obligatoire: boolean;
  validiteMois: number | null;
  description: string | null;
  actif: boolean;
  nbSessions: number;
};

/** Catalogue complet (actives et inactives) avec le nombre de sessions. */
export async function listerFormations(): Promise<FormationLigne[]> {
  const ctx = await exigerContexteSirhAction(ROLES_SIRH_LECTURE);
  return withTenant(ctx.entreprise.id, async (tx) => {
    const formations = await tx
      .select({
        id: sirhFormations.id,
        code: sirhFormations.code,
        intitule: sirhFormations.intitule,
        categorie: sirhFormations.categorie,
        organisme: sirhFormations.organisme,
        modalite: sirhFormations.modalite,
        dureeHeures: sirhFormations.dureeHeures,
        coutHt: sirhFormations.coutHt,
        obligatoire: sirhFormations.obligatoire,
        validiteMois: sirhFormations.validiteMois,
        description: sirhFormations.description,
        actif: sirhFormations.actif,
      })
      .from(sirhFormations)
      .where(isNull(sirhFormations.deletedAt))
      .orderBy(asc(sirhFormations.intitule));
    const sessions = await tx
      .select({ formationId: sirhSessionsFormation.formationId, n: count() })
      .from(sirhSessionsFormation)
      .where(isNull(sirhSessionsFormation.deletedAt))
      .groupBy(sirhSessionsFormation.formationId);
    const parFormation = new Map(sessions.map((s) => [s.formationId, s.n]));
    return formations.map((f) => ({ ...f, nbSessions: parFormation.get(f.id) ?? 0 }));
  });
}

export type FormationOption = {
  id: string;
  label: string;
  actif: boolean;
  validiteMois: number | null;
};

/** Formations pour les sélecteurs (actives d'abord). */
export async function listerFormationsOptions(): Promise<FormationOption[]> {
  const ctx = await exigerContexteSirhAction(ROLES_SIRH_LECTURE);
  const rows = await withTenant(ctx.entreprise.id, (tx) =>
    tx
      .select({
        id: sirhFormations.id,
        code: sirhFormations.code,
        intitule: sirhFormations.intitule,
        actif: sirhFormations.actif,
        validiteMois: sirhFormations.validiteMois,
      })
      .from(sirhFormations)
      .where(isNull(sirhFormations.deletedAt))
      .orderBy(desc(sirhFormations.actif), asc(sirhFormations.intitule)),
  );
  return rows.map((r) => ({
    id: r.id,
    label: r.code ? `${r.intitule} (${r.code})` : r.intitule,
    actif: r.actif,
    validiteMois: r.validiteMois,
  }));
}

// ─────────────────────────────────────────────────────────────
// Sessions
// ─────────────────────────────────────────────────────────────

export type SessionLigne = {
  id: string;
  formationId: string;
  formationIntitule: string;
  formationCode: string | null;
  dateDebut: string;
  dateFin: string;
  lieu: string | null;
  formateur: string | null;
  placesMax: number | null;
  coutHt: string | null;
  statut: StatutSession;
  notes: string | null;
  /** Inscriptions non annulées (occupant une place). */
  nbInscrits: number;
  nbPresents: number;
  placesRestantes: number | null;
  /** Coût HT retenu (saisi, sinon catalogue × participants). */
  coutEstime: number;
};

export type FiltreSessions = 'a_venir' | 'passees' | 'annulees' | 'toutes';

export const FILTRES_SESSIONS: readonly FiltreSessions[] = [
  'a_venir',
  'passees',
  'annulees',
  'toutes',
];

type InscriptionCompteur = {
  sessionId: string;
  statut: StatutInscription;
  heuresRealisees: string | null;
};

async function selectionnerSessions(tx: TenantTx, conditions: SQL[]) {
  const sessions = await tx
    .select({
      id: sirhSessionsFormation.id,
      formationId: sirhSessionsFormation.formationId,
      formationIntitule: sirhFormations.intitule,
      formationCode: sirhFormations.code,
      formationCoutHt: sirhFormations.coutHt,
      formationDureeHeures: sirhFormations.dureeHeures,
      formationValiditeMois: sirhFormations.validiteMois,
      dateDebut: sirhSessionsFormation.dateDebut,
      dateFin: sirhSessionsFormation.dateFin,
      lieu: sirhSessionsFormation.lieu,
      formateur: sirhSessionsFormation.formateur,
      placesMax: sirhSessionsFormation.placesMax,
      coutHt: sirhSessionsFormation.coutHt,
      statut: sirhSessionsFormation.statut,
      notes: sirhSessionsFormation.notes,
    })
    .from(sirhSessionsFormation)
    .innerJoin(sirhFormations, eq(sirhFormations.id, sirhSessionsFormation.formationId))
    .where(and(isNull(sirhSessionsFormation.deletedAt), ...conditions))
    .orderBy(desc(sirhSessionsFormation.dateDebut));

  const ids = sessions.map((s) => s.id);
  const inscriptions: InscriptionCompteur[] =
    ids.length === 0
      ? []
      : await tx
          .select({
            sessionId: sirhInscriptionsFormation.sessionId,
            statut: sirhInscriptionsFormation.statut,
            heuresRealisees: sirhInscriptionsFormation.heuresRealisees,
          })
          .from(sirhInscriptionsFormation)
          .where(
            and(
              isNull(sirhInscriptionsFormation.deletedAt),
              inArray(sirhInscriptionsFormation.sessionId, ids),
            ),
          );
  const parSession = new Map<string, InscriptionCompteur[]>();
  for (const i of inscriptions) {
    const liste = parSession.get(i.sessionId) ?? [];
    liste.push(i);
    parSession.set(i.sessionId, liste);
  }

  return sessions.map((s) => {
    const liste = parSession.get(s.id) ?? [];
    const occupants = compterOccupants(liste.map((i) => i.statut));
    return {
      ...s,
      inscriptions: liste,
      nbInscrits: occupants,
      nbPresents: liste.filter((i) => i.statut === 'present').length,
      placesRestantes: placesRestantes(s.placesMax, occupants),
      coutEstime: coutSession({ ...s, inscriptions: liste }),
    };
  });
}

function versLigneSession(
  s: Awaited<ReturnType<typeof selectionnerSessions>>[number],
): SessionLigne {
  return {
    id: s.id,
    formationId: s.formationId,
    formationIntitule: s.formationIntitule,
    formationCode: s.formationCode,
    dateDebut: s.dateDebut,
    dateFin: s.dateFin,
    lieu: s.lieu,
    formateur: s.formateur,
    placesMax: s.placesMax,
    coutHt: s.coutHt,
    statut: s.statut,
    notes: s.notes,
    nbInscrits: s.nbInscrits,
    nbPresents: s.nbPresents,
    placesRestantes: s.placesRestantes,
    coutEstime: s.coutEstime,
  };
}

/**
 * Sessions filtrées : à venir (planifiées / confirmées non terminées), passées
 * (terminées, hors annulées), annulées, ou toutes (plus récentes d'abord ; à
 * venir : la plus proche d'abord).
 */
export async function listerSessions(filtre: FiltreSessions = 'toutes'): Promise<SessionLigne[]> {
  const ctx = await exigerContexteSirhAction(ROLES_SIRH_LECTURE);
  const today = aujourdhuiIso();
  const conditions: SQL[] = [];
  if (filtre === 'a_venir') {
    conditions.push(
      inArray(sirhSessionsFormation.statut, [...STATUTS_SESSION_A_VENIR]),
      gte(sirhSessionsFormation.dateFin, today),
    );
  } else if (filtre === 'passees') {
    conditions.push(
      lt(sirhSessionsFormation.dateFin, today),
      ne(sirhSessionsFormation.statut, 'annulee'),
    );
  } else if (filtre === 'annulees') {
    conditions.push(eq(sirhSessionsFormation.statut, 'annulee'));
  }
  const sessions = await withTenant(ctx.entreprise.id, (tx) =>
    selectionnerSessions(tx, conditions),
  );
  const lignes = sessions.map(versLigneSession);
  return filtre === 'a_venir' ? lignes.reverse() : lignes;
}

export type InscriptionLigne = {
  id: string;
  employeId: string;
  /** « Prénom Nom ». */
  employeNom: string;
  employeTri: string;
  matricule: string | null;
  statut: StatutInscription;
  resultat: ResultatFormation;
  heuresRealisees: string | null;
  dateValidite: string | null;
  commentaire: string | null;
};

export type SessionDetail = SessionLigne & {
  formationValiditeMois: number | null;
  formationDureeHeures: string | null;
  formationCoutHt: string | null;
  inscriptions: InscriptionLigne[];
};

/** Une session avec ses inscriptions (null si absente ou supprimée). */
export async function lireSession(id: string): Promise<SessionDetail | null> {
  const ctx = await exigerContexteSirhAction(ROLES_SIRH_LECTURE);
  if (!estUuid(id)) return null;
  return withTenant(ctx.entreprise.id, async (tx) => {
    const [session] = await selectionnerSessions(tx, [eq(sirhSessionsFormation.id, id)]);
    if (!session) return null;
    const inscriptions = await tx
      .select({
        id: sirhInscriptionsFormation.id,
        employeId: sirhInscriptionsFormation.employeId,
        nom: employes.nom,
        prenom: employes.prenom,
        matricule: employes.matricule,
        statut: sirhInscriptionsFormation.statut,
        resultat: sirhInscriptionsFormation.resultat,
        heuresRealisees: sirhInscriptionsFormation.heuresRealisees,
        dateValidite: sirhInscriptionsFormation.dateValidite,
        commentaire: sirhInscriptionsFormation.commentaire,
      })
      .from(sirhInscriptionsFormation)
      .innerJoin(employes, eq(employes.id, sirhInscriptionsFormation.employeId))
      .where(
        and(
          eq(sirhInscriptionsFormation.sessionId, id),
          isNull(sirhInscriptionsFormation.deletedAt),
        ),
      )
      .orderBy(asc(employes.nom), asc(employes.prenom));
    return {
      ...versLigneSession(session),
      formationValiditeMois: session.formationValiditeMois,
      formationDureeHeures: session.formationDureeHeures,
      formationCoutHt: session.formationCoutHt,
      inscriptions: inscriptions.map(({ nom, prenom, ...i }) => ({
        ...i,
        employeNom: nomComplet(prenom, nom),
        employeTri: `${nom} ${prenom}`.toLowerCase(),
      })),
    };
  });
}

export type SessionAVenirOption = {
  id: string;
  formationId: string;
  label: string;
  dateDebut: string;
  dateFin: string;
  lieu: string | null;
  placesRestantes: number | null;
};

/** Sessions à venir (planifiées / confirmées non terminées), la plus proche d'abord. */
export async function listerSessionsAVenirOptions(): Promise<SessionAVenirOption[]> {
  const sessions = await listerSessions('a_venir');
  return sessions.map((s) => ({
    id: s.id,
    formationId: s.formationId,
    label: s.formationIntitule,
    dateDebut: s.dateDebut,
    dateFin: s.dateFin,
    lieu: s.lieu,
    placesRestantes: s.placesRestantes,
  }));
}

// ─────────────────────────────────────────────────────────────
// Habilitations & recyclages
// ─────────────────────────────────────────────────────────────

export type QualificationLigne = {
  inscriptionId: string;
  sessionId: string;
  employeId: string;
  /** « Prénom Nom ». */
  employeNom: string;
  employeTri: string;
  matricule: string | null;
  formationId: string;
  formationIntitule: string;
  formationCode: string | null;
  categorie: CategorieFormation;
  /** Date de fin de la session réussie. */
  dateObtention: string;
  dateValidite: string | null;
  statut: StatutQualification;
  joursRestants: number | null;
  /** Inscription à une session à venir de la même formation (recyclage déjà programmé). */
  recyclagePlanifie: { sessionId: string; dateDebut: string } | null;
  /** Équipes actuelles du salarié (filtre). */
  equipeIds: string[];
};

/** Dernière inscription réussie par (employé actif, formation), avec statut de validité. */
async function calculerQualifications(tx: TenantTx, today: string): Promise<QualificationLigne[]> {
  const reussies = await tx
    .select({
      inscriptionId: sirhInscriptionsFormation.id,
      sessionId: sirhSessionsFormation.id,
      employeId: sirhInscriptionsFormation.employeId,
      nom: employes.nom,
      prenom: employes.prenom,
      matricule: employes.matricule,
      formationId: sirhFormations.id,
      formationIntitule: sirhFormations.intitule,
      formationCode: sirhFormations.code,
      categorie: sirhFormations.categorie,
      dateFinSession: sirhSessionsFormation.dateFin,
      dateValidite: sirhInscriptionsFormation.dateValidite,
    })
    .from(sirhInscriptionsFormation)
    .innerJoin(
      sirhSessionsFormation,
      and(
        eq(sirhSessionsFormation.id, sirhInscriptionsFormation.sessionId),
        isNull(sirhSessionsFormation.deletedAt),
        ne(sirhSessionsFormation.statut, 'annulee'),
      ),
    )
    .innerJoin(
      sirhFormations,
      and(
        eq(sirhFormations.id, sirhSessionsFormation.formationId),
        isNull(sirhFormations.deletedAt),
      ),
    )
    .innerJoin(
      employes,
      and(
        eq(employes.id, sirhInscriptionsFormation.employeId),
        isNull(employes.deletedAt),
        eq(employes.actif, true),
      ),
    )
    .where(
      and(
        isNull(sirhInscriptionsFormation.deletedAt),
        eq(sirhInscriptionsFormation.resultat, 'reussi'),
      ),
    );

  const aVenir = await tx
    .select({
      employeId: sirhInscriptionsFormation.employeId,
      formationId: sirhSessionsFormation.formationId,
      sessionId: sirhSessionsFormation.id,
      dateDebut: sirhSessionsFormation.dateDebut,
    })
    .from(sirhInscriptionsFormation)
    .innerJoin(
      sirhSessionsFormation,
      and(
        eq(sirhSessionsFormation.id, sirhInscriptionsFormation.sessionId),
        isNull(sirhSessionsFormation.deletedAt),
      ),
    )
    .where(
      and(
        isNull(sirhInscriptionsFormation.deletedAt),
        eq(sirhInscriptionsFormation.statut, 'inscrit'),
        inArray(sirhSessionsFormation.statut, [...STATUTS_SESSION_A_VENIR]),
        gte(sirhSessionsFormation.dateFin, today),
      ),
    )
    .orderBy(asc(sirhSessionsFormation.dateDebut));
  const planifies = new Map<string, { sessionId: string; dateDebut: string }>();
  for (const a of aVenir) {
    const cle = `${a.employeId}|${a.formationId}`;
    if (!planifies.has(cle)) planifies.set(cle, { sessionId: a.sessionId, dateDebut: a.dateDebut });
  }

  const membres = await tx
    .select({ employeId: sirhEquipeMembres.employeId, equipeId: sirhEquipeMembres.equipeId })
    .from(sirhEquipeMembres)
    .where(
      and(
        isNull(sirhEquipeMembres.deletedAt),
        or(isNull(sirhEquipeMembres.dateFin), gte(sirhEquipeMembres.dateFin, today)),
      ),
    );
  const equipesParEmploye = new Map<string, string[]>();
  for (const m of membres) {
    const liste = equipesParEmploye.get(m.employeId) ?? [];
    liste.push(m.equipeId);
    equipesParEmploye.set(m.employeId, liste);
  }

  return dernieresQualifications(reussies)
    .map(({ nom, prenom, dateFinSession, ...q }) => ({
      ...q,
      employeNom: nomComplet(prenom, nom),
      employeTri: `${nom} ${prenom}`.toLowerCase(),
      dateObtention: dateFinSession,
      statut: statutQualification(q.dateValidite, today),
      joursRestants: joursAvantExpiration(q.dateValidite, today),
      recyclagePlanifie: planifies.get(`${q.employeId}|${q.formationId}`) ?? null,
      equipeIds: equipesParEmploye.get(q.employeId) ?? [],
    }))
    .sort(
      (a, b) =>
        (a.dateValidite ?? '9999-12-31').localeCompare(b.dateValidite ?? '9999-12-31') ||
        a.employeTri.localeCompare(b.employeTri),
    );
}

/** Qualifications en cours de validité ou échues des employés actifs (échéance la plus proche d'abord). */
export async function listerQualifications(): Promise<QualificationLigne[]> {
  const ctx = await exigerContexteSirhAction(ROLES_SIRH_LECTURE);
  const today = aujourdhuiIso();
  return withTenant(ctx.entreprise.id, (tx) => calculerQualifications(tx, today));
}

/**
 * Recyclages à prévoir : qualifications échues ou expirant d'ici `horizonJours`
 * jours, sans inscription déjà programmée à une session à venir.
 */
export async function listerRecyclagesAPrevoir(
  horizonJours: number = SEUIL_RECYCLAGE_JOURS,
): Promise<QualificationLigne[]> {
  const ctx = await exigerContexteSirhAction(ROLES_SIRH_LECTURE);
  const today = aujourdhuiIso();
  const limite = ajouterJours(today, Math.max(0, Math.floor(horizonJours)));
  const qualifications = await withTenant(ctx.entreprise.id, (tx) =>
    calculerQualifications(tx, today),
  );
  return qualifications.filter(
    (q) => q.dateValidite !== null && q.dateValidite <= limite && q.recyclagePlanifie === null,
  );
}

// ─────────────────────────────────────────────────────────────
// Indicateurs
// ─────────────────────────────────────────────────────────────

export type KpiFormation = {
  annee: number;
  /** Heures suivies par les présents des sessions de l'année. */
  heuresAnnee: number;
  /** Coût HT des sessions (non annulées) de l'année. */
  coutAnnee: number;
  sessionsAnnee: number;
  participantsAnnee: number;
  /** Sessions planifiées / confirmées débutant aujourd'hui ou plus tard. */
  sessionsAVenir: number;
  /** Qualifications à recycler sous 90 jours (non encore programmées). */
  recyclagesAPrevoir: number;
  /** Dont qualifications déjà expirées (non encore programmées). */
  qualificationsExpirees: number;
};

/** Indicateurs du domaine (onglet Catalogue, tableau de bord SIRH). */
export async function kpiFormation(): Promise<KpiFormation> {
  const ctx = await exigerContexteSirhAction(ROLES_SIRH_LECTURE);
  const today = aujourdhuiIso();
  const annee = Number(today.slice(0, 4));
  return withTenant(ctx.entreprise.id, async (tx) => {
    const sessions = await selectionnerSessions(tx, [
      gte(sirhSessionsFormation.dateDebut, `${annee}-01-01`),
      lte(sirhSessionsFormation.dateDebut, `${annee}-12-31`),
    ]);
    const agregat = agregerFormationAnnee(sessions, annee);

    const [aVenir] = await tx
      .select({ n: count() })
      .from(sirhSessionsFormation)
      .where(
        and(
          isNull(sirhSessionsFormation.deletedAt),
          inArray(sirhSessionsFormation.statut, [...STATUTS_SESSION_A_VENIR]),
          gte(sirhSessionsFormation.dateDebut, today),
        ),
      );

    const qualifications = await calculerQualifications(tx, today);
    const nonProgrammees = qualifications.filter((q) => q.recyclagePlanifie === null);

    return {
      annee,
      heuresAnnee: agregat.heures,
      coutAnnee: agregat.cout,
      sessionsAnnee: agregat.nbSessions,
      participantsAnnee: agregat.nbParticipants,
      sessionsAVenir: aVenir?.n ?? 0,
      recyclagesAPrevoir: nonProgrammees.filter(
        (q) => q.statut === 'a_recycler' || q.statut === 'expiree',
      ).length,
      qualificationsExpirees: nonProgrammees.filter((q) => q.statut === 'expiree').length,
    };
  });
}

// ─────────────────────────────────────────────────────────────
// Dossier collaborateur / « Mon espace »
// ─────────────────────────────────────────────────────────────

export type FormationEmployeLigne = {
  inscriptionId: string;
  sessionId: string;
  formationId: string;
  formationIntitule: string;
  formationCode: string | null;
  categorie: CategorieFormation;
  dateDebut: string;
  dateFin: string;
  sessionStatut: StatutSession;
  statut: StatutInscription;
  resultat: ResultatFormation;
  heuresRealisees: string | null;
  dateValidite: string | null;
  /** Statut de la qualification (dernière réussite de la formation uniquement). */
  statutQualification: StatutQualification | null;
  /** Réussite antérieure remplacée par une plus récente de la même formation. */
  remplacee: boolean;
};

/**
 * Historique de formation d'un salarié (inscriptions et validités), la plus
 * récente d'abord. Accessible aux rôles de lecture du SIRH et au salarié
 * lui-même ; lève une erreur sinon.
 */
export async function listerFormationsEmploye(employeId: string): Promise<FormationEmployeLigne[]> {
  const ctx = await exigerContexteSirhAction();
  if (!estUuid(employeId)) return [];
  const today = aujourdhuiIso();
  return withTenant(ctx.entreprise.id, async (tx) => {
    if (!(await peutConsulterEmploye(tx, ctx, employeId))) throw new Error('Accès refusé.');
    const rows = await tx
      .select({
        inscriptionId: sirhInscriptionsFormation.id,
        sessionId: sirhSessionsFormation.id,
        formationId: sirhFormations.id,
        formationIntitule: sirhFormations.intitule,
        formationCode: sirhFormations.code,
        categorie: sirhFormations.categorie,
        dateDebut: sirhSessionsFormation.dateDebut,
        dateFin: sirhSessionsFormation.dateFin,
        sessionStatut: sirhSessionsFormation.statut,
        statut: sirhInscriptionsFormation.statut,
        resultat: sirhInscriptionsFormation.resultat,
        heuresRealisees: sirhInscriptionsFormation.heuresRealisees,
        dateValidite: sirhInscriptionsFormation.dateValidite,
      })
      .from(sirhInscriptionsFormation)
      .innerJoin(
        sirhSessionsFormation,
        and(
          eq(sirhSessionsFormation.id, sirhInscriptionsFormation.sessionId),
          isNull(sirhSessionsFormation.deletedAt),
        ),
      )
      .innerJoin(sirhFormations, eq(sirhFormations.id, sirhSessionsFormation.formationId))
      .where(
        and(
          eq(sirhInscriptionsFormation.employeId, employeId),
          isNull(sirhInscriptionsFormation.deletedAt),
        ),
      )
      .orderBy(desc(sirhSessionsFormation.dateDebut));

    const dernieres = new Set(
      dernieresQualifications(
        rows
          .filter((r) => r.resultat === 'reussi' && r.sessionStatut !== 'annulee')
          .map((r) => ({
            inscriptionId: r.inscriptionId,
            employeId,
            formationId: r.formationId,
            dateFinSession: r.dateFin,
            dateValidite: r.dateValidite,
          })),
      ).map((q) => q.inscriptionId),
    );
    return rows.map((r) => {
      const reussie = r.resultat === 'reussi' && r.sessionStatut !== 'annulee';
      const derniere = dernieres.has(r.inscriptionId);
      return {
        ...r,
        statutQualification:
          reussie && derniere ? statutQualification(r.dateValidite, today) : null,
        remplacee: reussie && !derniere,
      };
    });
  });
}
