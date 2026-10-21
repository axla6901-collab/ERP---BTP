import 'server-only';

import { and, asc, count, desc, eq, gte, inArray, isNull, lte, or } from 'drizzle-orm';

import type { TenantContext } from '@/lib/auth/tenant-guards';
import { withTenant, type TenantTx } from '@/lib/db/with-tenant';
import { employes } from '@/db/schema/employes';
import {
  sirhAbsences,
  sirhCollaborateurs,
  sirhCompteurs,
  sirhDossiersDocuments,
  sirhEquipeMembres,
  sirhEquipes,
  sirhJoursFeries,
  sirhPeriodesBloquees,
  sirhSites,
  sirhTypesAbsence,
} from '@/db/schema/test-sirh';
import {
  STATUTS_DEMANDE,
  STATUTS_DEMANDE_ACTIFS,
  type StatutDemande,
} from '@/lib/validation/test-sirh/enums';

import { employeIdDeLUtilisateur } from '../acces';
import {
  ajouterJours,
  aujourdhuiIso,
  dernierJourDuMois,
  estDateIso,
  premierJourDuMois,
  type IsoDate,
} from '../calendrier';
import { exigerContexteSirhAction } from '../contexte';
import { nomComplet } from '../format';
import {
  peutGererSirh,
  peutLireSirh,
  ROLES_SIRH_LECTURE,
  ROLES_SIRH_VALIDATION,
} from '../permissions';

import type {
  AbsenceCalendrier,
  EmployeCalendrier,
  FerieCalendrier,
  TypeCalendrier,
} from './calendrier-equipe';
import {
  chargerAbsencesLignes,
  chargerCompteursLignes,
  chargerFeriesChomes,
  sitesDesEmployes,
} from './donnees';
import type { FiltresCalendrier, FiltresCompteurs, FiltresDemandes } from './filtres';
import { calculerKpiAbsences, type KpiAbsences } from './kpi';
import { couvertureJour, datesFeriesApplicables } from './regles';
import { trouverCompteurApplicable } from './soldes';
import type {
  AbsenceEnAttente,
  AbsenceLigne,
  AbsentDuJour,
  CompteurLigne,
  ContexteDemandeAbsence,
  JourFerieLigne,
  PeriodeBloqueeLigne,
  TypeAbsenceLigne,
  TypeAbsenceSolde,
} from './types';

/**
 * Lectures — Test SIRH › Absences & compteurs. Fonctions `server-only` (pas des
 * server actions) appelées depuis les Server Components. Données sérialisables.
 *
 * Droits :
 * - écrans de gestion (liste, calendrier, compteurs, paramètres) : LECTURE ;
 * - demandes en attente (Validations) : VALIDATION ;
 * - « Mes … » (Mon espace) : tout rôle, limité à la fiche de l'utilisateur ;
 * - dossier d'un employé : LECTURE, ou l'employé lui-même.
 */

// ─────────────────────────────────────────────────────────────
// Utilitaires
// ─────────────────────────────────────────────────────────────

/** Employé rattaché à l'utilisateur courant (libre-service), ou `null`. */
export async function lireMonEmployeId(): Promise<string | null> {
  const ctx = await exigerContexteSirhAction();
  return withTenant(ctx.entreprise.id, (tx) => employeIdDeLUtilisateur(tx, ctx.utilisateur.id));
}

function compteursVides(): Record<StatutDemande, number> {
  return Object.fromEntries(STATUTS_DEMANDE.map((s) => [s, 0])) as Record<StatutDemande, number>;
}

// ─────────────────────────────────────────────────────────────
// Demandes
// ─────────────────────────────────────────────────────────────

/**
 * Liste des demandes (écran Absences › Demandes) filtrée par statut, employé et
 * période (absences chevauchant [du, au]), + nombre de demandes par statut
 * (mêmes filtres employé / période) pour les pastilles.
 */
