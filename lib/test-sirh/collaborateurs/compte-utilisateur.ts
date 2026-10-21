'use server';

import { and, eq, isNull, ne } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';

import { auditLogIn } from '@/lib/audit/log';
import type { ActionResult } from '@/lib/common/action-result';
import { withTenant } from '@/lib/db/with-tenant';
import { employes } from '@/db/schema/employes';
import { utilisateurEntreprises } from '@/db/schema/entreprises';
import { utilisateurs } from '@/db/schema/utilisateurs';
import {
  compteUtilisateurSchema,
  type CompteUtilisateurInput,
} from '@/lib/validation/test-sirh/collaborateurs';

import { baseSirh, exigerContexteSirhAction } from '../contexte';
import { nomComplet } from '../format';
import { ROLES_SIRH_GESTION } from '../permissions';

/**
 * Server actions — rattachement d'un compte utilisateur à un collaborateur
 * (`employes.utilisateur_id`, qui ouvre « Mon espace » au salarié).
 *
 * C'est la SEULE écriture du module SIRH dans la table `employes` (module RH) :
 * seule la colonne `utilisateur_id` est modifiée, et tracée dans l'audit.
 */

function revalider(base: string, employeId: string) {
  revalidatePath(`${base}/collaborateurs/${employeId}`);
}

/** Rattache le compte `utilisateurId` (membre de l'entreprise) au collaborateur. */
export async function rattacherCompteUtilisateur(
  input: CompteUtilisateurInput,
): Promise<ActionResult> {
  const ctx = await exigerContexteSirhAction(ROLES_SIRH_GESTION);
  const parsed = compteUtilisateurSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: 'Données invalides.',
      fieldErrors: parsed.error.flatten().fieldErrors as Record<string, string[]>,
    };
  }
  const { employeId, utilisateurId } = parsed.data;

  const resultat = await withTenant(ctx.entreprise.id, async (tx): Promise<ActionResult> => {
    const [employe] = await tx
      .select({ id: employes.id, utilisateurId: employes.utilisateurId })
      .from(employes)
      .where(and(eq(employes.id, employeId), isNull(employes.deletedAt)));
    if (!employe) return { ok: false, error: 'Collaborateur introuvable.' };

    // Le compte doit être membre actif de l'entreprise courante (tables globales,
    // filtrées explicitement sur le tenant).
    const [membre] = await tx
      .select({ id: utilisateurs.id })
      .from(utilisateurEntreprises)
      .innerJoin(utilisateurs, eq(utilisateurs.id, utilisateurEntreprises.utilisateurId))
      .where(
        and(
          eq(utilisateurEntreprises.utilisateurId, utilisateurId),
          eq(utilisateurEntreprises.entrepriseId, ctx.entreprise.id),
          isNull(utilisateurEntreprises.deletedAt),
          isNull(utilisateurs.deletedAt),
          eq(utilisateurs.actif, true),
        ),
      );
    if (!membre) {
      const message = 'Compte introuvable ou non membre de cette entreprise.';
      return { ok: false, error: message, fieldErrors: { utilisateurId: [message] } };
    }

    const [autre] = await tx
      .select({ id: employes.id, nom: employes.nom, prenom: employes.prenom })
      .from(employes)
      .where(
        and(
          eq(employes.utilisateurId, utilisateurId),
          ne(employes.id, employeId),
          isNull(employes.deletedAt),
        ),
      )
      .limit(1);
    if (autre) {
      const message = `Ce compte est déjà rattaché à ${nomComplet(autre.prenom, autre.nom)}.`;
      return { ok: false, error: message, fieldErrors: { utilisateurId: [message] } };
    }

    if (employe.utilisateurId === utilisateurId) return { ok: true, data: undefined };

    await tx
      .update(employes)
      .set({ utilisateurId, updatedBy: ctx.utilisateur.id })
      .where(eq(employes.id, employeId));
    await auditLogIn(tx, {
      action: 'update',
      tableName: 'employes',
      rowId: employeId,
      before: { utilisateurId: employe.utilisateurId },
      after: { utilisateurId },
    });
    return { ok: true, data: undefined };
  });

  if (resultat.ok) revalider(baseSirh(ctx), employeId);
  return resultat;
}

/** Détache le compte utilisateur du collaborateur (`employes.utilisateur_id` → NULL). */
export async function detacherCompteUtilisateur(employeId: string): Promise<ActionResult> {
  const ctx = await exigerContexteSirhAction(ROLES_SIRH_GESTION);

  const resultat = await withTenant(ctx.entreprise.id, async (tx): Promise<ActionResult> => {
    const [employe] = await tx
      .select({ id: employes.id, utilisateurId: employes.utilisateurId })
      .from(employes)
      .where(and(eq(employes.id, employeId), isNull(employes.deletedAt)));
    if (!employe) return { ok: false, error: 'Collaborateur introuvable.' };
    if (!employe.utilisateurId) return { ok: true, data: undefined };

    await tx
      .update(employes)
      .set({ utilisateurId: null, updatedBy: ctx.utilisateur.id })
      .where(eq(employes.id, employeId));
    await auditLogIn(tx, {
      action: 'update',
      tableName: 'employes',
      rowId: employeId,
      before: { utilisateurId: employe.utilisateurId },
      after: { utilisateurId: null },
    });
    return { ok: true, data: undefined };
  });

  if (resultat.ok) revalider(baseSirh(ctx), employeId);
  return resultat;
}
