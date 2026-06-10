import 'server-only';

import { cache } from 'react';

import { and, eq, isNull } from 'drizzle-orm';
import { cookies } from 'next/headers';
import { notFound, redirect } from 'next/navigation';

import { db } from '@/lib/db/client';
import { entreprises, utilisateurEntreprises } from '@/db/schema/entreprises';

import { getCurrentUtilisateur, requireAuthWithMfa, type UtilisateurCourant } from './guards';
import type { Role } from './rbac';

/** Nom du cookie httpOnly qui mémorise l'entreprise active de l'utilisateur. */
export const ACTIVE_ENTREPRISE_COOKIE = 'active_entreprise_slug';

export type EntrepriseActive = {
  id: string;
  slug: string;
  raisonSociale: string;
  /** Rôle de l'utilisateur **dans** cette entreprise. */
  roleId: string;
  /** Feature flag : module Planning (Gantt) activé pour cette entreprise. */
  planningActive: boolean;
  /** Feature flag : module Référencement & Agrément des tiers activé. */
  tiersReferencementActive: boolean;
  /** Feature flag : module Compte prorata (NF P03-001) activé. */
  compteProrataActive: boolean;
};

export type TenantContext = {
  utilisateur: UtilisateurCourant;
  entreprise: EntrepriseActive;
};

/**
 * Lit le cookie `active_entreprise_slug`, vérifie l'appartenance de l'utilisateur
 * courant à cette entreprise, et retourne le contexte multi-tenant. Retourne null
 * dans les cas suivants :
 *  - pas de session
 *  - cookie absent
 *  - cookie ne correspond pas à une entreprise dont l'utilisateur est membre
 *
 * Mémoïsé par requête HTTP via `react.cache` — appelable sans coût additionnel
 * depuis layout + page + composants serveur d'une même requête.
 */
export const getTenantContext = cache(async (): Promise<TenantContext | null> => {
  const utilisateur = await getCurrentUtilisateur();
  if (!utilisateur || !utilisateur.actif) return null;

  const cookieStore = await cookies();
  const slug = cookieStore.get(ACTIVE_ENTREPRISE_COOKIE)?.value;
  if (!slug) return null;

  const [row] = await db
    .select({
      id: entreprises.id,
      slug: entreprises.slug,
      raisonSociale: entreprises.raisonSociale,
      roleId: utilisateurEntreprises.roleId,
      planningActive: entreprises.planningActive,
      tiersReferencementActive: entreprises.tiersReferencementActive,
      compteProrataActive: entreprises.compteProrataActive,
    })
    .from(entreprises)
    .innerJoin(utilisateurEntreprises, eq(utilisateurEntreprises.entrepriseId, entreprises.id))
    .where(
      and(
        eq(entreprises.slug, slug),
        isNull(entreprises.deletedAt),
        eq(utilisateurEntreprises.utilisateurId, utilisateur.id),
        isNull(utilisateurEntreprises.deletedAt),
      ),
    )
    .limit(1);

  if (!row) return null;

  return {
    utilisateur,
    entreprise: {
      id: row.id,
      slug: row.slug,
      raisonSociale: row.raisonSociale,
      roleId: row.roleId,
      planningActive: row.planningActive,
      tiersReferencementActive: row.tiersReferencementActive,
      compteProrataActive: row.compteProrataActive,
    },
  };
});

/**
 * Variante qui redirige vers `/select-entreprise` si l'utilisateur n'a pas
 * d'entreprise active valide. À utiliser dans les pages et server actions
 * qui exigent un contexte tenant.
 */
export async function requireTenantContext(): Promise<TenantContext> {
  const ctx = await getTenantContext();
  if (!ctx) redirect('/select-entreprise');
  return ctx;
}

/**
 * Variante qui combine `requireAuthWithMfa(roles)` et la résolution du tenant
 * actif. À utiliser dans les server actions métier qui exigent :
 *  - une session valide + MFA si rôle l'impose
 *  - un rôle dans la liste autorisée (optionnel)
 *  - un cookie `active_entreprise_slug` valide
 *
 * @example
 *   const { utilisateur, entreprise } = await requireTenantContextWithMfa(ROLES_CATALOGUE_WRITE);
 */