export async function listerDemandesAbsence(
  filtres: FiltresDemandes,
): Promise<{ lignes: AbsenceLigne[]; parStatut: Record<StatutDemande, number> }> {
  const ctx = await exigerContexteSirhAction(ROLES_SIRH_LECTURE);
  return withTenant(ctx.entreprise.id, async (tx) => {
    const portee = and(
      filtres.employeId ? eq(sirhAbsences.employeId, filtres.employeId) : undefined,
      filtres.du ? gte(sirhAbsences.dateFin, filtres.du) : undefined,
      filtres.au ? lte(sirhAbsences.dateDebut, filtres.au) : undefined,
    );
    const comptes = await tx
      .select({ statut: sirhAbsences.statut, n: count() })
      .from(sirhAbsences)
      .where(and(isNull(sirhAbsences.deletedAt), portee))
      .groupBy(sirhAbsences.statut);
    const parStatut = compteursVides();
    for (const c of comptes) parStatut[c.statut] = c.n;

    const lignes = await chargerAbsencesLignes(
      tx,
      and(
        portee,
        filtres.statut === 'toutes' ? undefined : eq(sirhAbsences.statut, filtres.statut),
      ),
      { ordre: filtres.statut === 'en_attente' ? 'asc' : 'desc', limite: 1000 },
    );
    return { lignes, parStatut };
  });
}

/**
 * Demandes en attente de décision (écran Validations), les plus anciennes
 * d'abord, avec le solde du compteur avant / après approbation.
 */
export async function listerAbsencesEnAttente(): Promise<AbsenceEnAttente[]> {
  const ctx = await exigerContexteSirhAction(ROLES_SIRH_VALIDATION);
  return withTenant(ctx.entreprise.id, async (tx) => {
    const moi = await employeIdDeLUtilisateur(tx, ctx.utilisateur.id);
    const lignes = await chargerAbsencesLignes(tx, eq(sirhAbsences.statut, 'en_attente'), {
      ordre: 'asc',
    });
    const avecSolde = lignes.filter((l) => l.avecSolde);
    const compteurs =
      avecSolde.length > 0
        ? await chargerCompteursLignes(
            tx,
            and(
              inArray(sirhCompteurs.employeId, [...new Set(avecSolde.map((l) => l.employeId))]),
              inArray(sirhCompteurs.typeAbsenceId, [
                ...new Set(avecSolde.map((l) => l.typeAbsenceId)),
              ]),
            ),
          )
        : [];
    return lignes.map((l) => {
      const compteur = l.avecSolde
        ? trouverCompteurApplicable(compteurs, {
            employeId: l.employeId,
            typeAbsenceId: l.typeAbsenceId,
            date: l.dateDebut,
          })
        : null;
      return {
        ...l,
        estPropreDemande: moi !== null && l.employeId === moi,
        soldeAvant: compteur ? compteur.solde : null,
        soldeApres: compteur ? Math.round((compteur.solde - l.duree) * 100) / 100 : null,
      };
    });
  });
}

/** Mes demandes d'absence (Mon espace), les plus récentes d'abord. */
export async function listerMesAbsences(): Promise<AbsenceLigne[]> {
  const ctx = await exigerContexteSirhAction();
  return withTenant(ctx.entreprise.id, async (tx) => {
    const moi = await employeIdDeLUtilisateur(tx, ctx.utilisateur.id);
    if (!moi) return [];
    return chargerAbsencesLignes(tx, eq(sirhAbsences.employeId, moi));
  });
}

/** Mes compteurs de droits avec leur solde (Mon espace). */
export async function listerMesCompteurs(): Promise<CompteurLigne[]> {
  const ctx = await exigerContexteSirhAction();
  return withTenant(ctx.entreprise.id, async (tx) => {
    const moi = await employeIdDeLUtilisateur(tx, ctx.utilisateur.id);
    if (!moi) return [];
    return chargerCompteursLignes(tx, eq(sirhCompteurs.employeId, moi));
  });
}

/** L'utilisateur peut-il consulter les absences de cet employé ? (LECTURE ou soi-même) */
async function peutConsulterEmploye(
  tx: TenantTx,
  ctx: TenantContext,
  employeId: string,
): Promise<boolean> {
  if (peutLireSirh(ctx.utilisateur.role)) return true;
  return (await employeIdDeLUtilisateur(tx, ctx.utilisateur.id)) === employeId;
}

/** Absences d'un employé (dossier collaborateur) — vide si non autorisé. */
export async function listerAbsencesEmploye(employeId: string): Promise<AbsenceLigne[]> {
  const ctx = await exigerContexteSirhAction();
  return withTenant(ctx.entreprise.id, async (tx) => {
    if (!(await peutConsulterEmploye(tx, ctx, employeId))) return [];
    return chargerAbsencesLignes(tx, eq(sirhAbsences.employeId, employeId));
  });
}

