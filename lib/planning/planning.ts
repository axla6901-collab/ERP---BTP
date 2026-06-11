'use server';

import { and, asc, eq, inArray, isNull, max as sqlMax } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';

import { auditLogIn } from '@/lib/audit/log';
import { peutAdministrer } from '@/lib/admin/permissions';
import { requireTenantContextWithMfa } from '@/lib/auth/tenant-guards';
import type { ActionResult } from '@/lib/catalogue/types';
import { ROLES_PLANNING_WRITE } from '@/lib/planning/permissions';
import { agregerSommaireChantiers } from '@/lib/planning/sommaire';
import { withTenant } from '@/lib/db/with-tenant';
import {
  chantierTacheEquipe,
  chantierTaches,
  chantiers,
  type Chantier,
  type ChantierTache,
  type ChantierTacheEquipe,
} from '@/db/schema/chantiers';
import { entreprises } from '@/db/schema/entreprises';
import { utilisateurs } from '@/db/schema/utilisateurs';
import {
  planningCascadeSchema,
  planningCreationSchema,
  planningDuplicationSchema,
  planningEquipeAjoutSchema,
  planningEquipeMajSchema,
  planningFlagSchema,
  planningTacheSchema,
  type PlanningCascadeInput,
  type PlanningCreationInput,
  type PlanningDuplicationInput,
  type PlanningEquipeAjoutInput,
  type PlanningEquipeMajInput,
  type PlanningFlagInput,
  type PlanningTacheInput,
} from '@/lib/validation/planning';

// ─────────────────────────────────────────────────────────────
// Types renvoyés au client (sérialisables)
// ─────────────────────────────────────────────────────────────

export type PlanningEquipeRow = ChantierTacheEquipe & {
  utilisateurEmail: string | null;
};

export type PlanningTacheRow = ChantierTache & {
  equipe: PlanningEquipeRow[];
};

export type PlanningChantierData = {
  chantier: Chantier;
  taches: PlanningTacheRow[];
};

export type PlanningChantierSommaire = {
  id: string;
  numero: string;
  libelle: string;
  statut: Chantier['statut'];
  dateDebutPrevue: string | null;
  dateFinPrevue: string | null;
  nbTaches: number;
  /**
   * Avancement global du chantier (0-100), arrondi à l'entier.
   * Moyenne pondérée par `heures_planifiees` sur les tâches actives ; si toutes
   * les tâches ont 0h planifiée, fallback sur la moyenne arithmétique simple.
   * `null` si le chantier n'a aucune tâche active.
   */
  avancementPourcent: number | null;
  /**
   * Plage de dates planifiées du chantier, calculée sur ses tâches actives :
   * plus petite `date_debut_prevue` / plus grande `date_fin_prevue` (ISO
   * `AAAA-MM-JJ`). `null` si aucune tâche datée. Sert à dessiner la barre
   * projet de la vue d'ensemble (cf. `gantt-multi-chantier`).
   */
  dateMinTaches: string | null;
  dateMaxTaches: string | null;
};

// ─────────────────────────────────────────────────────────────
// Feature flag entreprise
// ─────────────────────────────────────────────────────────────

/**
 * Bascule l'option Planning au niveau de l'entreprise courante.
 * Réservé aux administrateurs tenant (cf. `peutAdministrer`).
 *
 * Revalide la sidebar (toutes les pages /[slug]) pour que l'entrée
 * Planning apparaisse/disparaisse immédiatement.
 */
export async function setPlanningActive(
  input: PlanningFlagInput,
): Promise<ActionResult<{ planningActive: boolean }>> {
  const parsed = planningFlagSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: 'Données invalides.' };
  }
  const ctx = await requireTenantContextWithMfa();
  if (!peutAdministrer(ctx.utilisateur.role)) {
    return { ok: false, error: 'Accès refusé : rôle administrateur requis.' };
  }

  await withTenant(ctx.entreprise.id, async (tx) => {
    const [before] = await tx
      .select({ planningActive: entreprises.planningActive })
      .from(entreprises)
      .where(eq(entreprises.id, ctx.entreprise.id));
    await tx
      .update(entreprises)
      .set({ planningActive: parsed.data.actif, updatedAt: new Date() })
      .where(eq(entreprises.id, ctx.entreprise.id));
    await auditLogIn(tx, {
      action: 'update',
      tableName: 'entreprises',
      rowId: ctx.entreprise.id,
      before,
      after: { planningActive: parsed.data.actif },
    });
  });

  // Sidebar/header dépend du flag : revalide tout l'espace tenant.
  revalidatePath(`/${ctx.entreprise.slug}`, 'layout');
  return { ok: true, data: { planningActive: parsed.data.actif } };
}

