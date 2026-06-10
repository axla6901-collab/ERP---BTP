'use server';

import { and, asc, count, eq, isNull, max as sqlMax } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';

import { auditLogIn } from '@/lib/audit/log';
import { requireTenantContextWithMfa } from '@/lib/auth/tenant-guards';
import { withTenant, type TenantTx } from '@/lib/db/with-tenant';
import { messageBlocageSuppression } from '@/lib/common/references-suppression';
import {
  chantierTaches,
  chantiers,
  type ChantierTache,
} from '@/db/schema/chantiers';
import { pointages } from '@/db/schema/pointages';
import { utilisateurs } from '@/db/schema/utilisateurs';
import {
  chantierTacheSchema,
  TRANSITIONS_TACHE,
  type ChantierTacheInput,
  type StatutTache,
} from '@/lib/validation/chantier-taches';

import { ROLES_CHANTIER_WRITE } from './permissions';
import type { ActionResult } from '@/lib/catalogue/types';

export type TacheAvecResponsable = ChantierTache & {
  responsableEmail: string | null;
};

// ─────────────────────────────────────────────────────────────
// Lecture
// ─────────────────────────────────────────────────────────────

export async function listerTaches(chantierId: string): Promise<TacheAvecResponsable[]> {
  const ctx = await requireTenantContextWithMfa();
  const rows = await withTenant(ctx.entreprise.id, (tx) =>
    tx
      .select({
        tache: chantierTaches,
        responsable: { email: utilisateurs.email },
      })
      .from(chantierTaches)
      .leftJoin(utilisateurs, eq(chantierTaches.responsableId, utilisateurs.id))
      .where(and(eq(chantierTaches.chantierId, chantierId), isNull(chantierTaches.deletedAt)))
      .orderBy(asc(chantierTaches.ordre), asc(chantierTaches.createdAt)),
  );
  return rows.map((r) => ({
    ...r.tache,
    responsableEmail: r.responsable?.email ?? null,
  }));
}

// ─────────────────────────────────────────────────────────────
// Mutations
// ─────────────────────────────────────────────────────────────

async function chantierExistant(tx: TenantTx, chantierId: string): Promise<boolean> {
  const [row] = await tx
    .select({ id: chantiers.id })
    .from(chantiers)
    .where(and(eq(chantiers.id, chantierId), isNull(chantiers.deletedAt)))
    .limit(1);
  return Boolean(row);
}

export async function creerTache(
  chantierId: string,
  input: ChantierTacheInput,
): Promise<ActionResult<{ id: string }>> {
  const ctx = await requireTenantContextWithMfa(ROLES_CHANTIER_WRITE);
  const parsed = chantierTacheSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: 'Données invalides.',
      fieldErrors: parsed.error.flatten().fieldErrors as Record<string, string[]>,
    };
  }

  try {
    const id = await withTenant(ctx.entreprise.id, async (tx) => {
      if (!(await chantierExistant(tx, chantierId))) {
        throw new Error('CHANTIER_NOT_FOUND');
      }
      const [agg] = await tx
        .select({ maxOrdre: sqlMax(chantierTaches.ordre) })
        .from(chantierTaches)
        .where(
          and(eq(chantierTaches.chantierId, chantierId), isNull(chantierTaches.deletedAt)),
        );
      const ordre = (agg?.maxOrdre ?? -1) + 1;

      const [inserted] = await tx
        .insert(chantierTaches)
        .values({
          entrepriseId: ctx.entreprise.id,
          chantierId,
          ordre,
          libelle: parsed.data.libelle,
          description: parsed.data.description,
          responsableId: parsed.data.responsableId,
          statut: parsed.data.statut,
          avancementPourcent: parsed.data.avancementPourcent,
          dateDebutPrevue: parsed.data.dateDebutPrevue,
          dateFinPrevue: parsed.data.dateFinPrevue,
          dateDebutReelle: parsed.data.dateDebutReelle,
          dateFinReelle: parsed.data.dateFinReelle,
          notes: parsed.data.notes,
          createdBy: ctx.utilisateur.id,
          updatedBy: ctx.utilisateur.id,
        })
        .returning({ id: chantierTaches.id });
      if (!inserted) throw new Error('INSERT failed');

      await auditLogIn(tx, {
        action: 'insert',
        tableName: 'chantier_taches',
        rowId: inserted.id,
        after: { chantierId, ordre, ...parsed.data },
      });
      return inserted.id;
    });
    revalidatePath(`/${ctx.entreprise.slug}/chantiers/${chantierId}`);
    return { ok: true, data: { id } };
  } catch (err) {
    if (err instanceof Error && err.message === 'CHANTIER_NOT_FOUND') {
      return { ok: false, error: 'Chantier introuvable.' };
    }
    throw err;
  }
}