/** Compteurs d'un employé (dossier collaborateur) — vide si non autorisé. */
export async function listerCompteursEmploye(employeId: string): Promise<CompteurLigne[]> {
  const ctx = await exigerContexteSirhAction();
  return withTenant(ctx.entreprise.id, async (tx) => {
    if (!(await peutConsulterEmploye(tx, ctx, employeId))) return [];
    return chargerCompteursLignes(tx, eq(sirhCompteurs.employeId, employeId));
  });
}

// ─────────────────────────────────────────────────────────────
// Indicateurs (tableau de bord)
// ─────────────────────────────────────────────────────────────

/** KPI : en attente, absents aujourd'hui, jours posés ce mois, arrêts maladie en cours. */
export async function kpiAbsences(today: IsoDate = aujourdhuiIso()): Promise<KpiAbsences> {
  const ctx = await exigerContexteSirhAction(ROLES_SIRH_LECTURE);
  const annee = Number(today.slice(0, 4));
  const mois = Number(today.slice(5, 7));
  const debutMois = premierJourDuMois(annee, mois);
  const finMois = dernierJourDuMois(annee, mois);

  return withTenant(ctx.entreprise.id, async (tx) => {
    const [attente] = await tx
      .select({ n: count() })
      .from(sirhAbsences)
      .where(and(isNull(sirhAbsences.deletedAt), eq(sirhAbsences.statut, 'en_attente')));
    const absences = await tx
      .select({
        employeId: sirhAbsences.employeId,
        statut: sirhAbsences.statut,
        dateDebut: sirhAbsences.dateDebut,
        dateFin: sirhAbsences.dateFin,
        demiJourneeDebut: sirhAbsences.demiJourneeDebut,
        demiJourneeFin: sirhAbsences.demiJourneeFin,
        duree: sirhAbsences.duree,
        unite: sirhTypesAbsence.uniteDecompte,
        categorie: sirhTypesAbsence.categorie,
        necessiteValidation: sirhTypesAbsence.necessiteValidation,
      })
      .from(sirhAbsences)
      .innerJoin(sirhTypesAbsence, eq(sirhTypesAbsence.id, sirhAbsences.typeAbsenceId))
      .where(
        and(
          isNull(sirhAbsences.deletedAt),
          eq(sirhAbsences.statut, 'approuvee'),
          lte(sirhAbsences.dateDebut, finMois),
          gte(sirhAbsences.dateFin, debutMois),
        ),
      );
    const feries = await chargerFeriesChomes(tx, debutMois, ajouterJours(finMois, 1));
    const sites = await sitesDesEmployes(tx, [...new Set(absences.map((a) => a.employeId))]);
    return calculerKpiAbsences({
      absences,
      enAttente: attente?.n ?? 0,
      today,
      feriesEmploye: (employeId) => datesFeriesApplicables(feries, sites.get(employeId) ?? null),
    });
  });
}

/** Absences approuvées couvrant `today` (tableau de bord « Absents aujourd'hui »). */
export async function absentsDuJour(today: IsoDate = aujourdhuiIso()): Promise<AbsentDuJour[]> {
  const ctx = await exigerContexteSirhAction(ROLES_SIRH_LECTURE);
  const lignes = await withTenant(ctx.entreprise.id, (tx) =>
    chargerAbsencesLignes(
      tx,
      and(
        eq(sirhAbsences.statut, 'approuvee'),
        lte(sirhAbsences.dateDebut, today),
        gte(sirhAbsences.dateFin, today),
      ),
      { ordre: 'asc' },
    ),
  );
  return lignes
    .map((l) => {
      const c = couvertureJour(l, today);
      const demiJournee: AbsentDuJour['demiJournee'] =
        c.matin && c.apresMidi ? null : c.matin ? 'matin' : 'apres_midi';
      return {
        absenceId: l.id,
        employeId: l.employeId,
        employe: l.employe,
        typeCode: l.typeCode,
        typeLibelle: l.typeLibelle,
        couleur: l.couleur,
        dateDebut: l.dateDebut,
        dateFin: l.dateFin,
        demiJournee,
      };
    })
    .sort((a, b) => a.employe.localeCompare(b.employe, 'fr'));
}