// ─────────────────────────────────────────────────────────────
// Lecture du flag (helper léger pour le layout tenant)
// ─────────────────────────────────────────────────────────────

export async function lirePlanningActif(): Promise<boolean> {
  const ctx = await requireTenantContextWithMfa();
  return withTenant(ctx.entreprise.id, async (tx) => {
    const [row] = await tx
      .select({ planningActive: entreprises.planningActive })
      .from(entreprises)
      .where(eq(entreprises.id, ctx.entreprise.id));
    return row?.planningActive ?? false;
  });
}

// ─────────────────────────────────────────────────────────────
// Liste de chantiers (pour le sélecteur du top-level /planning)
// ─────────────────────────────────────────────────────────────

export async function listerChantiersPlanning(): Promise<PlanningChantierSommaire[]> {
  const ctx = await requireTenantContextWithMfa();
  return withTenant(ctx.entreprise.id, async (tx) => {
    const rows = await tx
      .select({
        id: chantiers.id,
        numero: chantiers.numero,
        libelle: chantiers.libelle,
        statut: chantiers.statut,
        dateDebutPrevue: chantiers.dateDebutPrevue,
        dateFinPrevue: chantiers.dateFinPrevue,
      })
      .from(chantiers)
      .where(isNull(chantiers.deletedAt))
      .orderBy(asc(chantiers.numero));

    // Tâches non-supprimées avec ce qu'il faut pour calculer l'avancement
    // pondéré et la plage de dates (1 query pour tous, agrégation pure côté
    // JS — ≤ quelques milliers de tâches par tenant, négligeable).
    const taches = await tx
      .select({
        chantierId: chantierTaches.chantierId,
        avancementPourcent: chantierTaches.avancementPourcent,
        heuresPlanifiees: chantierTaches.heuresPlanifiees,
        dateDebutPrevue: chantierTaches.dateDebutPrevue,
        dateFinPrevue: chantierTaches.dateFinPrevue,
      })
      .from(chantierTaches)
      .where(isNull(chantierTaches.deletedAt));

    const parChantier = agregerSommaireChantiers(taches);

    return rows.map((r) => {
      const acc = parChantier.get(r.id);
      return {
        id: r.id,
        numero: r.numero,
        libelle: r.libelle,
        statut: r.statut,
        dateDebutPrevue: r.dateDebutPrevue,
        dateFinPrevue: r.dateFinPrevue,
        nbTaches: acc?.nbTaches ?? 0,
        avancementPourcent: acc?.avancementPourcent ?? null,
        dateMinTaches: acc?.dateMinTaches ?? null,
        dateMaxTaches: acc?.dateMaxTaches ?? null,
      };
    });
  });
}

// ─────────────────────────────────────────────────────────────
// Lecture complète du planning d'un chantier (Gantt)
// ─────────────────────────────────────────────────────────────

export async function lirePlanningChantier(
  chantierId: string,
): Promise<PlanningChantierData | null> {
  const ctx = await requireTenantContextWithMfa();
  return withTenant(ctx.entreprise.id, async (tx) => {
    const [chantier] = await tx
      .select()
      .from(chantiers)
      .where(and(eq(chantiers.id, chantierId), isNull(chantiers.deletedAt)));
    if (!chantier) return null;

    const taches = await tx
      .select()
      .from(chantierTaches)
      .where(and(eq(chantierTaches.chantierId, chantierId), isNull(chantierTaches.deletedAt)))
      .orderBy(asc(chantierTaches.ordre), asc(chantierTaches.createdAt));

    const equipe = await tx
      .select({
        row: chantierTacheEquipe,
        utilisateurEmail: utilisateurs.email,
      })
      .from(chantierTacheEquipe)
      .leftJoin(utilisateurs, eq(chantierTacheEquipe.utilisateurId, utilisateurs.id))
      .where(isNull(chantierTacheEquipe.deletedAt))
      .orderBy(asc(chantierTacheEquipe.ordre), asc(chantierTacheEquipe.createdAt));

    // Index équipe par tacheId, filtré aux tâches du chantier courant.
    const idsTaches = new Set(taches.map((t) => t.id));
    const parTache = new Map<string, PlanningEquipeRow[]>();
    for (const e of equipe) {
      if (!idsTaches.has(e.row.tacheId)) continue;
      const liste = parTache.get(e.row.tacheId) ?? [];
      liste.push({ ...e.row, utilisateurEmail: e.utilisateurEmail });
      parTache.set(e.row.tacheId, liste);
    }

    return {
      chantier,
      taches: taches.map((t) => ({ ...t, equipe: parTache.get(t.id) ?? [] })),
    };
  });
}

