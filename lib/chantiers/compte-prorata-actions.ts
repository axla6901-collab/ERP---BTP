'use server';

import { and, asc, count, desc, eq, isNull, max as sqlMax, ne, sum } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';

import { auditLogIn } from '@/lib/audit/log';
import { peutAdministrer } from '@/lib/admin/permissions';
import { requireTenantContextWithMfa } from '@/lib/auth/tenant-guards';
import type { ActionResult } from '@/lib/common/action-result';
import { messageBlocageSuppression } from '@/lib/common/references-suppression';
import { withTenant, type TenantTx } from '@/lib/db/with-tenant';
import { chantiers } from '@/db/schema/chantiers';
import { entreprises } from '@/db/schema/entreprises';
import { sousTraitants } from '@/db/schema/tiers';
import {
  compteProrata,
  compteProrataArretes,
  compteProrataDepenses,
  compteProrataParticipants,
  type CompteProrata,
  type CompteProrataDepense,
  type CompteProrataParticipant,
} from '@/db/schema/compte-prorata';
import {
  arreterCompteProrataSchema,
  compteProrataDepenseSchema,
  compteProrataFlagSchema,
  compteProrataParticipantSchema,
  ouvrirCompteProrataSchema,
  parametresCompteProrataSchema,
  type ArreterCompteProrataInput,
  type CompteProrataDepenseInput,
  type CompteProrataFlagInput,
  type CompteProrataParticipantInput,
  type OuvrirCompteProrataInput,
  type ParametresCompteProrataInput,
} from '@/lib/validation/compte-prorata';
import {
  ROLES_COMPTE_PRORATA_WRITE,
  ROLES_COMPTE_PRORATA_ARRETE,
} from '@/lib/chantiers/compte-prorata-permissions';
import {
  genererArrete,
  type DepenseCalcul,
  type ParticipantCalcul,
} from '@/lib/chantiers/compte-prorata';

// ─────────────────────────────────────────────────────────────
// Types renvoyés au client (sérialisables)
// ─────────────────────────────────────────────────────────────

export type CompteProrataParticipantRow = CompteProrataParticipant & {
  sousTraitantNom: string | null;
};

export type CompteProrataDepenseRow = CompteProrataDepense & {
  /** Libellé du participant qui a avancé la dépense. */
  avanceParLibelle: string;
};

export type CompteProrataData = {
  compte: CompteProrata;
  participants: CompteProrataParticipantRow[];
  depenses: CompteProrataDepenseRow[];
};

export type CompteProrataSommaire = {
  /** Id du compte prorata. */
  id: string;
  chantierId: string;
  chantierNumero: string;
  chantierLibelle: string;
  statut: CompteProrata['statut'];
  nbParticipants: number;
  totalDepensesHt: string;
};

// ─────────────────────────────────────────────────────────────
// Helpers (non exportés → non soumis à la contrainte "use server")
// ─────────────────────────────────────────────────────────────

/** Mappe les participants vers l'entrée du moteur de calcul (pur). */
function versParticipantsCalcul(participants: CompteProrataParticipant[]): ParticipantCalcul[] {
  return participants.map((p) => ({
    id: p.id,
    libelle: p.libelle,
    montantMarcheHt: p.montantMarcheHt,
    quotePartPctManuel: p.quotePartPctManuel,
    estGestionnaire: p.estGestionnaire,
  }));
}

function versDepensesCalcul(depenses: CompteProrataDepense[]): DepenseCalcul[] {
  return depenses.map((d) => ({
    id: d.id,
    avanceParParticipantId: d.avanceParParticipantId,
    montantHt: d.montantHt,
  }));
}

async function chargerCompteParId(tx: TenantTx, compteId: string): Promise<CompteProrata | null> {
  const [row] = await tx
    .select()
    .from(compteProrata)
    .where(and(eq(compteProrata.id, compteId), isNull(compteProrata.deletedAt)));
  return row ?? null;
}

function pctVersString(v: number | null | undefined): string | null {
  return v == null ? null : v.toFixed(2);
}

// ─────────────────────────────────────────────────────────────
// Feature flag entreprise
// ─────────────────────────────────────────────────────────────

/**
 * Bascule l'option Compte prorata au niveau de l'entreprise courante.
 * Réservé aux administrateurs tenant (cf. `peutAdministrer`).
 */