// ─────────────────────────────────────────────────────────────
// Calendrier d'équipe
// ─────────────────────────────────────────────────────────────

/**
 * Données du planning mensuel : employés (actifs, ou ayant une absence dans le
 * mois) filtrés par site / équipe, absences actives du mois, fériés chômés du
 * mois, types d'absence (légende).
 */
export async function chargerCalendrierEquipe(f: FiltresCalendrier): Promise<{
  employes: EmployeCalendrier[];
  absences: AbsenceCalendrier[];
  feries: FerieCalendrier[];
  types: TypeCalendrier[];
}> {
  const ctx = await exigerContexteSirhAction(ROLES_SIRH_LECTURE);
  const debut = premierJourDuMois(f.annee, f.mois);
  const fin = dernierJourDuMois(f.annee, f.mois);

  return withTenant(ctx.entreprise.id, async (tx) => {
    const absences = await tx
      .select({
        id: sirhAbsences.id,
        employeId: sirhAbsences.employeId,
        typeAbsenceId: sirhAbsences.typeAbsenceId,
        dateDebut: sirhAbsences.dateDebut,
        dateFin: sirhAbsences.dateFin,
        demiJourneeDebut: sirhAbsences.demiJourneeDebut,
        demiJourneeFin: sirhAbsences.demiJourneeFin,
        statut: sirhAbsences.statut,
      })
      .from(sirhAbsences)
      .where(
        and(
          isNull(sirhAbsences.deletedAt),
          inArray(sirhAbsences.statut, [...STATUTS_DEMANDE_ACTIFS]),
          lte(sirhAbsences.dateDebut, fin),
          gte(sirhAbsences.dateFin, debut),
        ),
      );

    const lignesEmployes = await tx
      .select({
        id: employes.id,
        nom: employes.nom,
        prenom: employes.prenom,
        actif: employes.actif,
        siteId: sirhCollaborateurs.siteId,
      })
      .from(employes)
      .leftJoin(
        sirhCollaborateurs,
        and(eq(sirhCollaborateurs.employeId, employes.id), isNull(sirhCollaborateurs.deletedAt)),
      )
      .where(isNull(employes.deletedAt))
      .orderBy(asc(employes.nom), asc(employes.prenom));

    let membres: Set<string> | null = null;
    if (f.equipeId) {
      const rows = await tx
        .select({ employeId: sirhEquipeMembres.employeId })
        .from(sirhEquipeMembres)
        .where(
          and(
            eq(sirhEquipeMembres.equipeId, f.equipeId),
            isNull(sirhEquipeMembres.deletedAt),
            or(isNull(sirhEquipeMembres.dateDebut), lte(sirhEquipeMembres.dateDebut, fin)),
            or(isNull(sirhEquipeMembres.dateFin), gte(sirhEquipeMembres.dateFin, debut)),
          ),
        );
      membres = new Set(rows.map((r) => r.employeId));
    }

    const avecAbsence = new Set(absences.map((a) => a.employeId));
    const vus = new Set<string>();
    const employesAffiches: EmployeCalendrier[] = [];
    for (const e of lignesEmployes) {
      if (vus.has(e.id)) continue;
      vus.add(e.id);
      if (!e.actif && !avecAbsence.has(e.id)) continue;
      if (f.siteId && e.siteId !== f.siteId) continue;
      if (membres && !membres.has(e.id)) continue;
      employesAffiches.push({ id: e.id, label: nomComplet(e.prenom, e.nom), siteId: e.siteId });
    }
    const idsAffiches = new Set(employesAffiches.map((e) => e.id));

    const feries = await chargerFeriesChomes(tx, debut, fin);
    const types = await tx
      .select({
        id: sirhTypesAbsence.id,
        code: sirhTypesAbsence.code,
        libelle: sirhTypesAbsence.libelle,
        couleur: sirhTypesAbsence.couleur,
        uniteDecompte: sirhTypesAbsence.uniteDecompte,
      })
      .from(sirhTypesAbsence)
      .where(isNull(sirhTypesAbsence.deletedAt))
      .orderBy(asc(sirhTypesAbsence.ordre), asc(sirhTypesAbsence.libelle));

    return {
      employes: employesAffiches,
      absences: absences.filter((a) => idsAffiches.has(a.employeId)),
      feries: feries.map((x) => ({ date: x.date, libelle: x.libelle, siteId: x.siteId })),
      types,
    };
  });
}