// ─────────────────────────────────────────────────────────────
// Sauvegarde drawer : met à jour une tâche existante (création en phase B)
// ─────────────────────────────────────────────────────────────

export async function enregistrerTachePlanning(
  input: PlanningTacheInput,
): Promise<ActionResult<{ id: string }>> {
  const parsed = planningTacheSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: 'Données invalides.',
      fieldErrors: parsed.error.flatten().fieldErrors,
    };
  }
  const ctx = await requireTenantContextWithMfa();
  if (!ROLES_PLANNING_WRITE.includes(ctx.utilisateur.role)) {
    return { ok: false, error: 'Accès refusé.' };
  }

  const data = parsed.data;

  // Empêche un cycle de dépendances ; on parcourt la chaîne predecesseur_id
  // remontée. La règle "no-self-loop" est aussi posée en DB (check constraint).
  if (data.predecesseurId) {
    const cycle = await withTenant(ctx.entreprise.id, (tx) =>
      detecterCycle(tx, data.id, data.predecesseurId!),
    );
    if (cycle) {
      return {
        ok: false,
        error:
          'Enchaînement circulaire : ce prédécesseur dépend déjà (directement ou indirectement) de cette tâche.',
      };
    }
  }

  const errResult = await withTenant(ctx.entreprise.id, async (tx) => {
    const [before] = await tx
      .select()
      .from(chantierTaches)
      .where(and(eq(chantierTaches.id, data.id), isNull(chantierTaches.deletedAt)));
    if (!before) return 'Tâche introuvable.';

    const dateDebut = data.estJalon
      ? (data.dateDebutPrevue ?? data.dateFinPrevue ?? null)
      : (data.dateDebutPrevue ?? null);
    const dateFin = data.estJalon ? dateDebut : (data.dateFinPrevue ?? null);

    const patch = {
      libelle: data.libelle,
      niveau: data.niveau ?? null,
      corpsMetier: data.corpsMetier ?? null,
      dateDebutPrevue: dateDebut,
      dateFinPrevue: dateFin,
      avancementPourcent: data.avancementPourcent,
      heuresPlanifiees: data.heuresPlanifiees ?? before.heuresPlanifiees,
      estJalon: data.estJalon,
      predecesseurId: data.predecesseurId ?? null,
      notes: data.notes ?? null,
      updatedAt: new Date(),
      updatedBy: ctx.utilisateur.id,
    };

    await tx.update(chantierTaches).set(patch).where(eq(chantierTaches.id, data.id));
    await auditLogIn(tx, {
      action: 'update',
      tableName: 'chantier_taches',
      rowId: data.id,
      before,
      after: { ...before, ...patch },
    });
    return null;
  });

  if (errResult) return { ok: false, error: errResult };

  revalidatePath(`/${ctx.entreprise.slug}/planning`);
  revalidatePath(`/${ctx.entreprise.slug}/chantiers`, 'layout');
  return { ok: true, data: { id: data.id } };
}

/**
 * Détecte si `predecesseurId` aboutirait (directement ou en remontant la chaîne
 * `predecesseur_id`) à `tacheId` — créant un cycle. À appeler AVANT de poser
 * `predecesseurId` sur la tâche.
 */
