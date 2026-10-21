import 'server-only';

import { and, asc, count, eq, isNull } from 'drizzle-orm';

import { withTenant } from '@/lib/db/with-tenant';
import { employes } from '@/db/schema/employes';
import {
  sirhCollaborateurs,
  sirhContrats,
  sirhEquipeMembres,
  sirhEquipes,
  sirhPostes,
  sirhSites,
  type SirhSite,
} from '@/db/schema/test-sirh';
import type { CategorieProfessionnelle } from '@/lib/validation/test-sirh/enums';

import { aujourdhuiIso } from '../calendrier';
import { exigerContexteSirhAction } from '../contexte';
import { nomComplet } from '../format';
import { ROLES_SIRH_LECTURE } from '../permissions';
import { effectifEquipe } from './membres';

/**
 * Lectures — Test SIRH › Organisation. Fonctions `server-only` (pas des server
 * actions) appelées depuis les Server Components des pages.
 */

export type SiteAvecEffectif = SirhSite & { nbCollaborateurs: number };

/** Sites (actifs et inactifs) avec le nombre de collaborateurs rattachés. */
export async function listerSites(): Promise<SiteAvecEffectif[]> {
  const ctx = await exigerContexteSirhAction(ROLES_SIRH_LECTURE);
  return withTenant(ctx.entreprise.id, async (tx) => {
    const sites = await tx
      .select()
      .from(sirhSites)
      .where(isNull(sirhSites.deletedAt))
      .orderBy(asc(sirhSites.nom));
    const effectifs = await tx
      .select({ siteId: sirhCollaborateurs.siteId, n: count() })
      .from(sirhCollaborateurs)
      .where(and(isNull(sirhCollaborateurs.deletedAt)))
      .groupBy(sirhCollaborateurs.siteId);
    const parSite = new Map(effectifs.map((e) => [e.siteId, e.n]));
    return sites.map((s) => ({ ...s, nbCollaborateurs: parSite.get(s.id) ?? 0 }));
  });
}

/** Un site par id (null si absent ou supprimé). */
export async function lireSite(id: string): Promise<SirhSite | null> {
  const ctx = await exigerContexteSirhAction(ROLES_SIRH_LECTURE);
  const [row] = await withTenant(ctx.entreprise.id, (tx) =>
    tx
      .select()
      .from(sirhSites)
      .where(and(eq(sirhSites.id, id), isNull(sirhSites.deletedAt)))
      .limit(1),
  );
  return row ?? null;
}

// ─────────────────────────────────────────────────────────────
// Équipes
// ─────────────────────────────────────────────────────────────

/** Équipe affichée (sérialisable). */
export type EquipeLigne = {
  id: string;
  nom: string;
  description: string | null;
  responsableId: string | null;
  /** « Prénom Nom » du responsable. */
  responsableNom: string | null;
  siteId: string | null;
  siteNom: string | null;
  couleur: string;
  actif: boolean;
  /** Membres actifs à la date du jour. */
  effectif: number;
};

/** Équipes (actives et inactives) avec responsable, site et effectif du jour. */
export async function listerEquipes(): Promise<EquipeLigne[]> {
  const ctx = await exigerContexteSirhAction(ROLES_SIRH_LECTURE);
  const today = aujourdhuiIso();
  return withTenant(ctx.entreprise.id, async (tx) => {
    const equipes = await tx
      .select({
        id: sirhEquipes.id,
        nom: sirhEquipes.nom,
        description: sirhEquipes.description,
        responsableId: sirhEquipes.responsableId,
        responsablePrenom: employes.prenom,
        responsableNomFamille: employes.nom,
        siteId: sirhEquipes.siteId,
        siteNom: sirhSites.nom,
        couleur: sirhEquipes.couleur,
        actif: sirhEquipes.actif,
      })
      .from(sirhEquipes)
      .leftJoin(employes, eq(employes.id, sirhEquipes.responsableId))
      .leftJoin(sirhSites, eq(sirhSites.id, sirhEquipes.siteId))
      .where(isNull(sirhEquipes.deletedAt))
      .orderBy(asc(sirhEquipes.nom));
    const membres = await tx
      .select({
        equipeId: sirhEquipeMembres.equipeId,
        employeId: sirhEquipeMembres.employeId,
        dateDebut: sirhEquipeMembres.dateDebut,
        dateFin: sirhEquipeMembres.dateFin,
      })
      .from(sirhEquipeMembres)
      .innerJoin(employes, eq(employes.id, sirhEquipeMembres.employeId))
      .where(and(isNull(sirhEquipeMembres.deletedAt), isNull(employes.deletedAt)));

    return equipes.map((e) => ({
      id: e.id,
      nom: e.nom,
      description: e.description,
      responsableId: e.responsableId,
      responsableNom: e.responsableNomFamille
        ? nomComplet(e.responsablePrenom, e.responsableNomFamille)
        : null,
      siteId: e.siteId,
      siteNom: e.siteNom,
      couleur: e.couleur,
      actif: e.actif,
      effectif: effectifEquipe(
        membres.filter((m) => m.equipeId === e.id),
        today,
      ),
    }));
  });
}

