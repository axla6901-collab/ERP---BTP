import 'server-only';

import { and, asc, eq, isNull } from 'drizzle-orm';

import { requireTenantContextWithMfa } from '@/lib/auth/tenant-guards';
// eslint-disable-next-line no-restricted-imports -- lecture de tables globales (utilisateurs, utilisateur_entreprises) filtrées explicitement sur l'entreprise courante
import { db } from '@/lib/db/client';
import { withTenant } from '@/lib/db/with-tenant';
import { chantiers } from '@/db/schema/chantiers';
import { employes } from '@/db/schema/employes';
import { utilisateurEntreprises } from '@/db/schema/entreprises';
import { raisonsSociales } from '@/db/schema/raisons-sociales';
import { societes } from '@/db/schema/societes';
import {
  sirhDossiersDocuments,
  sirhEquipes,
  sirhHoraires,
  sirhPostes,
  sirhSites,
  sirhTypesAbsence,
} from '@/db/schema/test-sirh';
import { utilisateurs } from '@/db/schema/utilisateurs';

import { nomComplet } from './format';

/**
 * Listes d'options pour les sélecteurs du module Test SIRH (id + libellé
 * seulement : aucune donnée sensible ne part au client). Partagées par tous
 * les sous-modules — à utiliser plutôt que de recharger des lignes complètes
 * (`listerEmployesActifs` renvoie aussi NIR / IBAN déchiffrés).
 */

export type OptionSirh = { id: string; label: string };
export type OptionEmploye = OptionSirh & { actif: boolean; matricule: string | null };

/** Employés du tenant (actifs par défaut), libellé « Nom Prénom » trié par nom. */
export async function listerEmployesOptions(
  opts: { inclureInactifs?: boolean } = {},
): Promise<OptionEmploye[]> {
  const ctx = await requireTenantContextWithMfa();
  const rows = await withTenant(ctx.entreprise.id, (tx) =>
    tx
      .select({
        id: employes.id,
        nom: employes.nom,
        prenom: employes.prenom,
        actif: employes.actif,
        matricule: employes.matricule,
      })
      .from(employes)
      .where(
        opts.inclureInactifs
          ? isNull(employes.deletedAt)
          : and(isNull(employes.deletedAt), eq(employes.actif, true)),
      )
      .orderBy(asc(employes.nom), asc(employes.prenom)),
  );
  return rows.map((r) => ({
    id: r.id,
    label: `${r.nom} ${r.prenom}`.trim(),
    actif: r.actif,
    matricule: r.matricule,
  }));
}

/** Chantiers du tenant : « N° · Libellé ». */
export async function listerChantiersOptions(): Promise<OptionSirh[]> {
  const ctx = await requireTenantContextWithMfa();
  const rows = await withTenant(ctx.entreprise.id, (tx) =>
    tx
      .select({ id: chantiers.id, numero: chantiers.numero, libelle: chantiers.libelle })
      .from(chantiers)
      .where(isNull(chantiers.deletedAt))
      .orderBy(asc(chantiers.numero)),
  );
  return rows.map((r) => ({ id: r.id, label: `${r.numero} · ${r.libelle}` }));
}

export async function listerSitesOptions(): Promise<OptionSirh[]> {
  const ctx = await requireTenantContextWithMfa();
  const rows = await withTenant(ctx.entreprise.id, (tx) =>
    tx
      .select({ id: sirhSites.id, nom: sirhSites.nom })
      .from(sirhSites)
      .where(and(isNull(sirhSites.deletedAt), eq(sirhSites.actif, true)))
      .orderBy(asc(sirhSites.nom)),
  );
  return rows.map((r) => ({ id: r.id, label: r.nom }));
}

export async function listerEquipesOptions(): Promise<OptionSirh[]> {
  const ctx = await requireTenantContextWithMfa();
  const rows = await withTenant(ctx.entreprise.id, (tx) =>
    tx
      .select({ id: sirhEquipes.id, nom: sirhEquipes.nom })
      .from(sirhEquipes)
      .where(and(isNull(sirhEquipes.deletedAt), eq(sirhEquipes.actif, true)))
      .orderBy(asc(sirhEquipes.nom)),
  );
  return rows.map((r) => ({ id: r.id, label: r.nom }));
}

export async function listerPostesOptions(): Promise<OptionSirh[]> {
  const ctx = await requireTenantContextWithMfa();
  const rows = await withTenant(ctx.entreprise.id, (tx) =>
    tx
      .select({ id: sirhPostes.id, intitule: sirhPostes.intitule, niveau: sirhPostes.niveau })
      .from(sirhPostes)
      .where(and(isNull(sirhPostes.deletedAt), eq(sirhPostes.actif, true)))
      .orderBy(asc(sirhPostes.intitule)),
  );
  return rows.map((r) => ({
    id: r.id,
    label: r.niveau ? `${r.intitule} (${r.niveau})` : r.intitule,
  }));
}

