import 'server-only';

import { and, asc, count, desc, eq, inArray, isNull, or, type SQL } from 'drizzle-orm';
import { z } from 'zod';

import type { TenantContext } from '@/lib/auth/tenant-guards';
import { withTenant, type TenantTx } from '@/lib/db/with-tenant';
import { employes } from '@/db/schema/employes';
import {
  sirhModeleTaches,
  sirhModelesProcessus,
  sirhProcessus,
  sirhTaches,
} from '@/db/schema/test-sirh';
import { utilisateurs } from '@/db/schema/utilisateurs';

import { employeIdDeLUtilisateur } from '../acces';
import { aujourdhuiIso } from '../calendrier';
import { exigerContexteSirhAction } from '../contexte';
import { nomComplet } from '../format';
import {
  peutGererSirh,
  peutLireSirh,
  ROLES_SIRH_GESTION,
  ROLES_SIRH_LECTURE,
} from '../permissions';

import {
  calculerKpiOnboarding,
  estTacheEnRetard,
  STATUTS_TACHE_OUVERTS,
  syntheseProcessus,
  type KpiOnboarding,
} from './planification';
import type {
  EmployeLancement,
  ModeleLancement,
  ModeleProcessusLigne,
  ProcessusFiche,
  ProcessusLigne,
  TacheLigne,
} from './types';

/**
 * Lectures — Test SIRH › Onboarding / processus & tâches. Fonctions
 * `server-only` (pas des server actions) appelées depuis les Server Components.
 * Données sérialisables (dates ISO) ; aucune colonne sensible d'`employes`.
 */

const uuidValide = z.string().uuid();

// ─────────────────────────────────────────────────────────────
// Helpers internes (dans une transaction withTenant)
// ─────────────────────────────────────────────────────────────

/** Lignes de processus (+ synthèse des tâches) correspondant à `condition`. */
async function lireLignesProcessus(
  tx: TenantTx,
  condition: SQL | undefined,
  today: string,
): Promise<Array<ProcessusLigne & { createdBy: string | null }>> {
  const rows = await tx
    .select({
      id: sirhProcessus.id,
      libelle: sirhProcessus.libelle,
      typeProcessus: sirhProcessus.typeProcessus,
      statut: sirhProcessus.statut,
      dateReference: sirhProcessus.dateReference,
      employeId: sirhProcessus.employeId,
      employeNom: employes.nom,
      employePrenom: employes.prenom,
      modeleId: sirhProcessus.modeleId,
      modeleNom: sirhModelesProcessus.nom,
      createdAt: sirhProcessus.createdAt,
      createdBy: sirhProcessus.createdBy,
    })
    .from(sirhProcessus)
    .leftJoin(employes, eq(employes.id, sirhProcessus.employeId))
    .leftJoin(sirhModelesProcessus, eq(sirhModelesProcessus.id, sirhProcessus.modeleId))
    .where(and(isNull(sirhProcessus.deletedAt), condition))
    .orderBy(desc(sirhProcessus.dateReference), desc(sirhProcessus.createdAt));
  if (rows.length === 0) return [];

  const taches = await tx
    .select({
      processusId: sirhTaches.processusId,
      statut: sirhTaches.statut,
      echeance: sirhTaches.echeance,
    })
    .from(sirhTaches)
    .where(
      and(
        isNull(sirhTaches.deletedAt),
        inArray(
          sirhTaches.processusId,
          rows.map((r) => r.id),
        ),
      ),
    );
  const parProcessus = new Map<string, Array<(typeof taches)[number]>>();
  for (const t of taches) {
    if (!t.processusId) continue;
    const liste = parProcessus.get(t.processusId) ?? [];
    liste.push(t);
    parProcessus.set(t.processusId, liste);
  }

  return rows.map((r) => {
    const s = syntheseProcessus(parProcessus.get(r.id) ?? [], today);
    return {
      id: r.id,
      libelle: r.libelle,
      typeProcessus: r.typeProcessus,
      statut: r.statut,
      dateReference: r.dateReference,
      employeId: r.employeId,
      employeNom: nomComplet(r.employePrenom, r.employeNom),
      modeleId: r.modeleId,
      modeleNom: r.modeleNom,
      faites: s.faites,
      total: s.total,
      pourcent: s.pourcent,
      ouvertes: s.ouvertes,
      enRetard: s.enRetard,
      prochaineEcheance: s.prochaineEcheance,
      terminable: s.terminable,
      createdAt: r.createdAt.toISOString(),
      createdBy: r.createdBy,
    };
  });
}

/**
 * Tâches correspondant à `condition`, avec processus, collaborateur et compte
 * assigné. Tri « checklist » (ordre) ou « échéance » (plus urgentes d'abord).
 */