async function detecterCycle(
  tx: Parameters<Parameters<typeof withTenant>[1]>[0],
  tacheId: string,
  candidatPredId: string,
): Promise<boolean> {
  if (candidatPredId === tacheId) return true;
  const vus = new Set<string>([tacheId]);
  let courant: string | null = candidatPredId;
  // Borne dure : profondeur maxi 1000 pour éviter une boucle infinie en cas
  // d'incohérence DB (déjà bloquée par check constraint, mais ceinture+bretelles).
  for (let i = 0; i < 1000 && courant; i++) {
    if (vus.has(courant)) return true;
    vus.add(courant);
    const [row] = await tx
      .select({ predecesseurId: chantierTaches.predecesseurId })
      .from(chantierTaches)
      .where(eq(chantierTaches.id, courant));
    if (!row) return false;
    courant = row.predecesseurId;
  }
  return false;
}

// ─────────────────────────────────────────────────────────────
// Création / suppression de tâche depuis le Gantt
// ─────────────────────────────────────────────────────────────

export async function creerTachePlanning(
  input: PlanningCreationInput,
): Promise<ActionResult<{ id: string }>> {
  const parsed = planningCreationSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: 'Données invalides.',
      fieldErrors: parsed.error.flatten().fieldErrors,
    };
  }
  const ctx = await requireTenantContextWithMfa();
  if (!ROLES_PLANNING_WRITE.includes(ctx.utilisateur.role)) {
    return { ok: false, error: 'Accès refusé.' };
  }
  const data = parsed.data;

  const res = await withTenant(ctx.entreprise.id, async (tx) => {
    // Vérifie le chantier (RLS le filtre déjà mais on veut une erreur claire).
    const [chantier] = await tx
      .select({ id: chantiers.id })
      .from(chantiers)
      .where(and(eq(chantiers.id, data.chantierId), isNull(chantiers.deletedAt)));
    if (!chantier) return { error: 'Chantier introuvable.' };

    // `ordre` = max(ordre) + 1 dans le chantier, pour apparaître en fin de liste.
    const [maxRow] = await tx
      .select({ maxOrdre: sqlMax(chantierTaches.ordre) })
      .from(chantierTaches)
      .where(and(eq(chantierTaches.chantierId, data.chantierId), isNull(chantierTaches.deletedAt)));
    const nextOrdre = (maxRow?.maxOrdre ?? -1) + 1;

    const dateDebut = data.estJalon
      ? (data.dateDebutPrevue ?? data.dateFinPrevue ?? null)
      : (data.dateDebutPrevue ?? null);
    const dateFin = data.estJalon ? dateDebut : (data.dateFinPrevue ?? null);

    const [created] = await tx
      .insert(chantierTaches)
      .values({
        entrepriseId: ctx.entreprise.id, // trigger l'écrasera depuis le chantier parent
        chantierId: data.chantierId,
        ordre: nextOrdre,
        libelle: data.libelle,
        niveau: data.niveau ?? null,
        corpsMetier: data.corpsMetier ?? null,
        dateDebutPrevue: dateDebut,
        dateFinPrevue: dateFin,
        heuresPlanifiees: data.heuresPlanifiees,
        estJalon: data.estJalon,
        avancementPourcent: 0,
        statut: 'a_faire',
        createdBy: ctx.utilisateur.id,
      })
      .returning({ id: chantierTaches.id });

    if (!created) return { error: 'Échec de la création.' };
    await auditLogIn(tx, {
      action: 'insert',
      tableName: 'chantier_taches',
      rowId: created.id,
      after: { ...data, ordre: nextOrdre },
    });
    return { id: created.id };
  });

  if ('error' in res) return { ok: false, error: res.error };
  revalidatePath(`/${ctx.entreprise.slug}/planning`);
  revalidatePath(`/${ctx.entreprise.slug}/chantiers`, 'layout');
  return { ok: true, data: { id: res.id } };
}

export async function supprimerTachePlanning(id: string): Promise<ActionResult<void>> {
  const ctx = await requireTenantContextWithMfa();
  if (!ROLES_PLANNING_WRITE.includes(ctx.utilisateur.role)) {
    return { ok: false, error: 'Accès refusé.' };
  }

  const result = await withTenant(ctx.entreprise.id, async (tx) => {
    const [before] = await tx
      .select()
      .from(chantierTaches)
      .where(and(eq(chantierTaches.id, id), isNull(chantierTaches.deletedAt)));
    if (!before) return 'Tâche introuvable.';

    // Détache les successeurs : `ON DELETE SET NULL` ferait pareil sur un vrai
    // delete, mais on est en soft-delete → on doit le faire manuellement.
    await tx
      .update(chantierTaches)
      .set({ predecesseurId: null, updatedAt: new Date(), updatedBy: ctx.utilisateur.id })
      .where(eq(chantierTaches.predecesseurId, id));

    await tx
      .update(chantierTaches)
      .set({ deletedAt: new Date(), updatedBy: ctx.utilisateur.id })
      .where(eq(chantierTaches.id, id));

    await auditLogIn(tx, {
      action: 'delete',
      tableName: 'chantier_taches',
      rowId: id,
      before,
    });
    return null;
  });

  if (result) return { ok: false, error: result };
  revalidatePath(`/${ctx.entreprise.slug}/planning`);
  revalidatePath(`/${ctx.entreprise.slug}/chantiers`, 'layout');
  return { ok: true, data: undefined };
}