export async function mettreAJourTache(
  id: string,
  input: ChantierTacheInput,
): Promise<ActionResult> {
  const ctx = await requireTenantContextWithMfa(ROLES_CHANTIER_WRITE);
  const parsed = chantierTacheSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: 'Données invalides.',
      fieldErrors: parsed.error.flatten().fieldErrors as Record<string, string[]>,
    };
  }

  try {
    const chantierId = await withTenant(ctx.entreprise.id, async (tx) => {
      const [before] = await tx
        .select()
        .from(chantierTaches)
        .where(and(eq(chantierTaches.id, id), isNull(chantierTaches.deletedAt)));
      if (!before) throw new Error('NOT_FOUND');

      await tx
        .update(chantierTaches)
        .set({
          libelle: parsed.data.libelle,
          description: parsed.data.description,
          responsableId: parsed.data.responsableId,
          avancementPourcent: parsed.data.avancementPourcent,
          dateDebutPrevue: parsed.data.dateDebutPrevue,
          dateFinPrevue: parsed.data.dateFinPrevue,
          dateDebutReelle: parsed.data.dateDebutReelle,
          dateFinReelle: parsed.data.dateFinReelle,
          notes: parsed.data.notes,
          updatedBy: ctx.utilisateur.id,
        })
        .where(eq(chantierTaches.id, id));

      await auditLogIn(tx, {
        action: 'update',
        tableName: 'chantier_taches',
        rowId: id,
        before,
        after: parsed.data,
      });
      return before.chantierId;
    });
    revalidatePath(`/${ctx.entreprise.slug}/chantiers/${chantierId}`);
    return { ok: true, data: undefined };
  } catch (err) {
    if (err instanceof Error && err.message === 'NOT_FOUND') {
      return { ok: false, error: 'Tâche introuvable.' };
    }
    throw err;
  }
}

export async function changerStatutTache(
  id: string,
  nouveauStatut: StatutTache,
): Promise<ActionResult> {
  const ctx = await requireTenantContextWithMfa(ROLES_CHANTIER_WRITE);
  try {
    const chantierId = await withTenant(ctx.entreprise.id, async (tx) => {
      const [before] = await tx
        .select()
        .from(chantierTaches)
        .where(and(eq(chantierTaches.id, id), isNull(chantierTaches.deletedAt)));
      if (!before) throw new Error('NOT_FOUND');

      const transitionsValides = TRANSITIONS_TACHE[before.statut as StatutTache];
      if (!transitionsValides.includes(nouveauStatut)) {
        throw new Error(
          `Transition impossible : ${before.statut} → ${nouveauStatut}. Possible : ${transitionsValides.join(', ') || 'aucune'}.`,
        );
      }

      const updates: Partial<typeof chantierTaches.$inferInsert> = {
        statut: nouveauStatut,
        updatedBy: ctx.utilisateur.id,
      };
      const aujourdHui = new Date().toISOString().slice(0, 10);
      if (nouveauStatut === 'en_cours' && !before.dateDebutReelle) {
        updates.dateDebutReelle = aujourdHui;
      }
      if (nouveauStatut === 'termine') {
        if (!before.dateFinReelle) updates.dateFinReelle = aujourdHui;
        updates.avancementPourcent = 100;
      }

      await tx.update(chantierTaches).set(updates).where(eq(chantierTaches.id, id));

      await auditLogIn(tx, {
        action: 'update',
        tableName: 'chantier_taches',
        rowId: id,
        before: { statut: before.statut, avancement: before.avancementPourcent },
        after: { statut: nouveauStatut, ...updates },
      });
      return before.chantierId;
    });
    revalidatePath(`/${ctx.entreprise.slug}/chantiers/${chantierId}`);
    return { ok: true, data: undefined };
  } catch (err) {
    if (err instanceof Error) {
      if (err.message === 'NOT_FOUND') return { ok: false, error: 'Tâche introuvable.' };
      if (err.message.startsWith('Transition impossible')) {
        return { ok: false, error: err.message };
      }
    }
    throw err;
  }
}

