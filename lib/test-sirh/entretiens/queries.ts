import 'server-only';

import {
  and,
  asc,
  count,
  desc,
  eq,
  gte,
  inArray,
  isNotNull,
  isNull,
  lte,
  type SQL,
} from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';

import { withTenant, type TenantTx } from '@/lib/db/with-tenant';
import { employes } from '@/db/schema/employes';
import {
  sirhCampagnesEntretiens,
  sirhCollaborateurs,
  sirhEntretiens,
  sirhObjectifs,
} from '@/db/schema/test-sirh';
import type {
  StatutCampagne,
  StatutEntretien,
  StatutObjectif,
  TypeEntretien,
} from '@/lib/validation/test-sirh/enums';

import { aujourdhuiIso } from '../calendrier';
import { exigerContexteSirhAction } from '../contexte';
import { nomComplet } from '../format';
import { ROLES_SIRH_LECTURE } from '../permissions';
import { estEvaluateur, peutConsulterEmploye } from './droits';
import {
  calculerSuiviEntretienPro,
  TYPES_ENTRETIEN_PROFESSIONNEL,
  type EntretienPourSuivi,
  type SuiviEntretienPro,
} from './echeances';
import { progressionCampagne, type ProgressionCampagne } from './progression';

/**
 * Lectures — Test SIRH › Entretiens & objectifs. Fonctions `server-only`
 * appelées depuis les Server Components ; données sérialisables (dates ISO).
 * Les employés ne sont lus que par colonnes explicites (jamais NIR / IBAN).
 */

const REGEX_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Identifiant syntaxiquement valide (évite une erreur SQL sur une URL fantaisiste). */
function estUuid(v: string | null | undefined): v is string {
  return typeof v === 'string' && REGEX_UUID.test(v);
}

// ─────────────────────────────────────────────────────────────
// Campagnes
// ─────────────────────────────────────────────────────────────

export type CampagneLigne = ProgressionCampagne & {
  id: string;
  libelle: string;
  typeEntretien: TypeEntretien;
  dateDebut: string | null;
  dateLimite: string | null;
  statut: StatutCampagne;
  description: string | null;
};

/** Campagnes (plus récentes d'abord) avec leur progression (réalisés / total). */
export async function listerCampagnes(): Promise<CampagneLigne[]> {
  const ctx = await exigerContexteSirhAction(ROLES_SIRH_LECTURE);
  return withTenant(ctx.entreprise.id, async (tx) => {
    const campagnes = await tx
      .select({
        id: sirhCampagnesEntretiens.id,
        libelle: sirhCampagnesEntretiens.libelle,
        typeEntretien: sirhCampagnesEntretiens.typeEntretien,
        dateDebut: sirhCampagnesEntretiens.dateDebut,
        dateLimite: sirhCampagnesEntretiens.dateLimite,
        statut: sirhCampagnesEntretiens.statut,
        description: sirhCampagnesEntretiens.description,
      })
      .from(sirhCampagnesEntretiens)
      .where(isNull(sirhCampagnesEntretiens.deletedAt))
      .orderBy(desc(sirhCampagnesEntretiens.createdAt));

    const repartition = await tx
      .select({
        campagneId: sirhEntretiens.campagneId,
        statut: sirhEntretiens.statut,
        n: count(),
      })
      .from(sirhEntretiens)
      .where(and(isNull(sirhEntretiens.deletedAt), isNotNull(sirhEntretiens.campagneId)))
      .groupBy(sirhEntretiens.campagneId, sirhEntretiens.statut);
    const statutsParCampagne = new Map<string, StatutEntretien[]>();
    for (const r of repartition) {
      if (!r.campagneId) continue;
      const liste = statutsParCampagne.get(r.campagneId) ?? [];
      for (let i = 0; i < r.n; i++) liste.push(r.statut);
      statutsParCampagne.set(r.campagneId, liste);
    }

    return campagnes.map((c) => ({
      ...c,
      ...progressionCampagne(statutsParCampagne.get(c.id) ?? []),
    }));
  });
}

export type CampagneOption = { id: string; label: string; statut: StatutCampagne };

