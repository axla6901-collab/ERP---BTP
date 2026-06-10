'use server';

import { and, asc, count, eq, isNull, sql } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';

import {
  articles,
  fournisseurContacts,
  fournisseurs,
  grillesTarifaires,
  prixArticles,
  type Fournisseur,
  type FournisseurContact,
} from '@/db/schema/catalogue';
import { auditLogIn } from '@/lib/audit/log';
import { requireTenantContextWithMfa } from '@/lib/auth/tenant-guards';
import { withTenant } from '@/lib/db/with-tenant';
import { messageBlocageSuppression } from '@/lib/common/references-suppression';
import { fournisseurSchema, type FournisseurInput } from '@/lib/validation/tiers';

import { ROLES_TIERS_WRITE } from './permissions';
import type { ActionResult } from './types';

export type FournisseurAvecCompteurs = Fournisseur & {
  contactsActifs: number;
  contactsTotal: number;
};

export async function listerFournisseurs(): Promise<FournisseurAvecCompteurs[]> {
  const ctx = await requireTenantContextWithMfa();
  const rows = await withTenant(ctx.entreprise.id, (tx) =>
    tx
      .select({
        // Toutes les colonnes de fournisseurs
        id: fournisseurs.id,
        entrepriseId: fournisseurs.entrepriseId,
        code: fournisseurs.code,
        nom: fournisseurs.nom,
        siret: fournisseurs.siret,
        email: fournisseurs.email,
        telephone: fournisseurs.telephone,
        adresseLigne1: fournisseurs.adresseLigne1,
        adresseLigne2: fournisseurs.adresseLigne2,
        codePostal: fournisseurs.codePostal,
        ville: fournisseurs.ville,
        pays: fournisseurs.pays,
        actif: fournisseurs.actif,
        dateSortie: fournisseurs.dateSortie,
        createdAt: fournisseurs.createdAt,
        updatedAt: fournisseurs.updatedAt,
        createdBy: fournisseurs.createdBy,
        updatedBy: fournisseurs.updatedBy,
        deletedAt: fournisseurs.deletedAt,
        contactsActifs: sql<number>`
          (SELECT COUNT(*)::int FROM fournisseur_contacts c
           WHERE c.fournisseur_id = fournisseurs.id
             AND c.deleted_at IS NULL
             AND c.actif = true)
        `,
        contactsTotal: sql<number>`
          (SELECT COUNT(*)::int FROM fournisseur_contacts c
           WHERE c.fournisseur_id = fournisseurs.id
             AND c.deleted_at IS NULL)
        `,
      })
      .from(fournisseurs)
      .where(isNull(fournisseurs.deletedAt))
      .orderBy(asc(fournisseurs.nom)),
  );
  return rows;
}

export async function lireFournisseur(id: string): Promise<Fournisseur | null> {
  const ctx = await requireTenantContextWithMfa();
  const [row] = await withTenant(ctx.entreprise.id, (tx) =>
    tx
      .select()
      .from(fournisseurs)
      .where(and(eq(fournisseurs.id, id), isNull(fournisseurs.deletedAt)))
      .limit(1),
  );
  return row ?? null;
}

export async function listerFournisseurContacts(
  fournisseurId: string,
): Promise<FournisseurContact[]> {
  const ctx = await requireTenantContextWithMfa();
  return withTenant(ctx.entreprise.id, (tx) =>
    tx
      .select()
      .from(fournisseurContacts)
      .where(
        and(
          eq(fournisseurContacts.fournisseurId, fournisseurId),
          isNull(fournisseurContacts.deletedAt),
        ),
      )
      .orderBy(
        // Principaux en premier, puis actifs, puis par nom
        sql`${fournisseurContacts.principal} DESC, ${fournisseurContacts.actif} DESC, ${fournisseurContacts.nom} ASC`,
      ),
  );
}