/**
 * Applique en lot les décalages de dates calculés par `cascadeDelta` côté client
 * après un drag-move/resize d'un prédécesseur. Tout passe dans UNE transaction
 * pour qu'un échec intermédiaire ne laisse pas le planning à moitié décalé.
 *
 * Le serveur revalide chaque ligne (RLS + ownership tenant garantis par
 * `withTenant`, et chaque check de date par la contrainte SQL).
 */
export async function appliquerCascadeTachesPlanning(
  input: PlanningCascadeInput,
): Promise<ActionResult<{ count: number }>> {
  const parsed = planningCascadeSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: 'Cascade invalide.' };
  }
  const ctx = await requireTenantContextWithMfa();
  if (!ROLES_PLANNING_WRITE.includes(ctx.utilisateur.role)) {
    return { ok: false, error: 'Accès refusé.' };
  }
  const { changes } = parsed.data;
  if (changes.length === 0) return { ok: true, data: { count: 0 } };

  const ids = changes.map((c) => c.id);

  const res = await withTenant(ctx.entreprise.id, async (tx) => {
    // Charge l'état actuel pour audit + sanity check (toutes les tâches
    // appartiennent bien au tenant et ne sont pas supprimées).
    const existantes = await tx
      .select({ id: chantierTaches.id, estJalon: chantierTaches.estJalon })
      .from(chantierTaches)
      .where(and(inArray(chantierTaches.id, ids), isNull(chantierTaches.deletedAt)));
    if (existantes.length !== ids.length) {
      return { error: 'Certaines tâches de la cascade sont introuvables.' };
    }
    const jalonsIds = new Set(existantes.filter((e) => e.estJalon).map((e) => e.id));

    // Update séquentiel : Drizzle ne supporte pas l'UPDATE batch portable.
    // Acceptable pour ≤500 lignes (garde-fou côté schéma Zod).
    for (const c of changes) {
      const debut = c.dateDebutPrevue;
      const fin = jalonsIds.has(c.id) ? c.dateDebutPrevue : c.dateFinPrevue;
      await tx
        .update(chantierTaches)
        .set({
          dateDebutPrevue: debut,
          dateFinPrevue: fin,
          updatedAt: new Date(),
          updatedBy: ctx.utilisateur.id,
        })
        .where(eq(chantierTaches.id, c.id));
    }

    await auditLogIn(tx, {
      action: 'update',
      tableName: 'chantier_taches',
      rowId: ids[0] ?? '00000000-0000-0000-0000-000000000000',
      after: { cascade: changes },
    });
    return { count: changes.length };
  });

  if ('error' in res) return { ok: false, error: res.error };
  revalidatePath(`/${ctx.entreprise.slug}/planning`);
  return { ok: true, data: { count: res.count } };
}

/**
 * Restaure une tâche précédemment soft-deletée (undo de suppression).
 * Idempotent : ne fait rien si la tâche n'est pas dans l'état "supprimée".
 *
 * Limitation : les `predecesseur_id` des successeurs ont été coupés au moment
 * de la suppression et ne sont PAS re-rattachés ici. L'utilisateur peut
 * re-lier via le drawer si nécessaire (rare en pratique car l'undo immédiat
 * est avant que les successeurs aient changé).
 */
