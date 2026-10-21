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
  lte,
  or,
  sql,
  type SQL,
} from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';

import { withTenant, type TenantTx } from '@/lib/db/with-tenant';
import { chantiers } from '@/db/schema/chantiers';
import { employes } from '@/db/schema/employes';
import {
  sirhAbsences,
  sirhBadgeages,
  sirhCollaborateurs,
  sirhEquipeMembres,
  sirhHeuresSup,
  sirhHoraires,
  sirhJoursFeries,
  sirhTypesAbsence,
} from '@/db/schema/test-sirh';
import { utilisateurs } from '@/db/schema/utilisateurs';
import type {
  CompensationHs,
  LieuTravail,
  SourceBadgeage,
  StatutDemande,
} from '@/lib/validation/test-sirh/enums';

import { employeIdDeLUtilisateur, peutAgirPourEmploye } from '../acces';
import {
  ajouterJours,
  aujourdhuiIso,
  estDateIso,
  heuresHebdo,
  horaireDepuisLigne,
  lundiDeLaSemaine,
  type IsoDate,
} from '../calendrier';
import { exigerContexteSirhAction } from '../contexte';
import { versNombre } from '../format';
import { bornesMois, type MoisPaie } from '../paie/periodes';
import { peutGererSirh, peutLireSirh, peutValiderSirh, ROLES_SIRH_LECTURE } from '../permissions';

import { estUuid, libelleChantier } from './controles';
import {
  construireFeuilleTemps,
  minutesBadgeage,
  semaineDepuisParametre,
  type EmployeFeuille,
  type FeuilleTemps,
  type LigneFeuille,
} from './feuille-temps';

/**
 * Lectures — Test SIRH › Temps de travail. Fonctions `server-only` (pas des
 * server actions) appelées depuis les Server Components. Données sérialisables
 * (dates ISO, décimaux en `number`).
 *
 * Les lectures destinées aux autres écrans (tableau de bord, Validations, Mon
 * espace, dossier collaborateur) ne redirigent pas un rôle non habilité : elles
 * renvoient `null` / `[]`.
 */

// ─────────────────────────────────────────────────────────────
// Feuille de temps
// ─────────────────────────────────────────────────────────────