/** Campagnes non clôturées (rattachement manuel d'un entretien). */
export async function listerCampagnesOptions(): Promise<CampagneOption[]> {
  const ctx = await exigerContexteSirhAction(ROLES_SIRH_LECTURE);
  const rows = await withTenant(ctx.entreprise.id, (tx) =>
    tx
      .select({
        id: sirhCampagnesEntretiens.id,
        libelle: sirhCampagnesEntretiens.libelle,
        statut: sirhCampagnesEntretiens.statut,
      })
      .from(sirhCampagnesEntretiens)
      .where(isNull(sirhCampagnesEntretiens.deletedAt))
      .orderBy(desc(sirhCampagnesEntretiens.createdAt)),
  );
  return rows.map((r) => ({ id: r.id, label: r.libelle, statut: r.statut }));
}

// ─────────────────────────────────────────────────────────────
// Entretiens
// ─────────────────────────────────────────────────────────────

export type EntretienLigne = {
  id: string;
  campagneId: string | null;
  campagneLibelle: string | null;
  campagneStatut: StatutCampagne | null;
  employeId: string;
  /** « Prénom Nom ». */
  employeNom: string;
  /** Clé de tri « nom prénom ». */
  employeTri: string;
  employeMatricule: string | null;
  evaluateurId: string | null;
  evaluateurNom: string | null;
  typeEntretien: TypeEntretien;
  datePrevue: string | null;
  dateRealisation: string | null;
  statut: StatutEntretien;
  noteGlobale: number | null;
};

export type EntretienDetail = EntretienLigne & {
  synthese: string | null;
  pointsForts: string | null;
  axesAmelioration: string | null;
  souhaitsFormation: string | null;
  souhaitsEvolution: string | null;
  commentaireSalarie: string | null;
};

/** Entretiens d'un salarié (dossier collaborateur, « Mon espace »). */
export type EntretienEmployeLigne = EntretienDetail;

export type FiltresEntretiens = {
  campagneId?: string | null;
  statut?: StatutEntretien | null;
  evaluateurId?: string | null;
};

/** Sélection commune (colonnes explicites ; employés non supprimés). */
async function selectionnerEntretiens(tx: TenantTx, conditions: SQL[]): Promise<EntretienDetail[]> {
  const evaluateur = alias(employes, 'evaluateur');
  const rows = await tx
    .select({
      id: sirhEntretiens.id,
      campagneId: sirhEntretiens.campagneId,
      campagneLibelle: sirhCampagnesEntretiens.libelle,
      campagneStatut: sirhCampagnesEntretiens.statut,
      employeId: sirhEntretiens.employeId,
      employeNom: employes.nom,
      employePrenom: employes.prenom,
      employeMatricule: employes.matricule,
      evaluateurId: sirhEntretiens.evaluateurId,
      evaluateurNom: evaluateur.nom,
      evaluateurPrenom: evaluateur.prenom,
      typeEntretien: sirhEntretiens.typeEntretien,
      datePrevue: sirhEntretiens.datePrevue,
      dateRealisation: sirhEntretiens.dateRealisation,
      statut: sirhEntretiens.statut,
      noteGlobale: sirhEntretiens.noteGlobale,
      synthese: sirhEntretiens.synthese,
      pointsForts: sirhEntretiens.pointsForts,
      axesAmelioration: sirhEntretiens.axesAmelioration,
      souhaitsFormation: sirhEntretiens.souhaitsFormation,
      souhaitsEvolution: sirhEntretiens.souhaitsEvolution,
      commentaireSalarie: sirhEntretiens.commentaireSalarie,
    })
    .from(sirhEntretiens)
    .innerJoin(employes, and(eq(employes.id, sirhEntretiens.employeId), isNull(employes.deletedAt)))
    .leftJoin(evaluateur, eq(evaluateur.id, sirhEntretiens.evaluateurId))
    .leftJoin(
      sirhCampagnesEntretiens,
      and(
        eq(sirhCampagnesEntretiens.id, sirhEntretiens.campagneId),
        isNull(sirhCampagnesEntretiens.deletedAt),
      ),
    )
    .where(and(isNull(sirhEntretiens.deletedAt), ...conditions))
    .orderBy(
      desc(sirhEntretiens.dateRealisation),
      desc(sirhEntretiens.datePrevue),
      asc(employes.nom),
      asc(employes.prenom),
    );

  return rows.map(({ employeNom, employePrenom, evaluateurNom, evaluateurPrenom, ...r }) => ({
    ...r,
    campagneLibelle: r.campagneLibelle ?? null,
    campagneStatut: r.campagneStatut ?? null,
    employeNom: nomComplet(employePrenom, employeNom),
    employeTri: `${employeNom} ${employePrenom}`.toLowerCase(),
    evaluateurNom:
      evaluateurNom !== null || evaluateurPrenom !== null
        ? nomComplet(evaluateurPrenom, evaluateurNom)
        : null,
  }));
}

