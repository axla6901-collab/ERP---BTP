import 'server-only';

import { and, desc, eq, gte, isNull, lte, or, type SQL } from 'drizzle-orm';

import { withTenant, type TenantTx } from '@/lib/db/with-tenant';
import {
  sirhAnnonces,
  sirhCollaborateurs,
  sirhEquipeMembres,
  sirhEquipes,
  sirhSites,
} from '@/db/schema/test-sirh';
import { utilisateurs } from '@/db/schema/utilisateurs';

import { employeIdDeLUtilisateur } from '../acces';
import { aujourdhuiIso } from '../calendrier';
import { exigerContexteSirhAction } from '../contexte';
import { ROLES_SIRH_GESTION } from '../permissions';

import type { AnnonceAffichee } from './types';
import { adhesionActive, annoncesVisibles, trierAnnonces, type ProfilAudience } from './visibilite';

/**
 * Lectures — Test SIRH › Annonces (communication interne). Fonctions
 * `server-only` appelées depuis les Server Components. Dates ISO.
 */

/** Annonces non supprimées correspondant à `condition`, avec audience et auteur. */
async function lireAnnonces(tx: TenantTx, condition: SQL | undefined): Promise<AnnonceAffichee[]> {
  const rows = await tx
    .select({
      id: sirhAnnonces.id,
      titre: sirhAnnonces.titre,
      contenu: sirhAnnonces.contenu,
      categorie: sirhAnnonces.categorie,
      epinglee: sirhAnnonces.epinglee,
      publiee: sirhAnnonces.publiee,
      datePublication: sirhAnnonces.datePublication,
      dateExpiration: sirhAnnonces.dateExpiration,
      siteId: sirhAnnonces.siteId,
      siteNom: sirhSites.nom,
      equipeId: sirhAnnonces.equipeId,
      equipeNom: sirhEquipes.nom,
      auteur: utilisateurs.email,
      createdAt: sirhAnnonces.createdAt,
    })
    .from(sirhAnnonces)
    .leftJoin(sirhSites, eq(sirhSites.id, sirhAnnonces.siteId))
    .leftJoin(sirhEquipes, eq(sirhEquipes.id, sirhAnnonces.equipeId))
    .leftJoin(utilisateurs, eq(utilisateurs.id, sirhAnnonces.auteurId))
    .where(and(isNull(sirhAnnonces.deletedAt), condition))
    .orderBy(
      desc(sirhAnnonces.epinglee),
      desc(sirhAnnonces.datePublication),
      desc(sirhAnnonces.createdAt),
    );
  return rows.map((r) => ({ ...r, createdAt: r.createdAt.toISOString() }));
}

/**
 * Site et équipes (appartenances en vigueur) du collaborateur lié à
 * l'utilisateur ; `null` si aucun collaborateur n'est rattaché au compte.
 */
async function profilAudience(
  tx: TenantTx,
  utilisateurId: string,
  today: string,
): Promise<ProfilAudience | null> {
  const employeId = await employeIdDeLUtilisateur(tx, utilisateurId);
  if (!employeId) return null;
  const [collaborateur] = await tx
    .select({ siteId: sirhCollaborateurs.siteId })
    .from(sirhCollaborateurs)
    .where(and(eq(sirhCollaborateurs.employeId, employeId), isNull(sirhCollaborateurs.deletedAt)))
    .limit(1);
  const membres = await tx
    .select({
      equipeId: sirhEquipeMembres.equipeId,
      dateDebut: sirhEquipeMembres.dateDebut,
      dateFin: sirhEquipeMembres.dateFin,
    })
    .from(sirhEquipeMembres)
    .where(and(eq(sirhEquipeMembres.employeId, employeId), isNull(sirhEquipeMembres.deletedAt)));
  return {
    siteId: collaborateur?.siteId ?? null,
    equipeIds: membres.filter((m) => adhesionActive(m, today)).map((m) => m.equipeId),
  };
}

/**
 * Fil d'actualité de l'utilisateur courant (TOUS les rôles : page Annonces,
 * « Mon espace », tableau de bord) : annonces publiées, non expirées, dont il
 * fait partie de l'audience — épinglées d'abord puis les plus récentes.
 */
export async function listerAnnoncesVisibles(limite?: number): Promise<AnnonceAffichee[]> {
  const ctx = await exigerContexteSirhAction();
  const today = aujourdhuiIso();
  const borne =
    limite !== undefined && Number.isFinite(limite) ? Math.max(0, Math.floor(limite)) : undefined;
  return withTenant(ctx.entreprise.id, async (tx) => {
    const enLigne = await lireAnnonces(
      tx,
      and(
        eq(sirhAnnonces.publiee, true),
        lte(sirhAnnonces.datePublication, today),
        or(isNull(sirhAnnonces.dateExpiration), gte(sirhAnnonces.dateExpiration, today)),
      ),
    );
    const profil = await profilAudience(tx, ctx.utilisateur.id, today);
    return annoncesVisibles(enLigne, profil, today, borne);
  });
}

/** Toutes les annonces (brouillons, programmées, expirées, toutes audiences) — gestionnaires RH. */
export async function listerAnnoncesGestion(): Promise<AnnonceAffichee[]> {
  const ctx = await exigerContexteSirhAction(ROLES_SIRH_GESTION);
  return withTenant(ctx.entreprise.id, async (tx) =>
    trierAnnonces(await lireAnnonces(tx, undefined)),
  );
}
