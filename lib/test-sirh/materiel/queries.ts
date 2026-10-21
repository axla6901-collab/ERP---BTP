import 'server-only';

import { and, asc, count, desc, eq, inArray, isNull } from 'drizzle-orm';
import { z } from 'zod';

import { withTenant } from '@/lib/db/with-tenant';
import { employes } from '@/db/schema/employes';
import { sirhAttributionsMateriel, sirhMateriels } from '@/db/schema/test-sirh';
import {
  CATEGORIES_MATERIEL,
  STATUTS_MATERIEL,
  type CategorieMateriel,
  type StatutMateriel,
} from '@/lib/validation/test-sirh/enums';

import { employeIdDeLUtilisateur } from '../acces';
import { aujourdhuiIso } from '../calendrier';
import { exigerContexteSirhAction } from '../contexte';
import { nomComplet, versNombre } from '../format';
import { peutLireSirh, ROLES_SIRH_LECTURE } from '../permissions';
import { agregerKpiMateriel, type FiltresMateriel, type KpiMateriel } from './regles';

/**
 * Lectures — Test SIRH › Matériel & EPI. Fonctions `server-only` appelées par
 * les Server Components (inventaire, dossier collaborateur, tableau de bord).
 */

export type AttributionLigne = {
  id: string;
  materielId: string;
  employeId: string;
  employeNom: string;
  dateRemise: string;
  /** `null` = attribution en cours. */
  dateRetour: string | null;
  etatRemise: string | null;
  etatRetour: string | null;
  dechargeSignee: boolean;
  commentaire: string | null;
};

export type MaterielLigne = {
  id: string;
  categorie: CategorieMateriel;
  libelle: string;
  marque: string | null;
  modele: string | null;
  numeroSerie: string | null;
  taille: string | null;
  dateAchat: string | null;
  valeurAchat: number | null;
  dateFinGarantie: string | null;
  dateControle: string | null;
  statut: StatutMateriel;
  notes: string | null;
  /** Attribution en cours (détenteur actuel), ou null. */
  detenteur: AttributionLigne | null;
  /** Historique complet des attributions (récentes d'abord). */
  historique: AttributionLigne[];
};

/** Inventaire filtré (catégorie / statut), avec détenteur et historique des remises. */
export async function listerMateriels(filtres: FiltresMateriel): Promise<MaterielLigne[]> {
  const ctx = await exigerContexteSirhAction(ROLES_SIRH_LECTURE);
  return withTenant(ctx.entreprise.id, async (tx) => {
    const materiels = await tx
      .select({
        id: sirhMateriels.id,
        categorie: sirhMateriels.categorie,
        libelle: sirhMateriels.libelle,
        marque: sirhMateriels.marque,
        modele: sirhMateriels.modele,
        numeroSerie: sirhMateriels.numeroSerie,
        taille: sirhMateriels.taille,
        dateAchat: sirhMateriels.dateAchat,
        valeurAchat: sirhMateriels.valeurAchat,
        dateFinGarantie: sirhMateriels.dateFinGarantie,
        dateControle: sirhMateriels.dateControle,
        statut: sirhMateriels.statut,
        notes: sirhMateriels.notes,
      })
      .from(sirhMateriels)
      .where(
        and(
          isNull(sirhMateriels.deletedAt),
          filtres.categorie ? eq(sirhMateriels.categorie, filtres.categorie) : undefined,
          filtres.statut ? eq(sirhMateriels.statut, filtres.statut) : undefined,
        ),
      )
      .orderBy(asc(sirhMateriels.libelle));
    if (materiels.length === 0) return [];

    const attributions = await tx
      .select({
        id: sirhAttributionsMateriel.id,
        materielId: sirhAttributionsMateriel.materielId,
        employeId: sirhAttributionsMateriel.employeId,
        employeNomFamille: employes.nom,
        employePrenom: employes.prenom,
        dateRemise: sirhAttributionsMateriel.dateRemise,
        dateRetour: sirhAttributionsMateriel.dateRetour,
        etatRemise: sirhAttributionsMateriel.etatRemise,
        etatRetour: sirhAttributionsMateriel.etatRetour,
        dechargeSignee: sirhAttributionsMateriel.dechargeSignee,
        commentaire: sirhAttributionsMateriel.commentaire,
      })
      .from(sirhAttributionsMateriel)
      .innerJoin(employes, eq(employes.id, sirhAttributionsMateriel.employeId))
      .where(
        and(
          isNull(sirhAttributionsMateriel.deletedAt),
          inArray(
            sirhAttributionsMateriel.materielId,
            materiels.map((m) => m.id),
          ),
        ),
      )
      .orderBy(desc(sirhAttributionsMateriel.dateRemise), desc(sirhAttributionsMateriel.createdAt));

    const parMateriel = new Map<string, AttributionLigne[]>();
    for (const a of attributions) {
      const ligne: AttributionLigne = {
        id: a.id,
        materielId: a.materielId,
        employeId: a.employeId,
        employeNom: nomComplet(a.employePrenom, a.employeNomFamille),
        dateRemise: a.dateRemise,
        dateRetour: a.dateRetour,
        etatRemise: a.etatRemise,
        etatRetour: a.etatRetour,
        dechargeSignee: a.dechargeSignee,
        commentaire: a.commentaire,
      };
      const liste = parMateriel.get(a.materielId) ?? [];
      liste.push(ligne);
      parMateriel.set(a.materielId, liste);
    }

    return materiels.map((m) => {
      const historique = parMateriel.get(m.id) ?? [];
      return {
        ...m,
        valeurAchat: versNombre(m.valeurAchat),
        detenteur: historique.find((a) => a.dateRetour === null) ?? null,
        historique,
      };
    });
  });
}