export async function restaurerTachePlanning(id: string): Promise<ActionResult<void>> {
  const ctx = await requireTenantContextWithMfa();
  if (!ROLES_PLANNING_WRITE.includes(ctx.utilisateur.role)) {
    return { ok: false, error: 'Accès refusé.' };
  }

  await withTenant(ctx.entreprise.id, async (tx) => {
    const [before] = await tx.select().from(chantierTaches).where(eq(chantierTaches.id, id));
    if (!before || before.deletedAt === null) return; // déjà active
    await tx
      .update(chantierTaches)
      .set({ deletedAt: null, updatedAt: new Date(), updatedBy: ctx.utilisateur.id })
      .where(eq(chantierTaches.id, id));
    await auditLogIn(tx, {
      action: 'update',
      tableName: 'chantier_taches',
      rowId: id,
      before,
      after: { ...before, deletedAt: null },
    });
  });

  revalidatePath(`/${ctx.entreprise.slug}/planning`);
  revalidatePath(`/${ctx.entreprise.slug}/chantiers`, 'layout');
  return { ok: true, data: undefined };
}

/**
 * Duplique un étage / niveau : clone toutes les tâches actives du niveau source
 * dans le même chantier, décalées juste après la fin du groupe d'origine
 * (delta = max(date_fin) − min(date_debut) + 5 jours).
 *
 * Liens `predecesseur_id` :
 *   - Intra-groupe (pred dans la même duplication) : remappés vers le clone correspondant.
 *   - Hors groupe : coupés (NULL) — pas de duplication cross-groupe pour rester prévisible.
 *
 * Le nouveau niveau s'appelle `<src>-copie` (avec suffixe `-2`, `-3`… si collision).
 * Renvoie la liste des nouveaux IDs (pour pousser l'op dans la pile undo côté client).
 */
export async function dupliquerNiveauPlanning(
  input: PlanningDuplicationInput,
): Promise<ActionResult<{ niveauCopie: string; tacheIds: string[] }>> {
  const parsed = planningDuplicationSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: 'Données invalides.' };
  }
  const ctx = await requireTenantContextWithMfa();
  if (!ROLES_PLANNING_WRITE.includes(ctx.utilisateur.role)) {
    return { ok: false, error: 'Accès refusé.' };
  }
  const data = parsed.data;

  const res = await withTenant(ctx.entreprise.id, async (tx) => {
    // 1. Charge les tâches du niveau source (actives, dans le chantier).
    const sourceRows = await tx
      .select()
      .from(chantierTaches)
      .where(
        and(
          eq(chantierTaches.chantierId, data.chantierId),
          eq(chantierTaches.niveau, data.niveau),
          isNull(chantierTaches.deletedAt),
        ),
      )
      .orderBy(asc(chantierTaches.ordre), asc(chantierTaches.createdAt));
    if (sourceRows.length === 0) {
      return { error: 'Aucune tâche dans ce niveau.' };
    }

    // 2. Calcule le delta (décalage en jours) et trouve un niveau cible libre.
    const datees = sourceRows.filter((t) => t.dateDebutPrevue && t.dateFinPrevue);
    let deltaJours = 5;
    if (datees.length > 0) {
      let mn = Infinity;
      let mx = -Infinity;
      for (const t of datees) {
        mn = Math.min(mn, Date.parse(t.dateDebutPrevue!));
        mx = Math.max(mx, Date.parse(t.dateFinPrevue!));
      }
      const dur = Math.round((mx - mn) / 86_400_000) + 1;
      deltaJours = dur + 5;
    }

    const niveauxExistants = await tx
      .select({ niveau: chantierTaches.niveau })
      .from(chantierTaches)
      .where(and(eq(chantierTaches.chantierId, data.chantierId), isNull(chantierTaches.deletedAt)));
    const utilises = new Set(
      niveauxExistants.map((n) => n.niveau).filter((n): n is string => n !== null),
    );
    let niveauCopie = `${data.niveau}-copie`;
    if (utilises.has(niveauCopie)) {
      for (let i = 2; i < 100; i++) {
        const candidat = `${data.niveau}-copie-${i}`;
        if (!utilises.has(candidat)) {
          niveauCopie = candidat;
          break;
        }
      }
    }

    // 3. ordre de base pour les clones : après le max actuel.
    const [maxRow] = await tx
      .select({ maxOrdre: sqlMax(chantierTaches.ordre) })
      .from(chantierTaches)
      .where(and(eq(chantierTaches.chantierId, data.chantierId), isNull(chantierTaches.deletedAt)));
    let ordreBase = (maxRow?.maxOrdre ?? -1) + 1;

    // 4. Insertion des clones SANS predecesseur (1er passage), puis remap (2e passage).
    const ids: string[] = [];
    const idMap = new Map<string, string>(); // ancien id → nouvel id

    function ajoutJoursISO(s: string, n: number): string {
      const d = new Date(s + 'T00:00:00Z');
      d.setUTCDate(d.getUTCDate() + n);
      return d.toISOString().slice(0, 10);
    }

    for (const src of sourceRows) {
      const [clone] = await tx
        .insert(chantierTaches)
        .values({
          entrepriseId: ctx.entreprise.id, // trigger réécrit depuis le chantier parent
          chantierId: data.chantierId,
          ordre: ordreBase++,
          libelle: src.libelle,
          description: src.description,
          niveau: niveauCopie,
          corpsMetier: src.corpsMetier,
          responsableId: src.responsableId,
          statut: 'a_faire',
          avancementPourcent: 0,
          dateDebutPrevue: src.dateDebutPrevue
            ? ajoutJoursISO(src.dateDebutPrevue, deltaJours)
            : null,
          dateFinPrevue: src.dateFinPrevue ? ajoutJoursISO(src.dateFinPrevue, deltaJours) : null,
          heuresPlanifiees: src.heuresPlanifiees,
          estJalon: src.estJalon,
          predecesseurId: null,
          notes: src.notes,
          createdBy: ctx.utilisateur.id,
        })
        .returning({ id: chantierTaches.id });
      if (!clone) continue;
      ids.push(clone.id);
      idMap.set(src.id, clone.id);
    }

    // 5. Remap des predecesseur_id intra-groupe.
    const sourceIds = new Set(sourceRows.map((s) => s.id));
    for (const src of sourceRows) {
      if (!src.predecesseurId || !sourceIds.has(src.predecesseurId)) continue;
      const cloneId = idMap.get(src.id);
      const clonePred = idMap.get(src.predecesseurId);
      if (!cloneId || !clonePred) continue;
      await tx
        .update(chantierTaches)
        .set({ predecesseurId: clonePred })
        .where(eq(chantierTaches.id, cloneId));
    }

    await auditLogIn(tx, {
      action: 'insert',
      tableName: 'chantier_taches',
      rowId: ids[0] ?? '00000000-0000-0000-0000-000000000000',
      after: { duplique: { niveauSrc: data.niveau, niveauCopie, ids } },
    });

    return { niveauCopie, ids };
  });

  if ('error' in res) return { ok: false, error: res.error };
  revalidatePath(`/${ctx.entreprise.slug}/planning`);
  revalidatePath(`/${ctx.entreprise.slug}/chantiers`, 'layout');
  return { ok: true, data: { niveauCopie: res.niveauCopie, tacheIds: res.ids } };
}