export async function setCompteProrataActive(
  input: CompteProrataFlagInput,
): Promise<ActionResult<{ compteProrataActive: boolean }>> {
  const parsed = compteProrataFlagSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: 'Données invalides.' };
  }
  const ctx = await requireTenantContextWithMfa();
  if (!peutAdministrer(ctx.utilisateur.role)) {
    return { ok: false, error: 'Accès refusé : rôle administrateur requis.' };
  }

  await withTenant(ctx.entreprise.id, async (tx) => {
    const [before] = await tx
      .select({ compteProrataActive: entreprises.compteProrataActive })
      .from(entreprises)
      .where(eq(entreprises.id, ctx.entreprise.id));
    await tx
      .update(entreprises)
      .set({ compteProrataActive: parsed.data.actif, updatedAt: new Date() })
      .where(eq(entreprises.id, ctx.entreprise.id));
    await auditLogIn(tx, {
      action: 'update',
      tableName: 'entreprises',
      rowId: ctx.entreprise.id,
      before,
      after: { compteProrataActive: parsed.data.actif },
    });
  });

  // Sidebar/onglet chantier dépendent du flag : revalide tout l'espace tenant.
  revalidatePath(`/${ctx.entreprise.slug}`, 'layout');
  return { ok: true, data: { compteProrataActive: parsed.data.actif } };
}

// ─────────────────────────────────────────────────────────────
// Lectures
// ─────────────────────────────────────────────────────────────

/** Liste des comptes prorata (page sidebar globale). */
export async function listerComptesProrata(): Promise<CompteProrataSommaire[]> {
  const ctx = await requireTenantContextWithMfa();
  return withTenant(ctx.entreprise.id, async (tx) => {
    const comptes = await tx
      .select({
        id: compteProrata.id,
        chantierId: compteProrata.chantierId,
        statut: compteProrata.statut,
        chantierNumero: chantiers.numero,
        chantierLibelle: chantiers.libelle,
      })
      .from(compteProrata)
      .innerJoin(chantiers, eq(compteProrata.chantierId, chantiers.id))
      .where(isNull(compteProrata.deletedAt))
      .orderBy(asc(chantiers.numero));

    if (comptes.length === 0) return [];

    // Agrégats par compte (1 requête chacun, agrégation côté SQL).
    const nbParts = await tx
      .select({
        compteId: compteProrataParticipants.compteProrataId,
        n: count(),
      })
      .from(compteProrataParticipants)
      .where(isNull(compteProrataParticipants.deletedAt))
      .groupBy(compteProrataParticipants.compteProrataId);
    const nbPartsMap = new Map(nbParts.map((r) => [r.compteId, Number(r.n)]));

    const totDep = await tx
      .select({
        compteId: compteProrataDepenses.compteProrataId,
        total: sum(compteProrataDepenses.montantHt),
      })
      .from(compteProrataDepenses)
      .where(isNull(compteProrataDepenses.deletedAt))
      .groupBy(compteProrataDepenses.compteProrataId);
    const totDepMap = new Map(totDep.map((r) => [r.compteId, r.total ?? '0']));

    return comptes.map((c) => ({
      id: c.id,
      chantierId: c.chantierId,
      chantierNumero: c.chantierNumero,
      chantierLibelle: c.chantierLibelle,
      statut: c.statut,
      nbParticipants: nbPartsMap.get(c.id) ?? 0,
      totalDepensesHt: Number(totDepMap.get(c.id) ?? '0').toFixed(2),
    }));
  });
}