async function chargerFeuilleTempsTx(
  tx: TenantTx,
  p: {
    lundi: IsoDate;
    equipeId?: string | null;
    siteId?: string | null;
    /** Restreint la feuille à ces collaborateurs (même inactifs). */
    employeIds?: readonly string[];
  },
): Promise<FeuilleTemps> {
  const lundi = lundiDeLaSemaine(p.lundi);
  const dimanche = ajouterJours(lundi, 6);
  const filtre = p.employeIds && p.employeIds.length > 0 ? [...p.employeIds] : null;

  const badgeages = await tx
    .select({
      id: sirhBadgeages.id,
      employeId: sirhBadgeages.employeId,
      dateBadgeage: sirhBadgeages.dateBadgeage,
      heureDebut: sirhBadgeages.heureDebut,
      heureFin: sirhBadgeages.heureFin,
      pauseMinutes: sirhBadgeages.pauseMinutes,
      lieu: sirhBadgeages.lieu,
      chantierId: sirhBadgeages.chantierId,
      chantierNumero: chantiers.numero,
      chantierLibelle: chantiers.libelle,
      source: sirhBadgeages.source,
      valide: sirhBadgeages.valide,
      commentaire: sirhBadgeages.commentaire,
    })
    .from(sirhBadgeages)
    .leftJoin(chantiers, eq(chantiers.id, sirhBadgeages.chantierId))
    .where(
      and(
        isNull(sirhBadgeages.deletedAt),
        gte(sirhBadgeages.dateBadgeage, lundi),
        lte(sirhBadgeages.dateBadgeage, dimanche),
        filtre ? inArray(sirhBadgeages.employeId, filtre) : undefined,
      ),
    )
    .orderBy(asc(sirhBadgeages.dateBadgeage), asc(sirhBadgeages.heureDebut));

  // Colonnes explicites : jamais de NIR / IBAN déchiffrés.
  const lignesEmployes = await tx
    .select({
      id: employes.id,
      nom: employes.nom,
      prenom: employes.prenom,
      matricule: employes.matricule,
      actif: employes.actif,
    })
    .from(employes)
    .where(and(isNull(employes.deletedAt), filtre ? inArray(employes.id, filtre) : undefined))
    .orderBy(asc(employes.nom), asc(employes.prenom));

  const collaborateurs = await tx
    .select({
      employeId: sirhCollaborateurs.employeId,
      horaireId: sirhCollaborateurs.horaireId,
      siteId: sirhCollaborateurs.siteId,
    })
    .from(sirhCollaborateurs)
    .where(isNull(sirhCollaborateurs.deletedAt));

  const horaires = await tx
    .select({
      id: sirhHoraires.id,
      nom: sirhHoraires.nom,
      heuresLundi: sirhHoraires.heuresLundi,
      heuresMardi: sirhHoraires.heuresMardi,
      heuresMercredi: sirhHoraires.heuresMercredi,
      heuresJeudi: sirhHoraires.heuresJeudi,
      heuresVendredi: sirhHoraires.heuresVendredi,
      heuresSamedi: sirhHoraires.heuresSamedi,
      heuresDimanche: sirhHoraires.heuresDimanche,
      parDefaut: sirhHoraires.parDefaut,
      actif: sirhHoraires.actif,
    })
    .from(sirhHoraires)
    .where(isNull(sirhHoraires.deletedAt));

  const feries = await tx
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
        gte(sirhJoursFeries.dateFerie, lundi),
        lte(sirhJoursFeries.dateFerie, dimanche),
      ),
    );

  const absences = await tx
    .select({
      employeId: sirhAbsences.employeId,
      dateDebut: sirhAbsences.dateDebut,
      dateFin: sirhAbsences.dateFin,
      demiJourneeDebut: sirhAbsences.demiJourneeDebut,
      demiJourneeFin: sirhAbsences.demiJourneeFin,
      libelle: sirhTypesAbsence.libelle,
      code: sirhTypesAbsence.code,
      couleur: sirhTypesAbsence.couleur,
    })
    .from(sirhAbsences)
    .innerJoin(sirhTypesAbsence, eq(sirhTypesAbsence.id, sirhAbsences.typeAbsenceId))
    .where(
      and(
        isNull(sirhAbsences.deletedAt),
        eq(sirhAbsences.statut, 'approuvee'),
        lte(sirhAbsences.dateDebut, dimanche),
        gte(sirhAbsences.dateFin, lundi),
        filtre ? inArray(sirhAbsences.employeId, filtre) : undefined,
      ),
    );

  let membresEquipe: Set<string> | null = null;
  if (p.equipeId) {
    const membres = await tx
      .select({ employeId: sirhEquipeMembres.employeId })
      .from(sirhEquipeMembres)
      .where(
        and(
          eq(sirhEquipeMembres.equipeId, p.equipeId),
          isNull(sirhEquipeMembres.deletedAt),
          or(isNull(sirhEquipeMembres.dateDebut), lte(sirhEquipeMembres.dateDebut, dimanche)),
          or(isNull(sirhEquipeMembres.dateFin), gte(sirhEquipeMembres.dateFin, lundi)),
        ),
      );
    membresEquipe = new Set(membres.map((m) => m.employeId));
  }

  const avecBadgeage = new Set(badgeages.map((b) => b.employeId));
  const collabParEmploye = new Map(collaborateurs.map((c) => [c.employeId, c]));
  const horairesParId = new Map(horaires.map((h) => [h.id, h]));
  const horaireDefaut = horaires.find((h) => h.parDefaut && h.actif) ?? null;

  const employesFeuille: EmployeFeuille[] = lignesEmployes
    // Actifs + ceux qui ont badgé dans la semaine (sortis depuis).
    .filter((e) => filtre !== null || e.actif || avecBadgeage.has(e.id))
    .filter((e) => membresEquipe === null || membresEquipe.has(e.id))
    .filter((e) => !p.siteId || collabParEmploye.get(e.id)?.siteId === p.siteId)
    .map((e) => {
      const collab = collabParEmploye.get(e.id);
      const horaire =
        (collab?.horaireId ? horairesParId.get(collab.horaireId) : undefined) ?? horaireDefaut;
      return {
        id: e.id,
        nom: e.nom,
        prenom: e.prenom,
        matricule: e.matricule,
        horaire: horaire ? horaireDepuisLigne(horaire) : null,
        horaireNom: horaire?.nom ?? null,
        siteId: collab?.siteId ?? null,
      };
    });

  return construireFeuilleTemps({
    lundi,
    employes: employesFeuille,
    badgeages: badgeages.map((b) => ({
      id: b.id,
      employeId: b.employeId,
      dateBadgeage: b.dateBadgeage,
      heureDebut: b.heureDebut,
      heureFin: b.heureFin,
      pauseMinutes: b.pauseMinutes,
      lieu: b.lieu,
      chantierId: b.chantierId,
      chantierLabel: libelleChantier(b.chantierNumero, b.chantierLibelle),
      source: b.source,
      valide: b.valide,
      commentaire: b.commentaire,
    })),
    absences,
    feries,
  });
}