export async function creerFournisseur(
  input: FournisseurInput,
): Promise<ActionResult<{ id: string }>> {
  const ctx = await requireTenantContextWithMfa(ROLES_TIERS_WRITE);
  const parsed = fournisseurSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: 'Données invalides.', fieldErrors: parsed.error.flatten().fieldErrors };
  }

  try {
    const id = await withTenant(ctx.entreprise.id, async (tx) => {
      const [inserted] = await tx
        .insert(fournisseurs)
        .values({
          entrepriseId: ctx.entreprise.id,
          code: parsed.data.code,
          nom: parsed.data.nom,
          siret: parsed.data.siret,
          email: parsed.data.email,
          telephone: parsed.data.telephone,
          adresseLigne1: parsed.data.adresseLigne1,
          adresseLigne2: parsed.data.adresseLigne2,
          codePostal: parsed.data.codePostal,
          ville: parsed.data.ville,
          pays: parsed.data.pays,
          actif: parsed.data.actif,
          createdBy: ctx.utilisateur.id,
          updatedBy: ctx.utilisateur.id,
        })
        .returning({ id: fournisseurs.id });
      if (!inserted) throw new Error('INSERT failed');

      // Les contacts ne sont plus saisis ici : ils s'ajoutent depuis la fiche
      // via la frame ContactDialog (server actions lib/tiers/contacts-actions.ts).

      await auditLogIn(tx, {
        action: 'insert',
        tableName: 'fournisseurs',
        rowId: inserted.id,
        after: parsed.data,
      });
      return inserted.id;
    });
    revalidatePath(`/${ctx.entreprise.slug}/tiers/fournisseurs`);
    revalidatePath(`/${ctx.entreprise.slug}/tiers`);
    return { ok: true, data: { id } };
  } catch (err) {
    if (err instanceof Error && /unique/i.test(err.message)) {
      return { ok: false, error: `Le code "${parsed.data.code}" ou le SIRET existe déjà.` };
    }
    throw err;
  }
}

export async function mettreAJourFournisseur(
  id: string,
  input: FournisseurInput,
): Promise<ActionResult> {
  const ctx = await requireTenantContextWithMfa(ROLES_TIERS_WRITE);
  const parsed = fournisseurSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: 'Données invalides.', fieldErrors: parsed.error.flatten().fieldErrors };
  }

  try {
    await withTenant(ctx.entreprise.id, async (tx) => {
      const [before] = await tx
        .select()
        .from(fournisseurs)
        .where(and(eq(fournisseurs.id, id), isNull(fournisseurs.deletedAt)));
      if (!before) throw new Error('NOT_FOUND');

      await tx
        .update(fournisseurs)
        .set({
          code: parsed.data.code,
          nom: parsed.data.nom,
          siret: parsed.data.siret,
          email: parsed.data.email,
          telephone: parsed.data.telephone,
          adresseLigne1: parsed.data.adresseLigne1,
          adresseLigne2: parsed.data.adresseLigne2,
          codePostal: parsed.data.codePostal,
          ville: parsed.data.ville,
          pays: parsed.data.pays,
          actif: parsed.data.actif,
          updatedBy: ctx.utilisateur.id,
        })
        .where(eq(fournisseurs.id, id));

      // Les contacts se gèrent depuis la fiche via la frame ContactDialog
      // (enregistrement immédiat) — plus de diff de contacts ici.

      await auditLogIn(tx, {
        action: 'update',
        tableName: 'fournisseurs',
        rowId: id,
        before,
        after: parsed.data,
      });
    });
    revalidatePath(`/${ctx.entreprise.slug}/tiers/fournisseurs`);
    revalidatePath(`/${ctx.entreprise.slug}/tiers/fournisseurs/${id}`);
    return { ok: true, data: undefined };
  } catch (err) {
    if (err instanceof Error && err.message === 'NOT_FOUND') {
      return { ok: false, error: 'Fournisseur introuvable.' };
    }
    if (err instanceof Error && /unique/i.test(err.message)) {
      return { ok: false, error: `Le code ou le SIRET existe déjà.` };
    }
    throw err;
  }
}

/**
 * Bascule le statut actif/inactif d'un fournisseur sans ouvrir le formulaire
 * complet. Action idempotente : si le fournisseur est déjà dans l'état cible,
 * on ne touche ni la ligne ni l'audit. Réutilisée par la liste et le bandeau
 * de la fiche.
 */