export async function listerHorairesOptions(): Promise<Array<OptionSirh & { parDefaut: boolean }>> {
  const ctx = await requireTenantContextWithMfa();
  const rows = await withTenant(ctx.entreprise.id, (tx) =>
    tx
      .select({ id: sirhHoraires.id, nom: sirhHoraires.nom, parDefaut: sirhHoraires.parDefaut })
      .from(sirhHoraires)
      .where(and(isNull(sirhHoraires.deletedAt), eq(sirhHoraires.actif, true)))
      .orderBy(asc(sirhHoraires.nom)),
  );
  return rows.map((r) => ({ id: r.id, label: r.nom, parDefaut: r.parDefaut }));
}

/** Sociétés du groupe (entités employeuses), libellé = raison sociale. */
export async function listerSocietesOptions(): Promise<OptionSirh[]> {
  const ctx = await requireTenantContextWithMfa();
  const rows = await withTenant(ctx.entreprise.id, (tx) =>
    tx
      .select({ id: societes.id, code: societes.code, raison: raisonsSociales.raisonSociale })
      .from(societes)
      .innerJoin(raisonsSociales, eq(raisonsSociales.id, societes.raisonSocialeId))
      .where(and(isNull(societes.deletedAt), eq(societes.actif, true)))
      .orderBy(asc(raisonsSociales.raisonSociale)),
  );
  return rows.map((r) => ({ id: r.id, label: `${r.raison} (${r.code})` }));
}

export type OptionTypeAbsence = OptionSirh & {
  code: string;
  couleur: string;
  uniteDecompte: (typeof sirhTypesAbsence.$inferSelect)['uniteDecompte'];
  avecSolde: boolean;
  justificatifRequis: boolean;
  necessiteValidation: boolean;
};

/** Types d'absence actifs, triés par `ordre`. */
export async function listerTypesAbsenceOptions(): Promise<OptionTypeAbsence[]> {
  const ctx = await requireTenantContextWithMfa();
  const rows = await withTenant(ctx.entreprise.id, (tx) =>
    tx
      .select({
        id: sirhTypesAbsence.id,
        code: sirhTypesAbsence.code,
        libelle: sirhTypesAbsence.libelle,
        couleur: sirhTypesAbsence.couleur,
        uniteDecompte: sirhTypesAbsence.uniteDecompte,
        avecSolde: sirhTypesAbsence.avecSolde,
        justificatifRequis: sirhTypesAbsence.justificatifRequis,
        necessiteValidation: sirhTypesAbsence.necessiteValidation,
      })
      .from(sirhTypesAbsence)
      .where(and(isNull(sirhTypesAbsence.deletedAt), eq(sirhTypesAbsence.actif, true)))
      .orderBy(asc(sirhTypesAbsence.ordre), asc(sirhTypesAbsence.libelle)),
  );
  return rows.map((r) => ({ ...r, label: `${r.libelle} (${r.code})` }));
}

export async function listerDossiersDocumentsOptions(): Promise<
  Array<OptionSirh & { visibleSalarie: boolean }>
> {
  const ctx = await requireTenantContextWithMfa();
  const rows = await withTenant(ctx.entreprise.id, (tx) =>
    tx
      .select({
        id: sirhDossiersDocuments.id,
        nom: sirhDossiersDocuments.nom,
        visibleSalarie: sirhDossiersDocuments.visibleSalarie,
      })
      .from(sirhDossiersDocuments)
      .where(isNull(sirhDossiersDocuments.deletedAt))
      .orderBy(asc(sirhDossiersDocuments.ordre), asc(sirhDossiersDocuments.nom)),
  );
  return rows.map((r) => ({ id: r.id, label: r.nom, visibleSalarie: r.visibleSalarie }));
}

/** Comptes utilisateurs membres de l'entreprise courante (assignation de tâches, rattachement). */
export async function listerUtilisateursOptions(): Promise<OptionSirh[]> {
  const ctx = await requireTenantContextWithMfa();
  const rows = await db
    .select({ id: utilisateurs.id, email: utilisateurs.email })
    .from(utilisateurEntreprises)
    .innerJoin(utilisateurs, eq(utilisateurs.id, utilisateurEntreprises.utilisateurId))
    .where(
      and(
        eq(utilisateurEntreprises.entrepriseId, ctx.entreprise.id),
        isNull(utilisateurEntreprises.deletedAt),
        isNull(utilisateurs.deletedAt),
        eq(utilisateurs.actif, true),
      ),
    )
    .orderBy(asc(utilisateurs.email));
  return rows.map((r) => ({ id: r.id, label: r.email }));
}

/** Libellé « Prénom Nom » d'un employé (pour les en-têtes de fiche). */
export function libelleEmploye(e: { nom: string; prenom: string }): string {
  return nomComplet(e.prenom, e.nom);
}