/** Compteurs des filtres (par catégorie et par statut, tout l'inventaire). */
export async function compteursMateriel(): Promise<{
  total: number;
  parCategorie: Record<CategorieMateriel, number>;
  parStatut: Record<StatutMateriel, number>;
}> {
  const ctx = await exigerContexteSirhAction(ROLES_SIRH_LECTURE);
  const rows = await withTenant(ctx.entreprise.id, (tx) =>
    tx
      .select({ categorie: sirhMateriels.categorie, statut: sirhMateriels.statut, n: count() })
      .from(sirhMateriels)
      .where(isNull(sirhMateriels.deletedAt))
      .groupBy(sirhMateriels.categorie, sirhMateriels.statut),
  );
  const parCategorie = Object.fromEntries(CATEGORIES_MATERIEL.map((c) => [c, 0])) as Record<
    CategorieMateriel,
    number
  >;
  const parStatut = Object.fromEntries(STATUTS_MATERIEL.map((s) => [s, 0])) as Record<
    StatutMateriel,
    number
  >;
  let total = 0;
  for (const r of rows) {
    parCategorie[r.categorie] += r.n;
    parStatut[r.statut] += r.n;
    total += r.n;
  }
  return { total, parCategorie, parStatut };
}

/** Indicateurs (StatGrid et tableau de bord) : attribués, en stock, alertes de contrôle, valeur. */
export async function kpiMateriel(): Promise<KpiMateriel> {
  const ctx = await exigerContexteSirhAction(ROLES_SIRH_LECTURE);
  const rows = await withTenant(ctx.entreprise.id, (tx) =>
    tx
      .select({
        statut: sirhMateriels.statut,
        valeurAchat: sirhMateriels.valeurAchat,
        dateControle: sirhMateriels.dateControle,
      })
      .from(sirhMateriels)
      .where(isNull(sirhMateriels.deletedAt)),
  );
  return agregerKpiMateriel(
    rows.map((r) => ({ ...r, valeurAchat: versNombre(r.valeurAchat) })),
    aujourdhuiIso(),
  );
}

export type MaterielEmployeLigne = {
  attributionId: string;
  materielId: string;
  libelle: string;
  categorie: CategorieMateriel;
  marque: string | null;
  modele: string | null;
  numeroSerie: string | null;
  taille: string | null;
  dateControle: string | null;
  statutMateriel: StatutMateriel;
  dateRemise: string;
  /** `null` = toujours en possession du salarié. */
  dateRetour: string | null;
  etatRemise: string | null;
  etatRetour: string | null;
  dechargeSignee: boolean;
};

/**
 * Matériel remis à un salarié (en cours puis restitué, récent d'abord) — dossier
 * collaborateur. Rôles de lecture SIRH, ou le salarié lui-même ; vide sinon.
 */
export async function listerMaterielEmploye(employeId: string): Promise<MaterielEmployeLigne[]> {
  const ctx = await exigerContexteSirhAction();
  if (!z.string().uuid().safeParse(employeId).success) return [];
  return withTenant(ctx.entreprise.id, async (tx) => {
    if (!peutLireSirh(ctx.utilisateur.role)) {
      const moi = await employeIdDeLUtilisateur(tx, ctx.utilisateur.id);
      if (moi !== employeId) return [];
    }
    const rows = await tx
      .select({
        attributionId: sirhAttributionsMateriel.id,
        materielId: sirhMateriels.id,
        libelle: sirhMateriels.libelle,
        categorie: sirhMateriels.categorie,
        marque: sirhMateriels.marque,
        modele: sirhMateriels.modele,
        numeroSerie: sirhMateriels.numeroSerie,
        taille: sirhMateriels.taille,
        dateControle: sirhMateriels.dateControle,
        statutMateriel: sirhMateriels.statut,
        dateRemise: sirhAttributionsMateriel.dateRemise,
        dateRetour: sirhAttributionsMateriel.dateRetour,
        etatRemise: sirhAttributionsMateriel.etatRemise,
        etatRetour: sirhAttributionsMateriel.etatRetour,
        dechargeSignee: sirhAttributionsMateriel.dechargeSignee,
      })
      .from(sirhAttributionsMateriel)
      .innerJoin(sirhMateriels, eq(sirhMateriels.id, sirhAttributionsMateriel.materielId))
      .where(
        and(
          eq(sirhAttributionsMateriel.employeId, employeId),
          isNull(sirhAttributionsMateriel.deletedAt),
          isNull(sirhMateriels.deletedAt),
        ),
      )
      .orderBy(desc(sirhAttributionsMateriel.dateRemise));
    // En cours d'abord, puis restitués (chaque groupe : remise la plus récente d'abord).
    return [
      ...rows.filter((r) => r.dateRetour === null),
      ...rows.filter((r) => r.dateRetour !== null),
    ];
  });
}
