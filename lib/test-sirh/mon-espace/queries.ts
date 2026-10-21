import 'server-only';

import { and, desc, eq, isNull } from 'drizzle-orm';

import { withTenant } from '@/lib/db/with-tenant';
import { employes } from '@/db/schema/employes';
import { sirhCollaborateurs, sirhContrats, sirhPostes, sirhSites } from '@/db/schema/test-sirh';
import type { TypeContratSirh } from '@/lib/validation/test-sirh/enums';

import { employeIdDeLUtilisateur } from '../acces';
import { aujourdhuiIso } from '../calendrier';
import { exigerContexteSirhAction } from '../contexte';
import { nomComplet } from '../format';

/**
 * Lecture « libre-service » du profil de Mon espace : UNIQUEMENT l'employé
 * rattaché à l'utilisateur courant (aucun rôle de gestion requis — un ouvrier y
 * accède pour lui-même). Aucune donnée de rémunération n'est exposée.
 * Les autres blocs de Mon espace réutilisent les lectures des domaines, qui
 * acceptent toutes « rôle de lecture OU soi-même ».
 */

export type MonProfil = {
  employeId: string;
  nomComplet: string;
  matricule: string | null;
  dateEntree: string | null;
  poste: string | null;
  site: string | null;
  manager: string | null;
  contrat: { typeContrat: TypeContratSirh; dateDebut: string; dateFin: string | null } | null;
};

/** Profil de l'utilisateur courant, ou `null` s'il n'est rattaché à aucun employé. */
export async function lireMonProfil(): Promise<MonProfil | null> {
  const ctx = await exigerContexteSirhAction();
  return withTenant(ctx.entreprise.id, async (tx) => {
    const employeId = await employeIdDeLUtilisateur(tx, ctx.utilisateur.id);
    if (!employeId) return null;

    const [e] = await tx
      .select({
        id: employes.id,
        nom: employes.nom,
        prenom: employes.prenom,
        matricule: employes.matricule,
        dateEntree: employes.dateEntree,
      })
      .from(employes)
      .where(eq(employes.id, employeId))
      .limit(1);
    if (!e) return null;

    const [collab] = await tx
      .select({
        poste: sirhPostes.intitule,
        site: sirhSites.nom,
        managerId: sirhCollaborateurs.managerId,
      })
      .from(sirhCollaborateurs)
      .leftJoin(sirhPostes, eq(sirhPostes.id, sirhCollaborateurs.posteId))
      .leftJoin(sirhSites, eq(sirhSites.id, sirhCollaborateurs.siteId))
      .where(and(eq(sirhCollaborateurs.employeId, employeId), isNull(sirhCollaborateurs.deletedAt)))
      .limit(1);

    let manager: string | null = null;
    if (collab?.managerId) {
      const [m] = await tx
        .select({ nom: employes.nom, prenom: employes.prenom })
        .from(employes)
        .where(eq(employes.id, collab.managerId))
        .limit(1);
      if (m) manager = nomComplet(m.prenom, m.nom);
    }

    // Contrat en cours : le plus récent ayant commencé et non terminé.
    const today = aujourdhuiIso();
    const contrats = await tx
      .select({
        typeContrat: sirhContrats.typeContrat,
        dateDebut: sirhContrats.dateDebut,
        dateFin: sirhContrats.dateFin,
      })
      .from(sirhContrats)
      .where(and(eq(sirhContrats.employeId, employeId), isNull(sirhContrats.deletedAt)))
      .orderBy(desc(sirhContrats.dateDebut));
    const enCours =
      contrats.find((c) => c.dateDebut <= today && (c.dateFin === null || c.dateFin >= today)) ??
      null;

    return {
      employeId: e.id,
      nomComplet: nomComplet(e.prenom, e.nom),
      matricule: e.matricule,
      dateEntree: e.dateEntree,
      poste: collab?.poste ?? null,
      site: collab?.site ?? null,
      manager,
      contrat: enCours,
    };
  });
}