/** Entretiens (filtres campagne / statut / évaluateur). */
export async function listerEntretiens(filtres: FiltresEntretiens = {}): Promise<EntretienLigne[]> {
  const ctx = await exigerContexteSirhAction(ROLES_SIRH_LECTURE);
  const conditions: SQL[] = [];
  if (filtres.campagneId) conditions.push(eq(sirhEntretiens.campagneId, filtres.campagneId));
  if (filtres.statut) conditions.push(eq(sirhEntretiens.statut, filtres.statut));
  if (filtres.evaluateurId) conditions.push(eq(sirhEntretiens.evaluateurId, filtres.evaluateurId));
  const rows = await withTenant(ctx.entreprise.id, (tx) => selectionnerEntretiens(tx, conditions));
  // Liste : pas besoin des textes du compte rendu.
  return rows.map(
    ({
      synthese: _s,
      pointsForts: _p,
      axesAmelioration: _a,
      souhaitsFormation: _f,
      souhaitsEvolution: _e,
      commentaireSalarie: _c,
      ...ligne
    }) => ligne,
  );
}

/** Évaluateurs désignés sur au moins un entretien (filtre de la liste), triés par nom. */
export async function listerEvaluateursOptions(): Promise<Array<{ id: string; label: string }>> {
  const ctx = await exigerContexteSirhAction(ROLES_SIRH_LECTURE);
  const rows = await withTenant(ctx.entreprise.id, (tx) =>
    tx
      .selectDistinct({ id: employes.id, nom: employes.nom, prenom: employes.prenom })
      .from(sirhEntretiens)
      .innerJoin(employes, eq(employes.id, sirhEntretiens.evaluateurId))
      .where(isNull(sirhEntretiens.deletedAt))
      .orderBy(asc(employes.nom), asc(employes.prenom)),
  );
  return rows.map((r) => ({ id: r.id, label: nomComplet(r.prenom, r.nom) }));
}

/**
 * Un entretien (null si absent ou supprimé) et la qualité de l'utilisateur
 * courant : évaluateur désigné ou non.
 */
export async function lireEntretien(id: string): Promise<{
  entretien: EntretienDetail;
  estEvaluateur: boolean;
} | null> {
  const ctx = await exigerContexteSirhAction(ROLES_SIRH_LECTURE);
  if (!estUuid(id)) return null;
  return withTenant(ctx.entreprise.id, async (tx) => {
    const [entretien] = await selectionnerEntretiens(tx, [eq(sirhEntretiens.id, id)]);
    if (!entretien) return null;
    return { entretien, estEvaluateur: await estEvaluateur(tx, ctx, entretien.evaluateurId) };
  });
}

/**
 * Entretiens d'un salarié, du plus récent au plus ancien. Accessible aux rôles
 * de lecture du SIRH et au salarié lui-même (« Mon espace ») ; lève une erreur
 * sinon.
 */
export async function listerEntretiensEmploye(employeId: string): Promise<EntretienEmployeLigne[]> {
  const ctx = await exigerContexteSirhAction();
  if (!estUuid(employeId)) return [];
  return withTenant(ctx.entreprise.id, async (tx) => {
    if (!(await peutConsulterEmploye(tx, ctx, employeId))) throw new Error('Accès refusé.');
    return selectionnerEntretiens(tx, [eq(sirhEntretiens.employeId, employeId)]);
  });
}

// ─────────────────────────────────────────────────────────────
// Objectifs
// ─────────────────────────────────────────────────────────────

export type ObjectifLigne = {
  id: string;
  employeId: string;
  entretienId: string | null;
  entretienType: TypeEntretien | null;
  /** Date de réalisation (sinon prévue) de l'entretien de rattachement. */
  entretienDate: string | null;
  libelle: string;
  description: string | null;
  dateEcheance: string | null;
  poids: number | null;
  progression: number;
  statut: StatutObjectif;
};