/** Feuille de temps d'une semaine (filtres équipe / site optionnels). */
export async function chargerFeuilleTemps(p: {
  /** N'importe quel jour de la semaine voulue. */
  semaine: IsoDate;
  equipeId?: string | null;
  siteId?: string | null;
}): Promise<FeuilleTemps> {
  const ctx = await exigerContexteSirhAction(ROLES_SIRH_LECTURE);
  return withTenant(ctx.entreprise.id, (tx) =>
    chargerFeuilleTempsTx(tx, {
      lundi: lundiDeLaSemaine(p.semaine),
      equipeId: estUuid(p.equipeId) ? p.equipeId : null,
      siteId: estUuid(p.siteId) ? p.siteId : null,
    }),
  );
}

export type MesBadgeagesSemaine = {
  /** null si l'utilisateur n'est rattaché à aucune fiche employé. */
  employeId: string | null;
  /**
   * Feuille de la semaine réduite à l'utilisateur (0 ou 1 ligne), affichable
   * telle quelle : `<FeuilleTempsTable feuille={…} today={…} sansFiltre />`.
   */
  feuille: FeuilleTemps;
  /** Raccourci : la ligne de l'utilisateur (totaux, jours), ou null. */
  ligne: LigneFeuille | null;
};

/**
 * « Mon espace » : badgeages de l'utilisateur courant pour la semaine contenant
 * `semaine` (défaut : semaine en cours), avec théorique et écarts. Tous rôles.
 */
export async function listerMesBadgeages(semaine?: string | null): Promise<MesBadgeagesSemaine> {
  const ctx = await exigerContexteSirhAction();
  const lundi = semaineDepuisParametre(semaine, aujourdhuiIso());
  return withTenant(ctx.entreprise.id, async (tx) => {
    const moi = await employeIdDeLUtilisateur(tx, ctx.utilisateur.id);
    if (!moi) {
      return {
        employeId: null,
        feuille: construireFeuilleTemps({ lundi, employes: [], badgeages: [] }),
        ligne: null,
      };
    }
    const feuille = await chargerFeuilleTempsTx(tx, { lundi, employeIds: [moi] });
    return { employeId: moi, feuille, ligne: feuille.lignes[0] ?? null };
  });
}

export type BadgeageVue = {
  id: string;
  employeId: string;
  dateBadgeage: IsoDate;
  /** `HH:MM`. */
  heureDebut: string;
  heureFin: string | null;
  pauseMinutes: number;
  /** Minutes travaillées (pause déduite) ; null si en cours. */
  minutes: number | null;
  enCours: boolean;
  lieu: LieuTravail;
  chantierId: string | null;
  chantierLabel: string | null;
  source: SourceBadgeage;
  valide: boolean;
  valideLe: string | null;
  commentaire: string | null;
};

/**
 * Dossier collaborateur : badgeages d'un employé entre `debut` et `fin` inclus
 * (plus récents d'abord). Rôles de lecture SIRH, ou le salarié lui-même.
 */
