import 'server-only';

import { and, count, desc, eq, gte, inArray, isNull, lte, or, type SQL } from 'drizzle-orm';
import { z } from 'zod';

import type { TenantContext } from '@/lib/auth/tenant-guards';
import { withTenant, type TenantTx } from '@/lib/db/with-tenant';
import { chantiers } from '@/db/schema/chantiers';
import { employes } from '@/db/schema/employes';
import { sirhDocuments, sirhNotesFrais } from '@/db/schema/test-sirh';
import { utilisateurs } from '@/db/schema/utilisateurs';
import type { CategorieFrais, NatureFrais, StatutFrais } from '@/lib/validation/test-sirh/enums';

import { employeIdDeLUtilisateur } from '../acces';
import { aujourdhuiIso, dernierJourDuMois, premierJourDuMois } from '../calendrier';
import { exigerContexteSirhAction } from '../contexte';
import { nomComplet, versNombre } from '../format';
import { peutLireSirh, ROLES_SIRH_LECTURE, ROLES_SIRH_VALIDATION } from '../permissions';
import { acteurNoteFrais } from './acteur';
import {
  agregerKpiNotesFrais,
  droitsNoteFrais,
  statutsDuFiltre,
  type DroitsNoteFrais,
  type FiltresNotesFrais,
  type KpiNotesFrais,
} from './calculs';

/**
 * Lectures — Test SIRH › Notes de frais. Fonctions `server-only` appelées par
 * les Server Components (page Notes de frais, Validations, Mon espace, dossier
 * collaborateur, tableau de bord). Données sérialisables ; chaque ligne porte
 * les droits de l'utilisateur courant (`droits`), calculés côté serveur.
 */

export type NoteFraisLigne = {
  id: string;
  employeId: string;
  /** « Prénom Nom ». */
  employeNom: string;
  dateDepense: string;
  nature: NatureFrais;
  categorie: CategorieFrais;
  libelle: string;
  montantTtc: number;
  montantTva: number | null;
  distanceKm: number | null;
  puissanceFiscale: number | null;
  tauxKm: number | null;
  nbForfaits: number | null;
  montantUnitaire: number | null;
  chantierId: string | null;
  /** « N° · Libellé » du chantier imputé. */
  chantierLabel: string | null;
  justificatifDocumentId: string | null;
  justificatifTitre: string | null;
  statut: StatutFrais;
  /** Email du valideur (décision). */
  valideur: string | null;
  /** Date-heure ISO de la décision. */
  dateDecision: string | null;
  commentaireDecision: string | null;
  dateRemboursement: string | null;
  createdAt: string;
  droits: DroitsNoteFrais;
};

function moisEnBornes(mois: string): { debut: string; fin: string } {
  const [annee, m] = mois.split('-').map(Number);
  return {
    debut: premierJourDuMois(annee ?? 2000, m ?? 1),
    fin: dernierJourDuMois(annee ?? 2000, m ?? 1),
  };
}