/**
 * Objectifs d'un salarié (en cours d'abord, puis par échéance). Accessible aux
 * rôles de lecture du SIRH et au salarié lui-même ; lève une erreur sinon.
 */
export async function listerObjectifsEmploye(employeId: string): Promise<ObjectifLigne[]> {
  const ctx = await exigerContexteSirhAction();
  if (!estUuid(employeId)) return [];
  return withTenant(ctx.entreprise.id, async (tx) => {
    if (!(await peutConsulterEmploye(tx, ctx, employeId))) throw new Error('Accès refusé.');
    const rows = await tx
      .select({
        id: sirhObjectifs.id,
        employeId: sirhObjectifs.employeId,
        entretienId: sirhObjectifs.entretienId,
        entretienType: sirhEntretiens.typeEntretien,
        entretienRealisation: sirhEntretiens.dateRealisation,
        entretienPrevue: sirhEntretiens.datePrevue,
        libelle: sirhObjectifs.libelle,
        description: sirhObjectifs.description,
        dateEcheance: sirhObjectifs.dateEcheance,
        poids: sirhObjectifs.poids,
        progression: sirhObjectifs.progression,
        statut: sirhObjectifs.statut,
      })
      .from(sirhObjectifs)
      .leftJoin(
        sirhEntretiens,
        and(eq(sirhEntretiens.id, sirhObjectifs.entretienId), isNull(sirhEntretiens.deletedAt)),
      )
      .where(and(eq(sirhObjectifs.employeId, employeId), isNull(sirhObjectifs.deletedAt)))
      .orderBy(asc(sirhObjectifs.dateEcheance), asc(sirhObjectifs.libelle));

    const ordreStatut: Record<StatutObjectif, number> = {
      en_cours: 0,
      partiellement_atteint: 1,
      atteint: 2,
      non_atteint: 3,
      abandonne: 4,
    };
    return rows
      .map(({ entretienRealisation, entretienPrevue, ...r }) => ({
        ...r,
        entretienType: r.entretienType ?? null,
        entretienDate: entretienRealisation ?? entretienPrevue ?? null,
      }))
      .sort((a, b) => ordreStatut[a.statut] - ordreStatut[b.statut]);
  });
}

// ─────────────────────────────────────────────────────────────
// Obligation légale (entretien professionnel) & indicateurs
// ─────────────────────────────────────────────────────────────

export type SuiviEntretienProLigne = SuiviEntretienPro & {
  employeId: string;
  /** « Prénom Nom ». */
  employeNom: string;
  employeTri: string;
  matricule: string | null;
  managerId: string | null;
  managerNom: string | null;
};

/** Suivi de l'entretien professionnel pour chaque employé actif (date d'entrée = `date_entree`, à défaut `date_embauche`). */
async function calculerSuivi(tx: TenantTx, today: string): Promise<SuiviEntretienProLigne[]> {
  const manager = alias(employes, 'manager');
  const salaries = await tx
    .select({
      id: employes.id,
      nom: employes.nom,
      prenom: employes.prenom,
      matricule: employes.matricule,
      dateEntree: employes.dateEntree,
      dateEmbauche: employes.dateEmbauche,
      managerId: manager.id,
      managerNom: manager.nom,
      managerPrenom: manager.prenom,
    })
    .from(employes)
    .leftJoin(
      sirhCollaborateurs,
      and(eq(sirhCollaborateurs.employeId, employes.id), isNull(sirhCollaborateurs.deletedAt)),
    )
    .leftJoin(manager, and(eq(manager.id, sirhCollaborateurs.managerId), isNull(manager.deletedAt)))
    .where(and(isNull(employes.deletedAt), eq(employes.actif, true)))
    .orderBy(asc(employes.nom), asc(employes.prenom));

  const entretiens = await tx
    .select({
      id: sirhEntretiens.id,
      employeId: sirhEntretiens.employeId,
      typeEntretien: sirhEntretiens.typeEntretien,
      statut: sirhEntretiens.statut,
      datePrevue: sirhEntretiens.datePrevue,
      dateRealisation: sirhEntretiens.dateRealisation,
    })
    .from(sirhEntretiens)
    .where(
      and(
        isNull(sirhEntretiens.deletedAt),
        inArray(sirhEntretiens.typeEntretien, [...TYPES_ENTRETIEN_PROFESSIONNEL]),
      ),
    );
  const parEmploye = new Map<string, EntretienPourSuivi[]>();
  for (const { employeId, ...e } of entretiens) {
    const liste = parEmploye.get(employeId) ?? [];
    liste.push(e);
    parEmploye.set(employeId, liste);
  }

  return salaries.map((s) => ({
    employeId: s.id,
    employeNom: nomComplet(s.prenom, s.nom),
    employeTri: `${s.nom} ${s.prenom}`.toLowerCase(),
    matricule: s.matricule,
    managerId: s.managerId ?? null,
    managerNom: s.managerId ? nomComplet(s.managerPrenom, s.managerNom) : null,
    ...calculerSuiviEntretienPro(
      { dateEntree: s.dateEntree ?? s.dateEmbauche, entretiens: parEmploye.get(s.id) ?? [] },
      today,
    ),
  }));
}