async function lireLignesTaches(
  tx: TenantTx,
  condition: SQL | undefined,
  today: string,
  tri: 'checklist' | 'echeance' = 'echeance',
): Promise<TacheLigne[]> {
  const rows = await tx
    .select({
      id: sirhTaches.id,
      processusId: sirhTaches.processusId,
      processusLibelle: sirhProcessus.libelle,
      typeProcessus: sirhProcessus.typeProcessus,
      employeId: sirhTaches.employeId,
      employeNom: employes.nom,
      employePrenom: employes.prenom,
      libelle: sirhTaches.libelle,
      description: sirhTaches.description,
      responsable: sirhTaches.responsable,
      assigneA: sirhTaches.assigneA,
      assigneEmail: utilisateurs.email,
      echeance: sirhTaches.echeance,
      statut: sirhTaches.statut,
      dateRealisation: sirhTaches.dateRealisation,
      ordre: sirhTaches.ordre,
    })
    .from(sirhTaches)
    .leftJoin(sirhProcessus, eq(sirhProcessus.id, sirhTaches.processusId))
    .leftJoin(employes, eq(employes.id, sirhTaches.employeId))
    .leftJoin(utilisateurs, eq(utilisateurs.id, sirhTaches.assigneA))
    .where(
      and(
        isNull(sirhTaches.deletedAt),
        // Tâches autonomes, ou rattachées à un processus non supprimé.
        or(isNull(sirhTaches.processusId), isNull(sirhProcessus.deletedAt)),
        condition,
      ),
    )
    .orderBy(
      ...(tri === 'checklist'
        ? [asc(sirhTaches.ordre), asc(sirhTaches.echeance)]
        : [asc(sirhTaches.echeance), asc(sirhTaches.ordre)]),
    );

  return rows.map((r) => ({
    id: r.id,
    processusId: r.processusId,
    processusLibelle: r.processusLibelle,
    typeProcessus: r.typeProcessus,
    employeId: r.employeId,
    employeNom: r.employeId ? nomComplet(r.employePrenom, r.employeNom) : null,
    libelle: r.libelle,
    description: r.description,
    responsable: r.responsable,
    assigneA: r.assigneA,
    assigneLabel: r.assigneEmail,
    echeance: r.echeance,
    statut: r.statut,
    dateRealisation: r.dateRealisation,
    ordre: r.ordre,
    enRetard: estTacheEnRetard({ statut: r.statut, echeance: r.echeance }, today),
  }));
}

/** Lecture du dossier d'un employé : gestion/lecture RH, ou le salarié lui-même. */
async function peutConsulterEmploye(
  tx: TenantTx,
  ctx: TenantContext,
  employeId: string,
): Promise<boolean> {
  if (peutLireSirh(ctx.utilisateur.role)) return true;
  return (await employeIdDeLUtilisateur(tx, ctx.utilisateur.id)) === employeId;
}

// ─────────────────────────────────────────────────────────────
// Processus
// ─────────────────────────────────────────────────────────────

/** Tous les processus du tenant (plus récents d'abord) avec la synthèse de leurs tâches. */
export async function listerProcessus(): Promise<ProcessusLigne[]> {
  const ctx = await exigerContexteSirhAction(ROLES_SIRH_LECTURE);
  const today = aujourdhuiIso();
  const lignes = await withTenant(ctx.entreprise.id, (tx) =>
    lireLignesProcessus(tx, undefined, today),
  );
  return lignes.map(({ createdBy: _createdBy, ...l }) => l);
}

/** Fiche d'un processus (checklist ordonnée), ou `null` s'il est absent / supprimé. */
export async function lireProcessus(id: string): Promise<ProcessusFiche | null> {
  const ctx = await exigerContexteSirhAction(ROLES_SIRH_LECTURE);
  if (!uuidValide.safeParse(id).success) return null;
  const today = aujourdhuiIso();
  return withTenant(ctx.entreprise.id, async (tx) => {
    const [ligne] = await lireLignesProcessus(tx, eq(sirhProcessus.id, id), today);
    if (!ligne) return null;
    const taches = await lireLignesTaches(tx, eq(sirhTaches.processusId, id), today, 'checklist');
    let lancePar: string | null = null;
    if (ligne.createdBy) {
      const [compte] = await tx
        .select({ email: utilisateurs.email })
        .from(utilisateurs)
        .where(eq(utilisateurs.id, ligne.createdBy))
        .limit(1);
      lancePar = compte?.email ?? null;
    }
    const { createdBy: _createdBy, ...processus } = ligne;
    return { ...processus, lancePar, taches };
  });
}

/**
 * Processus d'un collaborateur (dossier collaborateur, « Mon espace »).
 * Réservé aux rôles de lecture RH ou au salarié lui-même ; `[]` sinon.
 */