// ─────────────────────────────────────────────────────────────
// Compteurs
// ─────────────────────────────────────────────────────────────

/** Compteurs (écran Compteurs) : période chevauchant le filtre, type optionnel. */
export async function listerCompteurs(filtres: FiltresCompteurs): Promise<CompteurLigne[]> {
  const ctx = await exigerContexteSirhAction(ROLES_SIRH_LECTURE);
  return withTenant(ctx.entreprise.id, (tx) =>
    chargerCompteursLignes(
      tx,
      and(
        filtres.periode ? lte(sirhCompteurs.periodeDebut, filtres.periode.fin) : undefined,
        filtres.periode ? gte(sirhCompteurs.periodeFin, filtres.periode.debut) : undefined,
        filtres.typeAbsenceId ? eq(sirhCompteurs.typeAbsenceId, filtres.typeAbsenceId) : undefined,
      ),
    ),
  );
}

/** Types d'absence actifs décomptés d'un compteur (création / initialisation). */
export async function listerTypesAbsenceSolde(): Promise<TypeAbsenceSolde[]> {
  const ctx = await exigerContexteSirhAction(ROLES_SIRH_LECTURE);
  const rows = await withTenant(ctx.entreprise.id, (tx) =>
    tx
      .select({
        id: sirhTypesAbsence.id,
        code: sirhTypesAbsence.code,
        libelle: sirhTypesAbsence.libelle,
        uniteDecompte: sirhTypesAbsence.uniteDecompte,
      })
      .from(sirhTypesAbsence)
      .where(
        and(
          isNull(sirhTypesAbsence.deletedAt),
          eq(sirhTypesAbsence.actif, true),
          eq(sirhTypesAbsence.avecSolde, true),
        ),
      )
      .orderBy(asc(sirhTypesAbsence.ordre), asc(sirhTypesAbsence.libelle)),
  );
  return rows.map((r) => ({
    id: r.id,
    code: r.code,
    label: `${r.libelle} (${r.code})`,
    uniteDecompte: r.uniteDecompte,
  }));
}

// ─────────────────────────────────────────────────────────────
// Dialogue de demande
// ─────────────────────────────────────────────────────────────

async function chargerContexte(
  tx: TenantTx,
  portee: { tous: true } | { employeIds: string[] },
): Promise<ContexteDemandeAbsence> {
  const annee = Number(aujourdhuiIso().slice(0, 4));
  const debutFenetre = `${annee - 1}-01-01`;
  const finFenetre = `${annee + 2}-12-31`;

  const types = await tx
    .select({
      id: sirhTypesAbsence.id,
      code: sirhTypesAbsence.code,
      libelle: sirhTypesAbsence.libelle,
      couleur: sirhTypesAbsence.couleur,
      uniteDecompte: sirhTypesAbsence.uniteDecompte,
      avecSolde: sirhTypesAbsence.avecSolde,
      justificatifRequis: sirhTypesAbsence.justificatifRequis,
      necessiteValidation: sirhTypesAbsence.necessiteValidation,
    })
    .from(sirhTypesAbsence)
    .where(and(isNull(sirhTypesAbsence.deletedAt), eq(sirhTypesAbsence.actif, true)))
    .orderBy(asc(sirhTypesAbsence.ordre), asc(sirhTypesAbsence.libelle));

  const [dossier] = await tx
    .select({ id: sirhDossiersDocuments.id })
    .from(sirhDossiersDocuments)
    .where(
      and(eq(sirhDossiersDocuments.nom, 'Justificatifs'), isNull(sirhDossiersDocuments.deletedAt)),
    )
    .limit(1);

  const base = {
    types: types.map(({ libelle, ...t }) => ({ ...t, label: `${libelle} (${t.code})` })),
    feries: [] as ContexteDemandeAbsence['feries'],
    dossierJustificatifsId: dossier?.id ?? null,
  };
  if ('employeIds' in portee && portee.employeIds.length === 0) {
    return { ...base, employes: [], soldes: [] };
  }

  const lignesEmployes = await tx
    .select({
      id: employes.id,
      nom: employes.nom,
      prenom: employes.prenom,
      siteId: sirhCollaborateurs.siteId,
    })
    .from(employes)
    .leftJoin(
      sirhCollaborateurs,
      and(eq(sirhCollaborateurs.employeId, employes.id), isNull(sirhCollaborateurs.deletedAt)),
    )
    .where(
      and(
        isNull(employes.deletedAt),
        'tous' in portee ? eq(employes.actif, true) : inArray(employes.id, portee.employeIds),
      ),
    )
    .orderBy(asc(employes.nom), asc(employes.prenom));
  const parId = new Map<string, ContexteDemandeAbsence['employes'][number]>();
  for (const e of lignesEmployes) {
    if (!parId.has(e.id)) {
      parId.set(e.id, { id: e.id, label: `${e.nom} ${e.prenom}`.trim(), siteId: e.siteId });
    }
  }
  const listeEmployes = [...parId.values()];

  const feries = await chargerFeriesChomes(tx, debutFenetre, finFenetre);
  const compteurs = await chargerCompteursLignes(
    tx,
    and(
      'tous' in portee ? undefined : inArray(sirhCompteurs.employeId, portee.employeIds),
      gte(sirhCompteurs.periodeFin, debutFenetre),
    ),
  );

  return {
    ...base,
    employes: listeEmployes,
    feries: feries.map((x) => ({ date: x.date, siteId: x.siteId })),
    soldes: compteurs.map((c) => ({
      employeId: c.employeId,
      typeAbsenceId: c.typeAbsenceId,
      periodeDebut: c.periodeDebut,
      periodeFin: c.periodeFin,
      solde: c.solde,
      soldePrevisionnel: c.soldePrevisionnel,
    })),
  };
}