/** Obligation d'entretien professionnel (art. L6315-1 C. trav.) par employé actif. */
export async function listerSuiviEntretiensProfessionnels(): Promise<SuiviEntretienProLigne[]> {
  const ctx = await exigerContexteSirhAction(ROLES_SIRH_LECTURE);
  const today = aujourdhuiIso();
  return withTenant(ctx.entreprise.id, (tx) => calculerSuivi(tx, today));
}

/** Employés actifs dont l'entretien professionnel est en retard (échéance la plus ancienne d'abord). */
export async function listerEntretiensProfessionnelsEnRetard(): Promise<SuiviEntretienProLigne[]> {
  const lignes = await listerSuiviEntretiensProfessionnels();
  return lignes
    .filter((l) => l.statut === 'en_retard')
    .sort((a, b) => (a.prochaineEcheance ?? '').localeCompare(b.prochaineEcheance ?? ''));
}

export type KpiEntretiens = {
  annee: number;
  /** Entretiens au statut « à planifier ». */
  aPlanifier: number;
  /** Entretiens réalisés ou signés dans l'année civile. */
  realisesAnnee: number;
  /** Employés actifs en retard d'entretien professionnel. */
  professionnelsEnRetard: number;
  /** Employés actifs dont l'entretien professionnel échoit sous 60 jours. */
  professionnelsAPlanifier: number;
  /** Objectifs au statut « en cours ». */
  objectifsEnCours: number;
};

/** Indicateurs du domaine (onglet Campagnes, tableau de bord SIRH). */
export async function kpiEntretiens(): Promise<KpiEntretiens> {
  const ctx = await exigerContexteSirhAction(ROLES_SIRH_LECTURE);
  const today = aujourdhuiIso();
  const annee = Number(today.slice(0, 4));
  return withTenant(ctx.entreprise.id, async (tx) => {
    const employeNonSupprime = and(
      eq(employes.id, sirhEntretiens.employeId),
      isNull(employes.deletedAt),
    );
    const [aPlanifier] = await tx
      .select({ n: count() })
      .from(sirhEntretiens)
      .innerJoin(employes, employeNonSupprime)
      .where(and(isNull(sirhEntretiens.deletedAt), eq(sirhEntretiens.statut, 'a_planifier')));
    const [realises] = await tx
      .select({ n: count() })
      .from(sirhEntretiens)
      .innerJoin(employes, employeNonSupprime)
      .where(
        and(
          isNull(sirhEntretiens.deletedAt),
          inArray(sirhEntretiens.statut, ['realise', 'signe']),
          gte(sirhEntretiens.dateRealisation, `${annee}-01-01`),
          lte(sirhEntretiens.dateRealisation, `${annee}-12-31`),
        ),
      );
    const [objectifs] = await tx
      .select({ n: count() })
      .from(sirhObjectifs)
      .innerJoin(
        employes,
        and(eq(employes.id, sirhObjectifs.employeId), isNull(employes.deletedAt)),
      )
      .where(and(isNull(sirhObjectifs.deletedAt), eq(sirhObjectifs.statut, 'en_cours')));
    const suivi = await calculerSuivi(tx, today);

    return {
      annee,
      aPlanifier: aPlanifier?.n ?? 0,
      realisesAnnee: realises?.n ?? 0,
      professionnelsEnRetard: suivi.filter((s) => s.statut === 'en_retard').length,
      professionnelsAPlanifier: suivi.filter((s) => s.statut === 'a_planifier').length,
      objectifsEnCours: objectifs?.n ?? 0,
    };
  });
}