/** Charge les notes correspondant aux conditions (hors supprimées), récentes d'abord. */
async function chargerNotes(
  tx: TenantTx,
  ctx: TenantContext,
  conditions: Array<SQL | undefined>,
): Promise<NoteFraisLigne[]> {
  const acteur = await acteurNoteFrais(tx, ctx);
  const rows = await tx
    .select({
      id: sirhNotesFrais.id,
      employeId: sirhNotesFrais.employeId,
      employeNomFamille: employes.nom,
      employePrenom: employes.prenom,
      dateDepense: sirhNotesFrais.dateDepense,
      nature: sirhNotesFrais.nature,
      categorie: sirhNotesFrais.categorie,
      libelle: sirhNotesFrais.libelle,
      montantTtc: sirhNotesFrais.montantTtc,
      montantTva: sirhNotesFrais.montantTva,
      distanceKm: sirhNotesFrais.distanceKm,
      puissanceFiscale: sirhNotesFrais.puissanceFiscale,
      tauxKm: sirhNotesFrais.tauxKm,
      nbForfaits: sirhNotesFrais.nbForfaits,
      montantUnitaire: sirhNotesFrais.montantUnitaire,
      chantierId: sirhNotesFrais.chantierId,
      chantierNumero: chantiers.numero,
      chantierLibelle: chantiers.libelle,
      justificatifDocumentId: sirhNotesFrais.justificatifDocumentId,
      justificatifTitre: sirhDocuments.titre,
      statut: sirhNotesFrais.statut,
      valideur: utilisateurs.email,
      dateDecision: sirhNotesFrais.dateDecision,
      commentaireDecision: sirhNotesFrais.commentaireDecision,
      dateRemboursement: sirhNotesFrais.dateRemboursement,
      createdBy: sirhNotesFrais.createdBy,
      createdAt: sirhNotesFrais.createdAt,
    })
    .from(sirhNotesFrais)
    .innerJoin(employes, eq(employes.id, sirhNotesFrais.employeId))
    .leftJoin(chantiers, eq(chantiers.id, sirhNotesFrais.chantierId))
    .leftJoin(
      sirhDocuments,
      and(
        eq(sirhDocuments.id, sirhNotesFrais.justificatifDocumentId),
        isNull(sirhDocuments.deletedAt),
      ),
    )
    .leftJoin(utilisateurs, eq(utilisateurs.id, sirhNotesFrais.valideurId))
    .where(and(isNull(sirhNotesFrais.deletedAt), ...conditions))
    .orderBy(desc(sirhNotesFrais.dateDepense), desc(sirhNotesFrais.createdAt));

  return rows.map((r) => ({
    id: r.id,
    employeId: r.employeId,
    employeNom: nomComplet(r.employePrenom, r.employeNomFamille),
    dateDepense: r.dateDepense,
    nature: r.nature,
    categorie: r.categorie,
    libelle: r.libelle,
    montantTtc: versNombre(r.montantTtc) ?? 0,
    montantTva: versNombre(r.montantTva),
    distanceKm: versNombre(r.distanceKm),
    puissanceFiscale: r.puissanceFiscale,
    tauxKm: versNombre(r.tauxKm),
    nbForfaits: versNombre(r.nbForfaits),
    montantUnitaire: versNombre(r.montantUnitaire),
    chantierId: r.chantierId,
    chantierLabel:
      r.chantierNumero !== null ? `${r.chantierNumero} · ${r.chantierLibelle ?? ''}` : null,
    justificatifDocumentId: r.justificatifDocumentId,
    justificatifTitre: r.justificatifTitre,
    statut: r.statut,
    valideur: r.valideur,
    dateDecision: r.dateDecision ? r.dateDecision.toISOString() : null,
    commentaireDecision: r.commentaireDecision,
    dateRemboursement: r.dateRemboursement,
    createdAt: r.createdAt.toISOString(),
    droits: droitsNoteFrais(
      { statut: r.statut, employeId: r.employeId, createdBy: r.createdBy },
      acteur,
    ),
  }));
}

/** Liste de gestion (page Notes de frais) selon les filtres d'URL. */
export async function listerNotesFrais(filtres: FiltresNotesFrais): Promise<NoteFraisLigne[]> {
  const ctx = await exigerContexteSirhAction(ROLES_SIRH_LECTURE);
  const statuts = statutsDuFiltre(filtres.statut);
  const bornes = filtres.mois ? moisEnBornes(filtres.mois) : null;
  return withTenant(ctx.entreprise.id, (tx) =>
    chargerNotes(tx, ctx, [
      statuts ? inArray(sirhNotesFrais.statut, [...statuts]) : undefined,
      filtres.employeId ? eq(sirhNotesFrais.employeId, filtres.employeId) : undefined,
      bornes ? gte(sirhNotesFrais.dateDepense, bornes.debut) : undefined,
      bornes ? lte(sirhNotesFrais.dateDepense, bornes.fin) : undefined,
    ]),
  );
}

/** Nombre de notes par statut (compteurs des filtres), avec les filtres employé / mois. */
export async function compterNotesFraisParStatut(
  filtres: Pick<FiltresNotesFrais, 'employeId' | 'mois'>,
): Promise<Record<StatutFrais, number>> {
  const ctx = await exigerContexteSirhAction(ROLES_SIRH_LECTURE);
  const bornes = filtres.mois ? moisEnBornes(filtres.mois) : null;
  const rows = await withTenant(ctx.entreprise.id, (tx) =>
    tx
      .select({ statut: sirhNotesFrais.statut, n: count() })
      .from(sirhNotesFrais)
      .where(
        and(
          isNull(sirhNotesFrais.deletedAt),
          filtres.employeId ? eq(sirhNotesFrais.employeId, filtres.employeId) : undefined,
          bornes ? gte(sirhNotesFrais.dateDepense, bornes.debut) : undefined,
          bornes ? lte(sirhNotesFrais.dateDepense, bornes.fin) : undefined,
        ),
      )
      .groupBy(sirhNotesFrais.statut),
  );
  const compteurs: Record<StatutFrais, number> = {
    brouillon: 0,
    soumise: 0,
    approuvee: 0,
    refusee: 0,
    remboursee: 0,
  };
  for (const r of rows) compteurs[r.statut] = r.n;
  return compteurs;
}