export async function listerProcessusEmploye(employeId: string): Promise<ProcessusLigne[]> {
  const ctx = await exigerContexteSirhAction();
  if (!uuidValide.safeParse(employeId).success) return [];
  const today = aujourdhuiIso();
  const lignes = await withTenant(ctx.entreprise.id, async (tx) => {
    if (!(await peutConsulterEmploye(tx, ctx, employeId))) return [];
    return lireLignesProcessus(tx, eq(sirhProcessus.employeId, employeId), today);
  });
  return lignes.map(({ createdBy: _createdBy, ...l }) => l);
}

// ─────────────────────────────────────────────────────────────
// Tâches
// ─────────────────────────────────────────────────────────────

/**
 * Tâches de l'écran Onboarding › Tâches : « Mes tâches » (assignées à
 * l'utilisateur courant) ou « Toutes » (gestionnaires RH uniquement — repli
 * sur « Mes tâches » sinon). Tous statuts, triées par échéance.
 */
export async function listerTachesOnboarding(
  opts: { vue?: 'mes' | 'toutes' } = {},
): Promise<TacheLigne[]> {
  const ctx = await exigerContexteSirhAction(ROLES_SIRH_LECTURE);
  const toutes = opts.vue === 'toutes' && peutGererSirh(ctx.utilisateur.role);
  const today = aujourdhuiIso();
  return withTenant(ctx.entreprise.id, (tx) =>
    lireLignesTaches(tx, toutes ? undefined : eq(sirhTaches.assigneA, ctx.utilisateur.id), today),
  );
}

/**
 * Tâches assignées à l'utilisateur courant (tous rôles : « Mon espace »,
 * tableau de bord). Par défaut uniquement les tâches ouvertes, les plus
 * urgentes d'abord (sans échéance en dernier).
 */
export async function listerMesTaches(
  opts: { inclureTerminees?: boolean } = {},
): Promise<TacheLigne[]> {
  const ctx = await exigerContexteSirhAction();
  const today = aujourdhuiIso();
  return withTenant(ctx.entreprise.id, (tx) =>
    lireLignesTaches(
      tx,
      and(
        eq(sirhTaches.assigneA, ctx.utilisateur.id),
        opts.inclureTerminees ? undefined : inArray(sirhTaches.statut, [...STATUTS_TACHE_OUVERTS]),
      ),
      today,
    ),
  );
}

/**
 * Tâches concernant un collaborateur (celles de ses processus et les tâches
 * autonomes qui le visent). Réservé aux rôles de lecture RH ou au salarié
 * lui-même ; `[]` sinon.
 */
export async function listerTachesEmploye(employeId: string): Promise<TacheLigne[]> {
  const ctx = await exigerContexteSirhAction();
  if (!uuidValide.safeParse(employeId).success) return [];
  const today = aujourdhuiIso();
  return withTenant(ctx.entreprise.id, async (tx) => {
    if (!(await peutConsulterEmploye(tx, ctx, employeId))) return [];
    return lireLignesTaches(
      tx,
      or(eq(sirhTaches.employeId, employeId), eq(sirhProcessus.employeId, employeId)),
      today,
    );
  });
}

// ─────────────────────────────────────────────────────────────
// Indicateurs
// ─────────────────────────────────────────────────────────────

/** KPI onboarding (tableau de bord, écran Processus) : processus en cours, tâches en retard / de la semaine. */
export async function kpiOnboarding(): Promise<KpiOnboarding> {
  const ctx = await exigerContexteSirhAction(ROLES_SIRH_LECTURE);
  const today = aujourdhuiIso();
  return withTenant(ctx.entreprise.id, async (tx) => {
    const processus = await tx
      .select({ typeProcessus: sirhProcessus.typeProcessus, statut: sirhProcessus.statut })
      .from(sirhProcessus)
      .where(and(isNull(sirhProcessus.deletedAt), eq(sirhProcessus.statut, 'en_cours')));
    const taches = await tx
      .select({ statut: sirhTaches.statut, echeance: sirhTaches.echeance })
      .from(sirhTaches)
      .where(
        and(isNull(sirhTaches.deletedAt), inArray(sirhTaches.statut, [...STATUTS_TACHE_OUVERTS])),
      );
    return calculerKpiOnboarding(processus, taches, today);
  });
}

// ─────────────────────────────────────────────────────────────
// Modèles & référentiels du lancement
// ─────────────────────────────────────────────────────────────