export async function listerBadgeagesEmploye(
  employeId: string,
  debut: string,
  fin: string,
): Promise<BadgeageVue[]> {
  const ctx = await exigerContexteSirhAction();
  if (!estUuid(employeId) || !estDateIso(debut) || !estDateIso(fin) || fin < debut) return [];
  return withTenant(ctx.entreprise.id, async (tx) => {
    if (!peutLireSirh(ctx.utilisateur.role) && !(await peutAgirPourEmploye(tx, ctx, employeId))) {
      return [];
    }
    const rows = await tx
      .select({
        id: sirhBadgeages.id,
        employeId: sirhBadgeages.employeId,
        dateBadgeage: sirhBadgeages.dateBadgeage,
        heureDebut: sirhBadgeages.heureDebut,
        heureFin: sirhBadgeages.heureFin,
        pauseMinutes: sirhBadgeages.pauseMinutes,
        lieu: sirhBadgeages.lieu,
        chantierId: sirhBadgeages.chantierId,
        chantierNumero: chantiers.numero,
        chantierLibelle: chantiers.libelle,
        source: sirhBadgeages.source,
        valide: sirhBadgeages.valide,
        valideLe: sirhBadgeages.valideLe,
        commentaire: sirhBadgeages.commentaire,
      })
      .from(sirhBadgeages)
      .leftJoin(chantiers, eq(chantiers.id, sirhBadgeages.chantierId))
      .where(
        and(
          eq(sirhBadgeages.employeId, employeId),
          isNull(sirhBadgeages.deletedAt),
          gte(sirhBadgeages.dateBadgeage, debut),
          lte(sirhBadgeages.dateBadgeage, fin),
        ),
      )
      .orderBy(desc(sirhBadgeages.dateBadgeage), desc(sirhBadgeages.heureDebut));
    return rows.map((r) => ({
      id: r.id,
      employeId: r.employeId,
      dateBadgeage: r.dateBadgeage,
      heureDebut: r.heureDebut.slice(0, 5),
      heureFin: r.heureFin ? r.heureFin.slice(0, 5) : null,
      pauseMinutes: r.pauseMinutes,
      minutes: r.heureFin ? minutesBadgeage(r) : null,
      enCours: r.heureFin === null,
      lieu: r.lieu,
      chantierId: r.chantierId,
      chantierLabel: libelleChantier(r.chantierNumero, r.chantierLibelle),
      source: r.source,
      valide: r.valide,
      valideLe: r.valideLe ? r.valideLe.toISOString() : null,
      commentaire: r.commentaire,
    }));
  });
}

// ─────────────────────────────────────────────────────────────
// Indicateurs
// ─────────────────────────────────────────────────────────────

export type KpiTemps = {
  /** Lundi de la semaine en cours. */
  lundi: IsoDate;
  minutesBadgeesSemaine: number;
  badgeagesNonValidesSemaine: number;
  badgeagesEnCours: number;
  heuresSupEnAttente: number;
  heuresSupEnAttenteHeures: number;
};

/** Tableau de bord : indicateurs de la semaine en cours (null si rôle sans lecture SIRH). */
export async function kpiTemps(): Promise<KpiTemps | null> {
  const ctx = await exigerContexteSirhAction();
  if (!peutLireSirh(ctx.utilisateur.role)) return null;
  const lundi = lundiDeLaSemaine(aujourdhuiIso());
  const dimanche = ajouterJours(lundi, 6);
  return withTenant(ctx.entreprise.id, async (tx) => {
    const badgeages = await tx
      .select({
        heureDebut: sirhBadgeages.heureDebut,
        heureFin: sirhBadgeages.heureFin,
        pauseMinutes: sirhBadgeages.pauseMinutes,
        valide: sirhBadgeages.valide,
      })
      .from(sirhBadgeages)
      .where(
        and(
          isNull(sirhBadgeages.deletedAt),
          gte(sirhBadgeages.dateBadgeage, lundi),
          lte(sirhBadgeages.dateBadgeage, dimanche),
        ),
      );
    let minutes = 0;
    let nonValides = 0;
    let enCours = 0;
    for (const b of badgeages) {
      if (!b.heureFin) {
        enCours += 1;
        continue;
      }
      minutes += minutesBadgeage(b) ?? 0;
      if (!b.valide) nonValides += 1;
    }
    const [hs] = await tx
      .select({
        n: count(),
        heures: sql<string>`coalesce(sum(${sirhHeuresSup.dureeHeures}), 0)`,
      })
      .from(sirhHeuresSup)
      .where(and(isNull(sirhHeuresSup.deletedAt), eq(sirhHeuresSup.statut, 'en_attente')));
    return {
      lundi,
      minutesBadgeesSemaine: minutes,
      badgeagesNonValidesSemaine: nonValides,
      badgeagesEnCours: enCours,
      heuresSupEnAttente: hs?.n ?? 0,
      heuresSupEnAttenteHeures: versNombre(hs?.heures) ?? 0,
    };
  });
}