// ─────────────────────────────────────────────────────────────
// Équipe : affectation / mise à jour / retrait
// ─────────────────────────────────────────────────────────────

export async function affecterOuvrierTache(
  input: PlanningEquipeAjoutInput,
): Promise<ActionResult<{ id: string }>> {
  const parsed = planningEquipeAjoutSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: 'Données invalides.' };
  }
  const ctx = await requireTenantContextWithMfa();
  if (!ROLES_PLANNING_WRITE.includes(ctx.utilisateur.role)) {
    return { ok: false, error: 'Accès refusé.' };
  }
  const data = parsed.data;

  const res = await withTenant(ctx.entreprise.id, async (tx) => {
    // Vérifie que la tâche existe et est dans le tenant (RLS).
    const [tache] = await tx
      .select({ id: chantierTaches.id })
      .from(chantierTaches)
      .where(and(eq(chantierTaches.id, data.tacheId), isNull(chantierTaches.deletedAt)));
    if (!tache) return { error: 'Tâche introuvable.' };

    // Anti-doublon : si l'utilisateur est déjà affecté (non-supprimé), on
    // refuse — l'unique index DB enverrait sinon une 23505 peu lisible.
    const [existant] = await tx
      .select({ id: chantierTacheEquipe.id })
      .from(chantierTacheEquipe)
      .where(
        and(
          eq(chantierTacheEquipe.tacheId, data.tacheId),
          eq(chantierTacheEquipe.utilisateurId, data.utilisateurId),
          isNull(chantierTacheEquipe.deletedAt),
        ),
      );
    if (existant) return { error: 'Ouvrier déjà affecté à cette tâche.' };

    const [created] = await tx
      .insert(chantierTacheEquipe)
      .values({
        entrepriseId: ctx.entreprise.id, // garde-fou ; le trigger l'écrasera si besoin
        tacheId: data.tacheId,
        utilisateurId: data.utilisateurId,
        heuresPrevues: data.heuresPrevues,
        heuresFaites: 0,
        createdBy: ctx.utilisateur.id,
      })
      .returning({ id: chantierTacheEquipe.id });
    if (!created) return { error: "Échec de l'affectation." };
    await auditLogIn(tx, {
      action: 'insert',
      tableName: 'chantier_tache_equipe',
      rowId: created.id,
      after: {
        tacheId: data.tacheId,
        utilisateurId: data.utilisateurId,
        heuresPrevues: data.heuresPrevues,
      },
    });
    return { id: created.id };
  });

  if ('error' in res) return { ok: false, error: res.error };
  revalidatePath(`/${ctx.entreprise.slug}/planning`);
  return { ok: true, data: { id: res.id } };
}