/** Modèles (actifs puis inactifs) avec leurs tâches ordonnées et leur usage. */
export async function listerModelesProcessus(): Promise<ModeleProcessusLigne[]> {
  const ctx = await exigerContexteSirhAction(ROLES_SIRH_GESTION);
  return withTenant(ctx.entreprise.id, async (tx) => {
    const modeles = await tx
      .select({
        id: sirhModelesProcessus.id,
        nom: sirhModelesProcessus.nom,
        typeProcessus: sirhModelesProcessus.typeProcessus,
        description: sirhModelesProcessus.description,
        actif: sirhModelesProcessus.actif,
      })
      .from(sirhModelesProcessus)
      .where(isNull(sirhModelesProcessus.deletedAt))
      .orderBy(desc(sirhModelesProcessus.actif), asc(sirhModelesProcessus.nom));
    if (modeles.length === 0) return [];

    const taches = await tx
      .select({
        id: sirhModeleTaches.id,
        modeleId: sirhModeleTaches.modeleId,
        libelle: sirhModeleTaches.libelle,
        description: sirhModeleTaches.description,
        responsable: sirhModeleTaches.responsable,
        delaiJours: sirhModeleTaches.delaiJours,
        ordre: sirhModeleTaches.ordre,
      })
      .from(sirhModeleTaches)
      .where(isNull(sirhModeleTaches.deletedAt))
      .orderBy(asc(sirhModeleTaches.ordre), asc(sirhModeleTaches.delaiJours));
    const usages = await tx
      .select({ modeleId: sirhProcessus.modeleId, n: count() })
      .from(sirhProcessus)
      .where(isNull(sirhProcessus.deletedAt))
      .groupBy(sirhProcessus.modeleId);
    const usageParModele = new Map(usages.map((u) => [u.modeleId, u.n]));

    return modeles.map((m) => ({
      ...m,
      nbProcessus: usageParModele.get(m.id) ?? 0,
      taches: taches.filter((t) => t.modeleId === m.id),
    }));
  });
}

/** Modèles ACTIFS proposés au lancement, avec leurs tâches (aperçu des échéances). */
export async function listerModelesPourLancement(): Promise<ModeleLancement[]> {
  const ctx = await exigerContexteSirhAction(ROLES_SIRH_GESTION);
  return withTenant(ctx.entreprise.id, async (tx) => {
    const modeles = await tx
      .select({
        id: sirhModelesProcessus.id,
        nom: sirhModelesProcessus.nom,
        typeProcessus: sirhModelesProcessus.typeProcessus,
      })
      .from(sirhModelesProcessus)
      .where(and(isNull(sirhModelesProcessus.deletedAt), eq(sirhModelesProcessus.actif, true)))
      .orderBy(asc(sirhModelesProcessus.nom));
    if (modeles.length === 0) return [];
    const taches = await tx
      .select({
        modeleId: sirhModeleTaches.modeleId,
        libelle: sirhModeleTaches.libelle,
        description: sirhModeleTaches.description,
        responsable: sirhModeleTaches.responsable,
        delaiJours: sirhModeleTaches.delaiJours,
        ordre: sirhModeleTaches.ordre,
      })
      .from(sirhModeleTaches)
      .where(
        and(
          isNull(sirhModeleTaches.deletedAt),
          inArray(
            sirhModeleTaches.modeleId,
            modeles.map((m) => m.id),
          ),
        ),
      )
      .orderBy(asc(sirhModeleTaches.ordre), asc(sirhModeleTaches.delaiJours));
    return modeles.map((m) => ({
      ...m,
      taches: taches.filter((t) => t.modeleId === m.id).map(({ modeleId: _modeleId, ...t }) => t),
    }));
  });
}

/**
 * Collaborateurs proposés au lancement (actifs d'abord) avec leurs dates
 * d'arrivée / de départ — colonnes explicites, aucune donnée sensible.
 */
export async function listerEmployesPourProcessus(): Promise<EmployeLancement[]> {
  const ctx = await exigerContexteSirhAction(ROLES_SIRH_GESTION);
  const rows = await withTenant(ctx.entreprise.id, (tx) =>
    tx
      .select({
        id: employes.id,
        nom: employes.nom,
        prenom: employes.prenom,
        actif: employes.actif,
        dateEmbauche: employes.dateEmbauche,
        dateEntree: employes.dateEntree,
        dateSortie: employes.dateSortie,
        dateFinContrat: employes.dateFinContrat,
      })
      .from(employes)
      .where(isNull(employes.deletedAt))
      .orderBy(desc(employes.actif), asc(employes.nom), asc(employes.prenom)),
  );
  return rows.map((r) => ({
    id: r.id,
    label: `${`${r.nom} ${r.prenom}`.trim()}${r.actif ? '' : ' (inactif)'}`,
    nomComplet: nomComplet(r.prenom, r.nom),
    actif: r.actif,
    dateArrivee: r.dateEmbauche ?? r.dateEntree,
    dateDepart: r.dateSortie ?? r.dateFinContrat,
  }));
}