/** Charge le compte prorata d'un chantier (compte + participants + dépenses). */
export async function lireCompteProrataChantier(
  chantierId: string,
): Promise<CompteProrataData | null> {
  const ctx = await requireTenantContextWithMfa();
  return withTenant(ctx.entreprise.id, async (tx) => {
    const [compte] = await tx
      .select()
      .from(compteProrata)
      .where(and(eq(compteProrata.chantierId, chantierId), isNull(compteProrata.deletedAt)));
    if (!compte) return null;

    const participants = await tx
      .select({
        row: compteProrataParticipants,
        sousTraitantNom: sousTraitants.nom,
      })
      .from(compteProrataParticipants)
      .leftJoin(sousTraitants, eq(compteProrataParticipants.sousTraitantId, sousTraitants.id))
      .where(
        and(
          eq(compteProrataParticipants.compteProrataId, compte.id),
          isNull(compteProrataParticipants.deletedAt),
        ),
      )
      .orderBy(asc(compteProrataParticipants.ordre), asc(compteProrataParticipants.createdAt));

    const depenses = await tx
      .select()
      .from(compteProrataDepenses)
      .where(
        and(
          eq(compteProrataDepenses.compteProrataId, compte.id),
          isNull(compteProrataDepenses.deletedAt),
        ),
      )
      .orderBy(desc(compteProrataDepenses.dateDepense), desc(compteProrataDepenses.createdAt));

    const participantsRows: CompteProrataParticipantRow[] = participants.map((p) => ({
      ...p.row,
      sousTraitantNom: p.sousTraitantNom ?? null,
    }));
    const libelleParId = new Map(participantsRows.map((p) => [p.id, p.libelle]));

    const depensesRows: CompteProrataDepenseRow[] = depenses.map((d) => ({
      ...d,
      avanceParLibelle: libelleParId.get(d.avanceParParticipantId) ?? '—',
    }));

    return { compte, participants: participantsRows, depenses: depensesRows };
  });
}

// ─────────────────────────────────────────────────────────────
// Ouverture / paramètres du compte
// ─────────────────────────────────────────────────────────────

/**
 * Ouvre le compte prorata d'un chantier et crée d'office le participant
 * « gestionnaire » (l'entreprise elle-même). Refuse si un compte actif existe
 * déjà (l'index unique partiel garantit aussi l'unicité côté DB).
 */
export async function ouvrirCompteProrata(
  input: OuvrirCompteProrataInput,
): Promise<ActionResult<{ id: string }>> {
  const parsed = ouvrirCompteProrataSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: 'Données invalides.' };
  }
  const ctx = await requireTenantContextWithMfa();
  if (!ROLES_COMPTE_PRORATA_WRITE.includes(ctx.utilisateur.role)) {
    return { ok: false, error: 'Accès refusé.' };
  }
  const data = parsed.data;

  const res = await withTenant(ctx.entreprise.id, async (tx) => {
    const [chantier] = await tx
      .select({ id: chantiers.id })
      .from(chantiers)
      .where(and(eq(chantiers.id, data.chantierId), isNull(chantiers.deletedAt)));
    if (!chantier) return { error: 'Chantier introuvable.' };

    const [existant] = await tx
      .select({ id: compteProrata.id })
      .from(compteProrata)
      .where(and(eq(compteProrata.chantierId, data.chantierId), isNull(compteProrata.deletedAt)));
    if (existant) return { error: 'Un compte prorata existe déjà pour ce chantier.' };

    const [created] = await tx
      .insert(compteProrata)
      .values({
        entrepriseId: ctx.entreprise.id, // trigger réécrit depuis le chantier parent
        chantierId: data.chantierId,
        fraisGestionPct: pctVersString(data.fraisGestionPct),
        statut: 'ouvert',
        createdBy: ctx.utilisateur.id,
        updatedBy: ctx.utilisateur.id,
      })
      .returning({ id: compteProrata.id });
    if (!created) return { error: "Échec de l'ouverture du compte." };

    // Participant gestionnaire par défaut = l'entreprise elle-même.
    await tx.insert(compteProrataParticipants).values({
      entrepriseId: ctx.entreprise.id,
      compteProrataId: created.id,
      libelle: `${ctx.entreprise.raisonSociale} (gestionnaire)`,
      montantMarcheHt: '0',
      estGestionnaire: true,
      ordre: 0,
      createdBy: ctx.utilisateur.id,
      updatedBy: ctx.utilisateur.id,
    });

    await auditLogIn(tx, {
      action: 'insert',
      tableName: 'compte_prorata',
      rowId: created.id,
      after: { chantierId: data.chantierId, fraisGestionPct: data.fraisGestionPct },
    });
    return { id: created.id };
  });

  if ('error' in res) return { ok: false, error: res.error };
  revalidatePath(`/${ctx.entreprise.slug}/compte-prorata`);
  revalidatePath(`/${ctx.entreprise.slug}/chantiers`, 'layout');
  return { ok: true, data: { id: res.id } };
}