/** Nombre de demandes d'heures sup. en attente (compteur d'onglet). */
export async function compterHeuresSupEnAttente(): Promise<number> {
  const ctx = await exigerContexteSirhAction(ROLES_SIRH_LECTURE);
  const [row] = await withTenant(ctx.entreprise.id, (tx) =>
    tx
      .select({ n: count() })
      .from(sirhHeuresSup)
      .where(and(isNull(sirhHeuresSup.deletedAt), eq(sirhHeuresSup.statut, 'en_attente'))),
  );
  return row?.n ?? 0;
}

// ─────────────────────────────────────────────────────────────
// Heures supplémentaires
// ─────────────────────────────────────────────────────────────

export type HeuresSupVue = {
  id: string;
  employeId: string;
  employeNom: string;
  employePrenom: string;
  matricule: string | null;
  dateHeures: IsoDate;
  dureeHeures: number;
  majorationPct: number;
  compensation: CompensationHs;
  motif: string | null;
  chantierId: string | null;
  chantierLabel: string | null;
  statut: StatutDemande;
  demandeParEmail: string | null;
  valideurEmail: string | null;
  dateDecision: string | null;
  commentaireDecision: string | null;
  createdAt: string;
};

export type HeuresSupEnAttenteVue = HeuresSupVue & {
  /** Faux pour sa propre demande (sauf gestionnaire RH). */
  peutDecider: boolean;
};

const demandeur = alias(utilisateurs, 'hs_demandeur');
const valideur = alias(utilisateurs, 'hs_valideur');

async function selectHeuresSup(
  tx: TenantTx,
  condition: SQL | undefined,
  ordre: 'asc' | 'desc',
  limite?: number,
): Promise<HeuresSupVue[]> {
  const requete = tx
    .select({
      id: sirhHeuresSup.id,
      employeId: sirhHeuresSup.employeId,
      employeNom: employes.nom,
      employePrenom: employes.prenom,
      matricule: employes.matricule,
      dateHeures: sirhHeuresSup.dateHeures,
      dureeHeures: sirhHeuresSup.dureeHeures,
      majorationPct: sirhHeuresSup.majorationPct,
      compensation: sirhHeuresSup.compensation,
      motif: sirhHeuresSup.motif,
      chantierId: sirhHeuresSup.chantierId,
      chantierNumero: chantiers.numero,
      chantierLibelle: chantiers.libelle,
      statut: sirhHeuresSup.statut,
      demandeParEmail: demandeur.email,
      valideurEmail: valideur.email,
      dateDecision: sirhHeuresSup.dateDecision,
      commentaireDecision: sirhHeuresSup.commentaireDecision,
      createdAt: sirhHeuresSup.createdAt,
    })
    .from(sirhHeuresSup)
    .innerJoin(employes, eq(employes.id, sirhHeuresSup.employeId))
    .leftJoin(chantiers, eq(chantiers.id, sirhHeuresSup.chantierId))
    .leftJoin(demandeur, eq(demandeur.id, sirhHeuresSup.demandePar))
    .leftJoin(valideur, eq(valideur.id, sirhHeuresSup.valideurId))
    .where(and(isNull(sirhHeuresSup.deletedAt), condition))
    .orderBy(
      ordre === 'asc' ? asc(sirhHeuresSup.dateHeures) : desc(sirhHeuresSup.dateHeures),
      ordre === 'asc' ? asc(sirhHeuresSup.createdAt) : desc(sirhHeuresSup.createdAt),
    );
  const rows = limite ? await requete.limit(limite) : await requete;
  return rows.map((r) => ({
    id: r.id,
    employeId: r.employeId,
    employeNom: r.employeNom,
    employePrenom: r.employePrenom,
    matricule: r.matricule,
    dateHeures: r.dateHeures,
    dureeHeures: versNombre(r.dureeHeures) ?? 0,
    majorationPct: r.majorationPct,
    compensation: r.compensation,
    motif: r.motif,
    chantierId: r.chantierId,
    chantierLabel: libelleChantier(r.chantierNumero, r.chantierLibelle),
    statut: r.statut,
    demandeParEmail: r.demandeParEmail,
    valideurEmail: r.valideurEmail,
    dateDecision: r.dateDecision ? r.dateDecision.toISOString() : null,
    commentaireDecision: r.commentaireDecision,
    createdAt: r.createdAt.toISOString(),
  }));
}