export async function mettreAJourAvancement(
  id: string,
  pourcent: number,
): Promise<ActionResult> {
  const ctx = await requireTenantContextWithMfa(ROLES_CHANTIER_WRITE);
  if (!Number.isFinite(pourcent) || pourcent < 0 || pourcent > 100) {
    return { ok: false, error: 'Avancement entre 0 et 100.' };
  }
  const rounded = Math.round(pourcent);
  try {
    const chantierId = await withTenant(ctx.entreprise.id, async (tx) => {
      const [before] = await tx
        .select()
        .from(chantierTaches)
        .where(and(eq(chantierTaches.id, id), isNull(chantierTaches.deletedAt)));
      if (!before) throw new Error('NOT_FOUND');

      await tx
        .update(chantierTaches)
        .set({ avancementPourcent: rounded, updatedBy: ctx.utilisateur.id })
        .where(eq(chantierTaches.id, id));

      await auditLogIn(tx, {
        action: 'update',
        tableName: 'chantier_taches',
        rowId: id,
        before: { avancement: before.avancementPourcent },
        after: { avancement: rounded },
      });
      return before.chantierId;
    });
    revalidatePath(`/${ctx.entreprise.slug}/chantiers/${chantierId}`);
    return { ok: true, data: undefined };
  } catch (err) {
    if (err instanceof Error && err.message === 'NOT_FOUND') {
      return { ok: false, error: 'Tâche introuvable.' };
    }
    throw err;
  }
}

export async function supprimerTache(id: string): Promise<ActionResult> {
  const ctx = await requireTenantContextWithMfa(ROLES_CHANTIER_WRITE);
  try {
    const res = await withTenant(
      ctx.entreprise.id,
      async (tx): Promise<{ blocage: string } | { chantierId: string }> => {
        const [before] = await tx
          .select()
          .from(chantierTaches)
          .where(and(eq(chantierTaches.id, id), isNull(chantierTaches.deletedAt)));
        if (!before) throw new Error('NOT_FOUND');

        // Soft-delete : pas de FK déclenchée → on bloque si des pointages
        // sont rattachés à cette tâche.
        const [rPointages] = await tx
          .select({ n: count() })
          .from(pointages)
          .where(eq(pointages.chantierTacheId, id));
        const message = messageBlocageSuppression('cette tâche', [
          { nombre: rPointages?.n ?? 0, singulier: 'pointage', pluriel: 'pointages' },
        ]);
        if (message) return { blocage: message };

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
        return { chantierId: before.chantierId };
      },
    );
    if ('blocage' in res) return { ok: false, error: res.blocage };
    revalidatePath(`/${ctx.entreprise.slug}/chantiers/${res.chantierId}`);
    return { ok: true, data: undefined };
  } catch (err) {
    if (err instanceof Error && err.message === 'NOT_FOUND') {
      return { ok: false, error: 'Tâche introuvable.' };
    }
    throw err;
  }
}

/**
 * Déplace une tâche d'une position vers le haut (`direction = -1`) ou
 * vers le bas (`+1`) en échangeant son `ordre` avec celle voisine.
 */
export async function deplacerTache(
  id: string,
  direction: -1 | 1,
): Promise<ActionResult> {
  const ctx = await requireTenantContextWithMfa(ROLES_CHANTIER_WRITE);
  try {
    const chantierId = await withTenant(ctx.entreprise.id, async (tx) => {
      const [tache] = await tx
        .select()
        .from(chantierTaches)
        .where(and(eq(chantierTaches.id, id), isNull(chantierTaches.deletedAt)));
      if (!tache) throw new Error('NOT_FOUND');

      const taches = await tx
        .select()
        .from(chantierTaches)
        .where(
          and(
            eq(chantierTaches.chantierId, tache.chantierId),
            isNull(chantierTaches.deletedAt),
          ),
        )
        .orderBy(asc(chantierTaches.ordre), asc(chantierTaches.createdAt));

      const index = taches.findIndex((t) => t.id === id);
      const cible = index + direction;
      if (cible < 0 || cible >= taches.length) return tache.chantierId; // déjà à l'extrémité

      const voisine = taches[cible]!;
      const ordreTache = tache.ordre;
      const ordreVoisine = voisine.ordre;

      // Échange en deux UPDATE (pas d'unique sur ordre → simple).
      await tx
        .update(chantierTaches)
        .set({ ordre: ordreVoisine, updatedBy: ctx.utilisateur.id })
        .where(eq(chantierTaches.id, tache.id));
      await tx
        .update(chantierTaches)
        .set({ ordre: ordreTache, updatedBy: ctx.utilisateur.id })
        .where(eq(chantierTaches.id, voisine.id));

      await auditLogIn(tx, {
        action: 'update',
        tableName: 'chantier_taches',
        rowId: tache.id,
        before: { ordre: ordreTache },
        after: { ordre: ordreVoisine, swappedWith: voisine.id },
      });
      return tache.chantierId;
    });
    revalidatePath(`/${ctx.entreprise.slug}/chantiers/${chantierId}`);
    return { ok: true, data: undefined };
  } catch (err) {
    if (err instanceof Error && err.message === 'NOT_FOUND') {
      return { ok: false, error: 'Tâche introuvable.' };
    }
    throw err;
  }
}