/** Met à jour les paramètres du compte (frais de gestion, notes). */
export async function mettreAJourParametresCompteProrata(
  input: ParametresCompteProrataInput,
): Promise<ActionResult<void>> {
  const parsed = parametresCompteProrataSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: 'Données invalides.' };
  const ctx = await requireTenantContextWithMfa();
  if (!ROLES_COMPTE_PRORATA_WRITE.includes(ctx.utilisateur.role)) {
    return { ok: false, error: 'Accès refusé.' };
  }
  const data = parsed.data;

  const result = await withTenant(ctx.entreprise.id, async (tx) => {
    const compte = await chargerCompteParId(tx, data.compteProrataId);
    if (!compte) return 'Compte prorata introuvable.';
    if (compte.statut !== 'ouvert') return 'Compte arrêté : modification impossible.';
    const patch = {
      fraisGestionPct: pctVersString(data.fraisGestionPct),
      notes: data.notes ?? null,
      updatedAt: new Date(),
      updatedBy: ctx.utilisateur.id,
    };
    await tx.update(compteProrata).set(patch).where(eq(compteProrata.id, compte.id));
    await auditLogIn(tx, {
      action: 'update',
      tableName: 'compte_prorata',
      rowId: compte.id,
      before: compte,
      after: { ...compte, ...patch },
    });
    return null;
  });

  if (result) return { ok: false, error: result };
  revalidatePath(`/${ctx.entreprise.slug}/chantiers`, 'layout');
  revalidatePath(`/${ctx.entreprise.slug}/compte-prorata`);
  return { ok: true, data: undefined };
}

// ─────────────────────────────────────────────────────────────
// Participants
// ─────────────────────────────────────────────────────────────

export async function enregistrerParticipant(
  input: CompteProrataParticipantInput,
): Promise<ActionResult<{ id: string }>> {
  const parsed = compteProrataParticipantSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: 'Données invalides.',
      fieldErrors: parsed.error.flatten().fieldErrors,
    };
  }
  const ctx = await requireTenantContextWithMfa();
  if (!ROLES_COMPTE_PRORATA_WRITE.includes(ctx.utilisateur.role)) {
    return { ok: false, error: 'Accès refusé.' };
  }
  const data = parsed.data;

  const res = await withTenant(ctx.entreprise.id, async (tx) => {
    const compte = await chargerCompteParId(tx, data.compteProrataId);
    if (!compte) return { error: 'Compte prorata introuvable.' };
    if (compte.statut !== 'ouvert') return { error: 'Compte arrêté : modification impossible.' };

    // Un seul gestionnaire actif : on retire le flag aux autres avant de poser.
    if (data.estGestionnaire) {
      const cond = data.id
        ? and(
            eq(compteProrataParticipants.compteProrataId, compte.id),
            eq(compteProrataParticipants.estGestionnaire, true),
            ne(compteProrataParticipants.id, data.id),
            isNull(compteProrataParticipants.deletedAt),
          )
        : and(
            eq(compteProrataParticipants.compteProrataId, compte.id),
            eq(compteProrataParticipants.estGestionnaire, true),
            isNull(compteProrataParticipants.deletedAt),
          );
      await tx
        .update(compteProrataParticipants)
        .set({ estGestionnaire: false, updatedAt: new Date(), updatedBy: ctx.utilisateur.id })
        .where(cond);
    }

    const valeurs = {
      sousTraitantId: data.sousTraitantId ?? null,
      libelle: data.libelle,
      montantMarcheHt: data.montantMarcheHt.toFixed(2),
      quotePartPctManuel: pctVersString(data.quotePartPctManuel),
      estGestionnaire: data.estGestionnaire,
      notes: data.notes ?? null,
    };

    if (data.id) {
      const [before] = await tx
        .select()
        .from(compteProrataParticipants)
        .where(
          and(
            eq(compteProrataParticipants.id, data.id),
            isNull(compteProrataParticipants.deletedAt),
          ),
        );
      if (!before) return { error: 'Participant introuvable.' };
      const patch = { ...valeurs, updatedAt: new Date(), updatedBy: ctx.utilisateur.id };
      await tx
        .update(compteProrataParticipants)
        .set(patch)
        .where(eq(compteProrataParticipants.id, data.id));
      await auditLogIn(tx, {
        action: 'update',
        tableName: 'compte_prorata_participants',
        rowId: data.id,
        before,
        after: { ...before, ...patch },
      });
      return { id: data.id };
    }

    // Création : ordre = max + 1 dans le compte.
    const [maxRow] = await tx
      .select({ maxOrdre: sqlMax(compteProrataParticipants.ordre) })
      .from(compteProrataParticipants)
      .where(
        and(
          eq(compteProrataParticipants.compteProrataId, compte.id),
          isNull(compteProrataParticipants.deletedAt),
        ),
      );
    const nextOrdre = data.ordre ?? (maxRow?.maxOrdre ?? -1) + 1;

    const [created] = await tx
      .insert(compteProrataParticipants)
      .values({
        entrepriseId: ctx.entreprise.id, // trigger réécrit depuis le compte parent
        compteProrataId: compte.id,
        ordre: nextOrdre,
        createdBy: ctx.utilisateur.id,
        updatedBy: ctx.utilisateur.id,
        ...valeurs,
      })
      .returning({ id: compteProrataParticipants.id });
    if (!created) return { error: 'Échec de la création.' };
    await auditLogIn(tx, {
      action: 'insert',
      tableName: 'compte_prorata_participants',
      rowId: created.id,
      after: { ...valeurs, ordre: nextOrdre },
    });
    return { id: created.id };
  });

  if ('error' in res) return { ok: false, error: res.error };
  revalidatePath(`/${ctx.entreprise.slug}/chantiers`, 'layout');
  revalidatePath(`/${ctx.entreprise.slug}/compte-prorata`);
  return { ok: true, data: { id: res.id } };
}