/** Demandes d'heures sup. datées du mois (tous statuts). */
export async function listerHeuresSupMois(mois: MoisPaie): Promise<HeuresSupVue[]> {
  const ctx = await exigerContexteSirhAction(ROLES_SIRH_LECTURE);
  const { debut, fin } = bornesMois(mois);
  return withTenant(ctx.entreprise.id, (tx) =>
    selectHeuresSup(
      tx,
      and(gte(sirhHeuresSup.dateHeures, debut), lte(sirhHeuresSup.dateHeures, fin)),
      'desc',
    ),
  );
}

/** Validations : demandes en attente (plus anciennes d'abord). `[]` si rôle non valideur. */
export async function listerHeuresSupEnAttente(): Promise<HeuresSupEnAttenteVue[]> {
  const ctx = await exigerContexteSirhAction();
  if (!peutValiderSirh(ctx.utilisateur.role)) return [];
  return withTenant(ctx.entreprise.id, async (tx) => {
    const moi = await employeIdDeLUtilisateur(tx, ctx.utilisateur.id);
    const gestion = peutGererSirh(ctx.utilisateur.role);
    const rows = await selectHeuresSup(tx, eq(sirhHeuresSup.statut, 'en_attente'), 'asc');
    return rows.map((r) => ({ ...r, peutDecider: gestion || r.employeId !== moi }));
  });
}

/** Mon espace : mes demandes d'heures sup. (100 plus récentes). `[]` sans fiche employé. */
export async function listerMesHeuresSup(): Promise<HeuresSupVue[]> {
  const ctx = await exigerContexteSirhAction();
  return withTenant(ctx.entreprise.id, async (tx) => {
    const moi = await employeIdDeLUtilisateur(tx, ctx.utilisateur.id);
    if (!moi) return [];
    return selectHeuresSup(tx, eq(sirhHeuresSup.employeId, moi), 'desc', 100);
  });
}

/** Fiche employé de l'utilisateur courant (sélecteur figé en libre-service), ou null. */
export async function lireMonEmploye(): Promise<{ id: string; label: string } | null> {
  const ctx = await exigerContexteSirhAction();
  return withTenant(ctx.entreprise.id, async (tx) => {
    const moi = await employeIdDeLUtilisateur(tx, ctx.utilisateur.id);
    if (!moi) return null;
    const [e] = await tx
      .select({ nom: employes.nom, prenom: employes.prenom })
      .from(employes)
      .where(eq(employes.id, moi))
      .limit(1);
    return e ? { id: moi, label: `${e.nom} ${e.prenom}`.trim() } : null;
  });
}

// ─────────────────────────────────────────────────────────────
// Horaires
// ─────────────────────────────────────────────────────────────

export type HoraireVue = {
  id: string;
  nom: string;
  description: string | null;
  heuresLundi: string;
  heuresMardi: string;
  heuresMercredi: string;
  heuresJeudi: string;
  heuresVendredi: string;
  heuresSamedi: string;
  heuresDimanche: string;
  totalHebdo: number;
  parDefaut: boolean;
  actif: boolean;
  nbCollaborateurs: number;
};

/** Horaires (actifs et inactifs) avec le nombre de collaborateurs rattachés. */
export async function listerHoraires(): Promise<HoraireVue[]> {
  const ctx = await exigerContexteSirhAction(ROLES_SIRH_LECTURE);
  return withTenant(ctx.entreprise.id, async (tx) => {
    const horaires = await tx
      .select()
      .from(sirhHoraires)
      .where(isNull(sirhHoraires.deletedAt))
      .orderBy(asc(sirhHoraires.nom));
    const effectifs = await tx
      .select({ horaireId: sirhCollaborateurs.horaireId, n: count() })
      .from(sirhCollaborateurs)
      .where(isNull(sirhCollaborateurs.deletedAt))
      .groupBy(sirhCollaborateurs.horaireId);
    const parHoraire = new Map(effectifs.map((e) => [e.horaireId, e.n]));
    return horaires.map((h) => ({
      id: h.id,
      nom: h.nom,
      description: h.description,
      heuresLundi: h.heuresLundi,
      heuresMardi: h.heuresMardi,
      heuresMercredi: h.heuresMercredi,
      heuresJeudi: h.heuresJeudi,
      heuresVendredi: h.heuresVendredi,
      heuresSamedi: h.heuresSamedi,
      heuresDimanche: h.heuresDimanche,
      totalHebdo: heuresHebdo(horaireDepuisLigne(h)),
      parDefaut: h.parDefaut,
      actif: h.actif,
      nbCollaborateurs: parHoraire.get(h.id) ?? 0,
    }));
  });
}