/**
 * Contexte du dialogue de demande (types actifs, employés + site, fériés
 * chômés N-1 → N+2, soldes, dossier « Justificatifs ») :
 * - gestionnaire RH : `employeId` donné → cet employé ; sinon tous les actifs ;
 * - autres rôles : uniquement leur propre fiche (vide si non rattachés).
 */
export async function chargerContexteDemandeAbsence(
  employeId?: string,
): Promise<ContexteDemandeAbsence> {
  const ctx = await exigerContexteSirhAction();
  return withTenant(ctx.entreprise.id, async (tx) => {
    if (peutGererSirh(ctx.utilisateur.role)) {
      return chargerContexte(tx, employeId ? { employeIds: [employeId] } : { tous: true });
    }
    const moi = await employeIdDeLUtilisateur(tx, ctx.utilisateur.id);
    const autorise = moi !== null && (!employeId || employeId === moi);
    return chargerContexte(tx, { employeIds: autorise && moi ? [moi] : [] });
  });
}

/** Contexte du dialogue de demande pour la fiche de l'utilisateur courant (Mon espace). */
export async function chargerMonContexteDemandeAbsence(): Promise<ContexteDemandeAbsence> {
  const ctx = await exigerContexteSirhAction();
  return withTenant(ctx.entreprise.id, async (tx) => {
    const moi = await employeIdDeLUtilisateur(tx, ctx.utilisateur.id);
    return chargerContexte(tx, { employeIds: moi ? [moi] : [] });
  });
}

/**
 * Jours fériés CHÔMÉS de [debut, fin] applicables à un site (fériés globaux +
 * ceux du site ; `siteId` null = globaux seulement), triés par date. Référentiel
 * non sensible : tout rôle (ex. heures théoriques du module Temps).
 */
export async function chargerFeriesPeriode(
  debut: IsoDate,
  fin: IsoDate,
  siteId: string | null = null,
): Promise<FerieCalendrier[]> {
  const ctx = await exigerContexteSirhAction();
  if (!estDateIso(debut) || !estDateIso(fin) || fin < debut) return [];
  const feries = await withTenant(ctx.entreprise.id, (tx) => chargerFeriesChomes(tx, debut, fin));
  return feries
    .filter((f) => f.siteId === null || f.siteId === siteId)
    .map((f) => ({ date: f.date, libelle: f.libelle, siteId: f.siteId }));
}

// ─────────────────────────────────────────────────────────────
// Paramètres
// ─────────────────────────────────────────────────────────────

