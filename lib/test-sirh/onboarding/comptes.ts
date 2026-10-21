import 'server-only';

import { and, eq, isNull } from 'drizzle-orm';

import type { TenantTx } from '@/lib/db/with-tenant';
import { employes } from '@/db/schema/employes';
import { utilisateurEntreprises } from '@/db/schema/entreprises';
import { sirhCollaborateurs } from '@/db/schema/test-sirh';
import { utilisateurs } from '@/db/schema/utilisateurs';

/**
 * Comptes utilisateurs ↔ collaborateurs pour l'assignation des tâches RH.
 *
 * `utilisateurs` et `utilisateur_entreprises` sont des tables GLOBALES (sans
 * RLS) : l'appartenance au tenant est vérifiée par un filtre explicite sur
 * l'entreprise. À appeler DANS une transaction `withTenant`.
 */

/** Le compte existe, est actif et membre (non retiré) de l'entreprise. */
export async function estUtilisateurMembre(
  tx: TenantTx,
  entrepriseId: string,
  utilisateurId: string,
): Promise<boolean> {
  const [row] = await tx
    .select({ id: utilisateurs.id })
    .from(utilisateurEntreprises)
    .innerJoin(utilisateurs, eq(utilisateurs.id, utilisateurEntreprises.utilisateurId))
    .where(
      and(
        eq(utilisateurEntreprises.utilisateurId, utilisateurId),
        eq(utilisateurEntreprises.entrepriseId, entrepriseId),
        isNull(utilisateurEntreprises.deletedAt),
        isNull(utilisateurs.deletedAt),
        eq(utilisateurs.actif, true),
      ),
    )
    .limit(1);
  return Boolean(row);
}

/**
 * Compte utilisateur d'un employé du tenant (`employes.utilisateur_id`, à
 * défaut `utilisateurs.employe_id`), s'il est membre actif de l'entreprise.
 */
export async function utilisateurDeLEmploye(
  tx: TenantTx,
  entrepriseId: string,
  employeId: string,
): Promise<string | null> {
  const [employe] = await tx
    .select({ utilisateurId: employes.utilisateurId })
    .from(employes)
    .where(and(eq(employes.id, employeId), isNull(employes.deletedAt)))
    .limit(1);
  if (!employe) return null;

  let candidat = employe.utilisateurId;
  if (!candidat) {
    const [compte] = await tx
      .select({ id: utilisateurs.id })
      .from(utilisateurs)
      .where(and(eq(utilisateurs.employeId, employeId), isNull(utilisateurs.deletedAt)))
      .limit(1);
    candidat = compte?.id ?? null;
  }
  if (!candidat) return null;
  return (await estUtilisateurMembre(tx, entrepriseId, candidat)) ? candidat : null;
}

/** Manager (employé) du collaborateur selon sa fiche SIRH, ou `null`. */
export async function managerDeLEmploye(tx: TenantTx, employeId: string): Promise<string | null> {
  const [collaborateur] = await tx
    .select({ managerId: sirhCollaborateurs.managerId })
    .from(sirhCollaborateurs)
    .where(and(eq(sirhCollaborateurs.employeId, employeId), isNull(sirhCollaborateurs.deletedAt)))
    .limit(1);
  return collaborateur?.managerId ?? null;
}