export async function requireTenantContextWithMfa(
  roles?: Role | readonly Role[],
): Promise<TenantContext> {
  await requireAuthWithMfa(roles);
  return requireTenantContext();
}

/**
 * Variante "page tenant 404" : utilisée par le layout `[entrepriseSlug]` quand
 * le slug de l'URL ne correspond pas à une entreprise dont l'utilisateur est
 * membre. Évite de fuiter l'existence d'une entreprise dont on n'est pas membre
 * (404 plutôt que 403 — indiscernable d'un slug inexistant).
 *
 * @param urlSlug Le slug extrait de `params.entrepriseSlug` côté layout/page.
 * @returns Le contexte tenant si cohérent avec l'URL, sinon `notFound()` (throw).
 */
export async function resolveTenantFromUrl(urlSlug: string): Promise<TenantContext> {
  const utilisateur = await getCurrentUtilisateur();
  if (!utilisateur || !utilisateur.actif) redirect('/login');

  const [row] = await db
    .select({
      id: entreprises.id,
      slug: entreprises.slug,
      raisonSociale: entreprises.raisonSociale,
      roleId: utilisateurEntreprises.roleId,
      planningActive: entreprises.planningActive,
      tiersReferencementActive: entreprises.tiersReferencementActive,
      compteProrataActive: entreprises.compteProrataActive,
    })
    .from(entreprises)
    .innerJoin(utilisateurEntreprises, eq(utilisateurEntreprises.entrepriseId, entreprises.id))
    .where(
      and(
        eq(entreprises.slug, urlSlug),
        isNull(entreprises.deletedAt),
        eq(utilisateurEntreprises.utilisateurId, utilisateur.id),
        isNull(utilisateurEntreprises.deletedAt),
      ),
    )
    .limit(1);

  if (!row) notFound();

  return {
    utilisateur,
    entreprise: {
      id: row.id,
      slug: row.slug,
      raisonSociale: row.raisonSociale,
      roleId: row.roleId,
      planningActive: row.planningActive,
      tiersReferencementActive: row.tiersReferencementActive,
      compteProrataActive: row.compteProrataActive,
    },
  };
}

/**
 * Garde super-admin. Redirige vers `/` si l'utilisateur n'a pas le flag
 * `is_super_admin`. À utiliser sur le layout `/admin/*`.
 */
export async function requireSuperAdmin(): Promise<UtilisateurCourant> {
  const utilisateur = await getCurrentUtilisateur();
  if (!utilisateur || !utilisateur.actif) redirect('/login');
  if (!utilisateur.isSuperAdmin) redirect('/');
  return utilisateur;
}

/**
 * Liste toutes les entreprises auxquelles l'utilisateur courant appartient.
 * Utilisée par le sélecteur d'entreprise et par la page `/select-entreprise`.
 *
 * Mémoïsée par requête HTTP.
 */
export const listEntreprisesUtilisateur = cache(
  async (): Promise<Array<{ id: string; slug: string; raisonSociale: string; isDefault: boolean }>> => {
    const utilisateur = await getCurrentUtilisateur();
    if (!utilisateur) return [];

    const rows = await db
      .select({
        id: entreprises.id,
        slug: entreprises.slug,
        raisonSociale: entreprises.raisonSociale,
        isDefault: utilisateurEntreprises.isDefault,
      })
      .from(entreprises)
      .innerJoin(utilisateurEntreprises, eq(utilisateurEntreprises.entrepriseId, entreprises.id))
      .where(
        and(
          eq(utilisateurEntreprises.utilisateurId, utilisateur.id),
          isNull(entreprises.deletedAt),
          isNull(utilisateurEntreprises.deletedAt),
        ),
      )
      .orderBy(entreprises.raisonSociale);

    return rows;
  },
);