/** Types d'absence (actifs et inactifs) avec leur nombre d'utilisations. */
export async function listerTypesAbsence(): Promise<TypeAbsenceLigne[]> {
  const ctx = await exigerContexteSirhAction(ROLES_SIRH_LECTURE);
  return withTenant(ctx.entreprise.id, async (tx) => {
    const types = await tx
      .select()
      .from(sirhTypesAbsence)
      .where(isNull(sirhTypesAbsence.deletedAt))
      .orderBy(asc(sirhTypesAbsence.ordre), asc(sirhTypesAbsence.libelle));
    const nbAbsences = await tx
      .select({ typeId: sirhAbsences.typeAbsenceId, n: count() })
      .from(sirhAbsences)
      .where(isNull(sirhAbsences.deletedAt))
      .groupBy(sirhAbsences.typeAbsenceId);
    const nbCompteurs = await tx
      .select({ typeId: sirhCompteurs.typeAbsenceId, n: count() })
      .from(sirhCompteurs)
      .where(isNull(sirhCompteurs.deletedAt))
      .groupBy(sirhCompteurs.typeAbsenceId);
    const absParType = new Map(nbAbsences.map((r) => [r.typeId, r.n]));
    const cptParType = new Map(nbCompteurs.map((r) => [r.typeId, r.n]));
    return types.map((t) => ({
      id: t.id,
      code: t.code,
      libelle: t.libelle,
      categorie: t.categorie,
      uniteDecompte: t.uniteDecompte,
      avecSolde: t.avecSolde,
      necessiteValidation: t.necessiteValidation,
      justificatifRequis: t.justificatifRequis,
      remuneree: t.remuneree,
      couleur: t.couleur,
      codeRubriquePaie: t.codeRubriquePaie,
      actif: t.actif,
      ordre: t.ordre,
      nbAbsences: absParType.get(t.id) ?? 0,
      nbCompteurs: cptParType.get(t.id) ?? 0,
    }));
  });
}

/** Jours fériés d'une année (chômés ou non), avec le site de rattachement. */
export async function listerJoursFeries(annee: number): Promise<JourFerieLigne[]> {
  const ctx = await exigerContexteSirhAction(ROLES_SIRH_LECTURE);
  const rows = await withTenant(ctx.entreprise.id, (tx) =>
    tx
      .select({
        id: sirhJoursFeries.id,
        dateFerie: sirhJoursFeries.dateFerie,
        libelle: sirhJoursFeries.libelle,
        siteId: sirhJoursFeries.siteId,
        site: sirhSites.nom,
        chome: sirhJoursFeries.chome,
      })
      .from(sirhJoursFeries)
      .leftJoin(sirhSites, eq(sirhSites.id, sirhJoursFeries.siteId))
      .where(
        and(
          isNull(sirhJoursFeries.deletedAt),
          gte(sirhJoursFeries.dateFerie, `${annee}-01-01`),
          lte(sirhJoursFeries.dateFerie, `${annee}-12-31`),
        ),
      )
      .orderBy(asc(sirhJoursFeries.dateFerie), asc(sirhSites.nom)),
  );
  return rows;
}

/** Périodes bloquées (les plus récentes d'abord), avec type et équipe visés. */
export async function listerPeriodesBloquees(): Promise<PeriodeBloqueeLigne[]> {
  const ctx = await exigerContexteSirhAction(ROLES_SIRH_LECTURE);
  return withTenant(ctx.entreprise.id, (tx) =>
    tx
      .select({
        id: sirhPeriodesBloquees.id,
        libelle: sirhPeriodesBloquees.libelle,
        dateDebut: sirhPeriodesBloquees.dateDebut,
        dateFin: sirhPeriodesBloquees.dateFin,
        typeAbsenceId: sirhPeriodesBloquees.typeAbsenceId,
        typeLibelle: sirhTypesAbsence.libelle,
        typeCouleur: sirhTypesAbsence.couleur,
        equipeId: sirhPeriodesBloquees.equipeId,
        equipe: sirhEquipes.nom,
        motif: sirhPeriodesBloquees.motif,
      })
      .from(sirhPeriodesBloquees)
      .leftJoin(sirhTypesAbsence, eq(sirhTypesAbsence.id, sirhPeriodesBloquees.typeAbsenceId))
      .leftJoin(sirhEquipes, eq(sirhEquipes.id, sirhPeriodesBloquees.equipeId))
      .where(isNull(sirhPeriodesBloquees.deletedAt))
      .orderBy(desc(sirhPeriodesBloquees.dateDebut)),
  );
}