/** Notes soumises en attente de décision (page Validations). */
export async function listerNotesFraisEnAttente(): Promise<NoteFraisLigne[]> {
  const ctx = await exigerContexteSirhAction(ROLES_SIRH_VALIDATION);
  return withTenant(ctx.entreprise.id, (tx) =>
    chargerNotes(tx, ctx, [eq(sirhNotesFrais.statut, 'soumise')]),
  );
}

/** Notes de l'utilisateur courant (Mon espace) — vide s'il n'est rattaché à aucun employé. */
export async function listerMesNotesFrais(): Promise<NoteFraisLigne[]> {
  const ctx = await exigerContexteSirhAction();
  return withTenant(ctx.entreprise.id, async (tx) => {
    const moi = await employeIdDeLUtilisateur(tx, ctx.utilisateur.id);
    if (!moi) return [];
    return chargerNotes(tx, ctx, [eq(sirhNotesFrais.employeId, moi)]);
  });
}

/**
 * Notes d'un salarié (dossier collaborateur) : rôles de lecture SIRH, ou le
 * salarié lui-même. Vide si l'accès n'est pas autorisé.
 */
export async function listerNotesFraisEmploye(employeId: string): Promise<NoteFraisLigne[]> {
  const ctx = await exigerContexteSirhAction();
  if (!z.string().uuid().safeParse(employeId).success) return [];
  return withTenant(ctx.entreprise.id, async (tx) => {
    if (!peutLireSirh(ctx.utilisateur.role)) {
      const moi = await employeIdDeLUtilisateur(tx, ctx.utilisateur.id);
      if (moi !== employeId) return [];
    }
    return chargerNotes(tx, ctx, [eq(sirhNotesFrais.employeId, employeId)]);
  });
}

/**
 * Employé rattaché à l'utilisateur courant, au format option (`employeFixe` de
 * `NoteFraisDialog` pour saisir ses propres frais), ou null.
 */
export async function monEmployeNotesFrais(): Promise<{ id: string; label: string } | null> {
  const ctx = await exigerContexteSirhAction();
  return withTenant(ctx.entreprise.id, async (tx) => {
    const id = await employeIdDeLUtilisateur(tx, ctx.utilisateur.id);
    if (!id) return null;
    const [e] = await tx
      .select({ nom: employes.nom, prenom: employes.prenom })
      .from(employes)
      .where(eq(employes.id, id))
      .limit(1);
    return e ? { id, label: nomComplet(e.prenom, e.nom) } : null;
  });
}

/**
 * Indicateurs (StatGrid de la page et tableau de bord) : à valider, montant du
 * mois, à rembourser, indemnités kilométriques du mois.
 */
export async function kpiNotesFrais(): Promise<KpiNotesFrais> {
  const ctx = await exigerContexteSirhAction(ROLES_SIRH_LECTURE);
  const today = aujourdhuiIso();
  const debutMois = `${today.slice(0, 7)}-01`;
  const rows = await withTenant(ctx.entreprise.id, (tx) =>
    tx
      .select({
        statut: sirhNotesFrais.statut,
        nature: sirhNotesFrais.nature,
        dateDepense: sirhNotesFrais.dateDepense,
        montantTtc: sirhNotesFrais.montantTtc,
        distanceKm: sirhNotesFrais.distanceKm,
      })
      .from(sirhNotesFrais)
      .where(
        and(
          isNull(sirhNotesFrais.deletedAt),
          or(
            inArray(sirhNotesFrais.statut, ['soumise', 'approuvee']),
            gte(sirhNotesFrais.dateDepense, debutMois),
          ),
        ),
      ),
  );
  return agregerKpiNotesFrais(
    rows.map((r) => ({
      statut: r.statut,
      nature: r.nature,
      dateDepense: r.dateDepense,
      montantTtc: versNombre(r.montantTtc) ?? 0,
      distanceKm: versNombre(r.distanceKm),
    })),
    today,
  );
}