export async function mettreAJourEquipeTache(
  input: PlanningEquipeMajInput,
): Promise<ActionResult<void>> {
  const parsed = planningEquipeMajSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: 'Données invalides.' };
  const ctx = await requireTenantContextWithMfa();
  if (!ROLES_PLANNING_WRITE.includes(ctx.utilisateur.role)) {
    return { ok: false, error: 'Accès refusé.' };
  }
  const data = parsed.data;

  await withTenant(ctx.entreprise.id, async (tx) => {
    const [before] = await tx
      .select()
      .from(chantierTacheEquipe)
      .where(and(eq(chantierTacheEquipe.id, data.id), isNull(chantierTacheEquipe.deletedAt)));
    if (!before) return;
    await tx
      .update(chantierTacheEquipe)
      .set({
        heuresPrevues: data.heuresPrevues,
        heuresFaites: data.heuresFaites,
        updatedAt: new Date(),
        updatedBy: ctx.utilisateur.id,
      })
      .where(eq(chantierTacheEquipe.id, data.id));
    await auditLogIn(tx, {
      action: 'update',
      tableName: 'chantier_tache_equipe',
      rowId: data.id,
      before,
      after: {
        ...before,
        heuresPrevues: data.heuresPrevues,
        heuresFaites: data.heuresFaites,
      },
    });
  });

  revalidatePath(`/${ctx.entreprise.slug}/planning`);
  return { ok: true, data: undefined };
}

export async function retirerOuvrierTache(equipeId: string): Promise<ActionResult<void>> {
  const ctx = await requireTenantContextWithMfa();
  if (!ROLES_PLANNING_WRITE.includes(ctx.utilisateur.role)) {
    return { ok: false, error: 'Accès refusé.' };
  }

  await withTenant(ctx.entreprise.id, async (tx) => {
    const [before] = await tx
      .select()
      .from(chantierTacheEquipe)
      .where(and(eq(chantierTacheEquipe.id, equipeId), isNull(chantierTacheEquipe.deletedAt)));
    if (!before) return;
    await tx
      .update(chantierTacheEquipe)
      .set({ deletedAt: new Date(), updatedBy: ctx.utilisateur.id })
      .where(eq(chantierTacheEquipe.id, equipeId));
    await auditLogIn(tx, {
      action: 'delete',
      tableName: 'chantier_tache_equipe',
      rowId: equipeId,
      before,
    });
  });

  revalidatePath(`/${ctx.entreprise.slug}/planning`);
  return { ok: true, data: undefined };
}

// ─────────────────────────────────────────────────────────────
// Lecture liste utilisateurs (pour le select "+ Affecter" du drawer)
// ─────────────────────────────────────────────────────────────

export type OuvrierAffectable = {
  id: string;
  email: string;
};

export async function listerOuvriersAffectables(): Promise<OuvrierAffectable[]> {
  const ctx = await requireTenantContextWithMfa();
  return withTenant(ctx.entreprise.id, (tx) =>
    tx
      .select({ id: utilisateurs.id, email: utilisateurs.email })
      .from(utilisateurs)
      .where(isNull(utilisateurs.deletedAt))
      .orderBy(asc(utilisateurs.email)),
  );
}