export async function changerStatutFournisseur(
  id: string,
  actif: boolean,
): Promise<ActionResult> {
  const ctx = await requireTenantContextWithMfa(ROLES_TIERS_WRITE);
  try {
    await withTenant(ctx.entreprise.id, async (tx) => {
      const [before] = await tx
        .select()
        .from(fournisseurs)
        .where(and(eq(fournisseurs.id, id), isNull(fournisseurs.deletedAt)));
      if (!before) throw new Error('NOT_FOUND');
      if (before.actif === actif) return; // déjà dans l'état voulu
      // La contrainte chk_fournisseurs_actif_date couple actif et date_sortie :
      // actif ⟺ date_sortie NULL, inactif ⟺ date_sortie renseignée. On les met
      // donc à jour ensemble (date du jour à la désactivation, NULL à la réactivation).
      const dateSortie = actif ? null : new Date().toISOString().slice(0, 10);
      await tx
        .update(fournisseurs)
        .set({ actif, dateSortie, updatedBy: ctx.utilisateur.id })
        .where(eq(fournisseurs.id, id));
      await auditLogIn(tx, {
        action: 'update',
        tableName: 'fournisseurs',
        rowId: id,
        before,
        after: { ...before, actif, dateSortie },
      });
    });
    revalidatePath(`/${ctx.entreprise.slug}/tiers/fournisseurs`);
    revalidatePath(`/${ctx.entreprise.slug}/tiers/fournisseurs/${id}`);
    revalidatePath(`/${ctx.entreprise.slug}/tiers/contacts`);
    return { ok: true, data: undefined };
  } catch (err) {
    if (err instanceof Error && err.message === 'NOT_FOUND') {
      return { ok: false, error: 'Fournisseur introuvable.' };
    }
    throw err;
  }
}

export async function supprimerFournisseur(id: string): Promise<ActionResult> {
  const ctx = await requireTenantContextWithMfa(ROLES_TIERS_WRITE);
  // Soft-delete : aucune contrainte FK n'est déclenchée (cf. supprimerClient).
  // On vérifie donc explicitement que le fournisseur n'apparaît nulle part
  // ailleurs (grilles tarifaires, prix négociés, fournisseur préféré d'un article).
  // Les contacts (sous-objets en cascade) ne comptent pas.
  const blocage = await withTenant(ctx.entreprise.id, async (tx) => {
    const [before] = await tx
      .select()
      .from(fournisseurs)
      .where(and(eq(fournisseurs.id, id), isNull(fournisseurs.deletedAt)));
    if (!before) return null;

    const [rGrilles] = await tx
      .select({ n: count() })
      .from(grillesTarifaires)
      .where(eq(grillesTarifaires.fournisseurId, id));
    const [rPrix] = await tx
      .select({ n: count() })
      .from(prixArticles)
      .where(eq(prixArticles.fournisseurId, id));
    const [rArticles] = await tx
      .select({ n: count() })
      .from(articles)
      .where(eq(articles.fournisseurPrefereId, id));

    const message = messageBlocageSuppression('ce fournisseur', [
      { nombre: rGrilles?.n ?? 0, singulier: 'grille tarifaire', pluriel: 'grilles tarifaires' },
      { nombre: rPrix?.n ?? 0, singulier: 'prix négocié', pluriel: 'prix négociés' },
      {
        nombre: rArticles?.n ?? 0,
        singulier: 'article (fournisseur préféré)',
        pluriel: 'articles (fournisseur préféré)',
      },
    ]);
    if (message) return message;

    await tx
      .update(fournisseurs)
      .set({ deletedAt: new Date(), updatedBy: ctx.utilisateur.id })
      .where(eq(fournisseurs.id, id));
    await auditLogIn(tx, {
      action: 'delete',
      tableName: 'fournisseurs',
      rowId: id,
      before,
    });
    return null;
  });

  if (blocage) return { ok: false, error: blocage };
  revalidatePath(`/${ctx.entreprise.slug}/tiers/fournisseurs`);
  return { ok: true, data: undefined };
}