/** Appartenance affichée (sérialisable). */
export type MembreEquipeLigne = {
  id: string;
  equipeId: string;
  employeId: string;
  /** « Prénom Nom ». */
  employeNom: string;
  employeActif: boolean;
  matricule: string | null;
  estResponsable: boolean;
  dateDebut: string | null;
  dateFin: string | null;
};

/** Membres (historique compris) de toutes les équipes non supprimées. */
export async function listerMembresEquipes(): Promise<MembreEquipeLigne[]> {
  const ctx = await exigerContexteSirhAction(ROLES_SIRH_LECTURE);
  const rows = await withTenant(ctx.entreprise.id, (tx) =>
    tx
      .select({
        id: sirhEquipeMembres.id,
        equipeId: sirhEquipeMembres.equipeId,
        employeId: sirhEquipeMembres.employeId,
        nom: employes.nom,
        prenom: employes.prenom,
        actif: employes.actif,
        matricule: employes.matricule,
        estResponsable: sirhEquipeMembres.estResponsable,
        dateDebut: sirhEquipeMembres.dateDebut,
        dateFin: sirhEquipeMembres.dateFin,
      })
      .from(sirhEquipeMembres)
      .innerJoin(sirhEquipes, eq(sirhEquipes.id, sirhEquipeMembres.equipeId))
      .innerJoin(employes, eq(employes.id, sirhEquipeMembres.employeId))
      .where(
        and(
          isNull(sirhEquipeMembres.deletedAt),
          isNull(sirhEquipes.deletedAt),
          isNull(employes.deletedAt),
        ),
      )
      .orderBy(asc(employes.nom), asc(employes.prenom)),
  );
  return rows.map((r) => ({
    id: r.id,
    equipeId: r.equipeId,
    employeId: r.employeId,
    employeNom: nomComplet(r.prenom, r.nom),
    employeActif: r.actif,
    matricule: r.matricule,
    estResponsable: r.estResponsable,
    dateDebut: r.dateDebut,
    dateFin: r.dateFin,
  }));
}

// ─────────────────────────────────────────────────────────────
// Catalogue des postes
// ─────────────────────────────────────────────────────────────

/** Poste affiché (sérialisable). */
export type PosteLigne = {
  id: string;
  code: string | null;
  intitule: string;
  famille: string | null;
  categorie: CategorieProfessionnelle | null;
  niveau: string | null;
  coefficient: string | null;
  description: string | null;
  actif: boolean;
  /** Collaborateurs affectés à ce poste (sirh_collaborateurs). */
  nbCollaborateurs: number;
  /** Versions de contrat qui le référencent. */
  nbContrats: number;
};

/** Catalogue des postes (actifs et inactifs) avec leur utilisation. */
export async function listerPostes(): Promise<PosteLigne[]> {
  const ctx = await exigerContexteSirhAction(ROLES_SIRH_LECTURE);
  return withTenant(ctx.entreprise.id, async (tx) => {
    const postes = await tx
      .select({
        id: sirhPostes.id,
        code: sirhPostes.code,
        intitule: sirhPostes.intitule,
        famille: sirhPostes.famille,
        categorie: sirhPostes.categorie,
        niveau: sirhPostes.niveau,
        coefficient: sirhPostes.coefficient,
        description: sirhPostes.description,
        actif: sirhPostes.actif,
      })
      .from(sirhPostes)
      .where(isNull(sirhPostes.deletedAt))
      .orderBy(asc(sirhPostes.intitule));
    const collaborateurs = await tx
      .select({ posteId: sirhCollaborateurs.posteId, n: count() })
      .from(sirhCollaborateurs)
      .where(isNull(sirhCollaborateurs.deletedAt))
      .groupBy(sirhCollaborateurs.posteId);
    const contrats = await tx
      .select({ posteId: sirhContrats.posteId, n: count() })
      .from(sirhContrats)
      .where(isNull(sirhContrats.deletedAt))
      .groupBy(sirhContrats.posteId);
    const parPosteCollab = new Map(collaborateurs.map((c) => [c.posteId, c.n]));
    const parPosteContrat = new Map(contrats.map((c) => [c.posteId, c.n]));
    return postes.map((p) => ({
      ...p,
      nbCollaborateurs: parPosteCollab.get(p.id) ?? 0,
      nbContrats: parPosteContrat.get(p.id) ?? 0,
    }));
  });
}