export async function supprimerParticipant(id: string): Promise<ActionResult<void>> {
  const ctx = await requireTenantContextWithMfa();
  if (!ROLES_COMPTE_PRORATA_WRITE.includes(ctx.utilisateur.role)) {
    return { ok: false, error: 'Accès refusé.' };
  }

  const result = await withTenant(ctx.entreprise.id, async (tx) => {
    const [before] = await tx
      .select()
      .from(compteProrataParticipants)
      .where(
        and(eq(compteProrataParticipants.id, id), isNull(compteProrataParticipants.deletedAt)),
      );
    if (!before) return 'Participant introuvable.';

    const compte = await chargerCompteParId(tx, before.compteProrataId);
    if (compte && compte.statut !== 'ouvert') {
      return 'Compte arrêté : modification impossible.';
    }
    if (before.estGestionnaire) {
      return 'Désignez d’abord un autre gestionnaire avant de retirer celui-ci.';
    }

    // Refus si le participant a avancé des dépenses (FK RESTRICT + soft-delete).
    const [dep] = await tx
      .select({ n: count() })
      .from(compteProrataDepenses)
      .where(
        and(
          eq(compteProrataDepenses.avanceParParticipantId, id),
          isNull(compteProrataDepenses.deletedAt),
        ),
      );
    const message = messageBlocageSuppression('ce participant', [
      { nombre: dep?.n ?? 0, singulier: 'dépense avancée', pluriel: 'dépenses avancées' },
    ]);
    if (message) return message;

    await tx
      .update(compteProrataParticipants)
      .set({ deletedAt: new Date(), updatedBy: ctx.utilisateur.id })
      .where(eq(compteProrataParticipants.id, id));
    await auditLogIn(tx, {
      action: 'delete',
      tableName: 'compte_prorata_participants',
      rowId: id,
      before,
    });
    return null;
  });

  if (result) return { ok: false, error: result };
  revalidatePath(`/${ctx.entreprise.slug}/chantiers`, 'layout');
  revalidatePath(`/${ctx.entreprise.slug}/compte-prorata`);
  return { ok: true, data: undefined };
}

// ─────────────────────────────────────────────────────────────
// Dépenses communes
// ─────────────────────────────────────────────────────────────

export async function enregistrerDepense(
  input: CompteProrataDepenseInput,
): Promise<ActionResult<{ id: string }>> {
  const parsed = compteProrataDepenseSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: 'Données invalides.',
      fieldErrors: parsed.error.flatten().fieldErrors,
    };
  }
  const ctx = await requireTenantContextWithMfa();
  if (!ROLES_COMPTE_PRORATA_WRITE.includes(ctx.utilisateur.role)) {
    return { ok: false, error: 'Accès refusé.' };
  }
  const data = parsed.data;

  const res = await withTenant(ctx.entreprise.id, async (tx) => {
    const compte = await chargerCompteParId(tx, data.compteProrataId);
    if (!compte) return { error: 'Compte prorata introuvable.' };
    if (compte.statut !== 'ouvert') return { error: 'Compte arrêté : modification impossible.' };

    // Le payeur doit être un participant actif de CE compte.
    const [payeur] = await tx
      .select({ id: compteProrataParticipants.id })
      .from(compteProrataParticipants)
      .where(
        and(
          eq(compteProrataParticipants.id, data.avanceParParticipantId),
          eq(compteProrataParticipants.compteProrataId, compte.id),
          isNull(compteProrataParticipants.deletedAt),
        ),
      );
    if (!payeur) return { error: 'Le participant qui a avancé la dépense est introuvable.' };

    const valeurs = {
      avanceParParticipantId: data.avanceParParticipantId,
      dateDepense: data.dateDepense,
      libelle: data.libelle,
      categorie: data.categorie ?? null,
      montantHt: data.montantHt.toFixed(2),
      notes: data.notes ?? null,
    };

    if (data.id) {
      const [before] = await tx
        .select()
        .from(compteProrataDepenses)
        .where(and(eq(compteProrataDepenses.id, data.id), isNull(compteProrataDepenses.deletedAt)));
      if (!before) return { error: 'Dépense introuvable.' };
      const patch = { ...valeurs, updatedAt: new Date(), updatedBy: ctx.utilisateur.id };
      await tx
        .update(compteProrataDepenses)
        .set(patch)
        .where(eq(compteProrataDepenses.id, data.id));
      await auditLogIn(tx, {
        action: 'update',
        tableName: 'compte_prorata_depenses',
        rowId: data.id,
        before,
        after: { ...before, ...patch },
      });
      return { id: data.id };
    }

    const [created] = await tx
      .insert(compteProrataDepenses)
      .values({
        entrepriseId: ctx.entreprise.id, // trigger réécrit depuis le compte parent
        compteProrataId: compte.id,
        createdBy: ctx.utilisateur.id,
        updatedBy: ctx.utilisateur.id,
        ...valeurs,
      })
      .returning({ id: compteProrataDepenses.id });
    if (!created) return { error: 'Échec de la création.' };
    await auditLogIn(tx, {
      action: 'insert',
      tableName: 'compte_prorata_depenses',
      rowId: created.id,
      after: valeurs,
    });
    return { id: created.id };
  });

  if ('error' in res) return { ok: false, error: res.error };
  revalidatePath(`/${ctx.entreprise.slug}/chantiers`, 'layout');
  revalidatePath(`/${ctx.entreprise.slug}/compte-prorata`);
  return { ok: true, data: { id: res.id } };
}

export async function supprimerDepense(id: string): Promise<ActionResult<void>> {
  const ctx = await requireTenantContextWithMfa();
  if (!ROLES_COMPTE_PRORATA_WRITE.includes(ctx.utilisateur.role)) {
    return { ok: false, error: 'Accès refusé.' };
  }

  const result = await withTenant(ctx.entreprise.id, async (tx) => {
    const [before] = await tx
      .select()
      .from(compteProrataDepenses)
      .where(and(eq(compteProrataDepenses.id, id), isNull(compteProrataDepenses.deletedAt)));
    if (!before) return 'Dépense introuvable.';
    const compte = await chargerCompteParId(tx, before.compteProrataId);
    if (compte && compte.statut !== 'ouvert') {
      return 'Compte arrêté : modification impossible.';
    }
    await tx
      .update(compteProrataDepenses)
      .set({ deletedAt: new Date(), updatedBy: ctx.utilisateur.id })
      .where(eq(compteProrataDepenses.id, id));
    await auditLogIn(tx, {
      action: 'delete',
      tableName: 'compte_prorata_depenses',
      rowId: id,
      before,
    });
    return null;
  });

  if (result) return { ok: false, error: result };
  revalidatePath(`/${ctx.entreprise.slug}/chantiers`, 'layout');
  revalidatePath(`/${ctx.entreprise.slug}/compte-prorata`);
  return { ok: true, data: undefined };
}

// ─────────────────────────────────────────────────────────────
// Arrêté / réouverture du compte
// ─────────────────────────────────────────────────────────────

/**
 * Arrête le compte : calcule le bilan, fige un snapshot immuable dans
 * `compte_prorata_arretes` et passe le statut à `arrete` (lecture seule).
 */
export async function arreterCompteProrata(
  input: ArreterCompteProrataInput,
): Promise<ActionResult<{ numero: number }>> {
  const parsed = arreterCompteProrataSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: 'Données invalides.' };
  const ctx = await requireTenantContextWithMfa();
  if (!ROLES_COMPTE_PRORATA_ARRETE.includes(ctx.utilisateur.role)) {
    return { ok: false, error: 'Accès refusé : droit d’arrêté requis.' };
  }
  const data = parsed.data;

  const res = await withTenant(ctx.entreprise.id, async (tx) => {
    const compte = await chargerCompteParId(tx, data.compteProrataId);
    if (!compte) return { error: 'Compte prorata introuvable.' };
    if (compte.statut !== 'ouvert') return { error: 'Le compte n’est pas ouvert.' };

    const participants = await tx
      .select()
      .from(compteProrataParticipants)
      .where(
        and(
          eq(compteProrataParticipants.compteProrataId, compte.id),
          isNull(compteProrataParticipants.deletedAt),
        ),
      );
    if (participants.length === 0) {
      return { error: 'Ajoutez au moins un participant avant d’arrêter le compte.' };
    }
    const depenses = await tx
      .select()
      .from(compteProrataDepenses)
      .where(
        and(
          eq(compteProrataDepenses.compteProrataId, compte.id),
          isNull(compteProrataDepenses.deletedAt),
        ),
      );

    const [maxRow] = await tx
      .select({ maxNumero: sqlMax(compteProrataArretes.numero) })
      .from(compteProrataArretes)
      .where(eq(compteProrataArretes.compteProrataId, compte.id));
    const numero = (maxRow?.maxNumero ?? 0) + 1;

    const arrete = genererArrete(
      versParticipantsCalcul(participants),
      versDepensesCalcul(depenses),
      compte.fraisGestionPct,
      { numero, dateArrete: data.dateArrete },
    );

    const [created] = await tx
      .insert(compteProrataArretes)
      .values({
        entrepriseId: ctx.entreprise.id, // trigger réécrit depuis le compte parent
        compteProrataId: compte.id,
        numero,
        dateArrete: data.dateArrete,
        totalDepensesHt: arrete.totalDepensesHt,
        totalMarcheHt: arrete.totalMarcheHt,
        fraisGestionMontant: arrete.fraisGestionMontant,
        snapshot: arrete,
        createdBy: ctx.utilisateur.id,
        updatedBy: ctx.utilisateur.id,
      })
      .returning({ id: compteProrataArretes.id });
    if (!created) return { error: 'Échec de l’arrêté.' };

    await tx
      .update(compteProrata)
      .set({ statut: 'arrete', updatedAt: new Date(), updatedBy: ctx.utilisateur.id })
      .where(eq(compteProrata.id, compte.id));

    await auditLogIn(tx, {
      action: 'insert',
      tableName: 'compte_prorata_arretes',
      rowId: created.id,
      after: { numero, dateArrete: data.dateArrete, statut: 'arrete' },
    });
    return { numero };
  });

  if ('error' in res) return { ok: false, error: res.error };
  revalidatePath(`/${ctx.entreprise.slug}/chantiers`, 'layout');
  revalidatePath(`/${ctx.entreprise.slug}/compte-prorata`);
  return { ok: true, data: { numero: res.numero } };
}

/** Réouvre un compte arrêté (correction d'erreur). Droit d'arrêté requis. */
export async function rouvrirCompteProrata(compteId: string): Promise<ActionResult<void>> {
  const ctx = await requireTenantContextWithMfa();
  if (!ROLES_COMPTE_PRORATA_ARRETE.includes(ctx.utilisateur.role)) {
    return { ok: false, error: 'Accès refusé : droit d’arrêté requis.' };
  }

  const result = await withTenant(ctx.entreprise.id, async (tx) => {
    const compte = await chargerCompteParId(tx, compteId);
    if (!compte) return 'Compte prorata introuvable.';
    if (compte.statut === 'ouvert') return null; // déjà ouvert (idempotent)
    await tx
      .update(compteProrata)
      .set({ statut: 'ouvert', updatedAt: new Date(), updatedBy: ctx.utilisateur.id })
      .where(eq(compteProrata.id, compteId));
    await auditLogIn(tx, {
      action: 'update',
      tableName: 'compte_prorata',
      rowId: compteId,
      before: { statut: compte.statut },
      after: { statut: 'ouvert' },
    });
    return null;
  });

  if (result) return { ok: false, error: result };
  revalidatePath(`/${ctx.entreprise.slug}/chantiers`, 'layout');
  revalidatePath(`/${ctx.entreprise.slug}/compte-prorata`);
  return { ok: true, data: undefined };
}
