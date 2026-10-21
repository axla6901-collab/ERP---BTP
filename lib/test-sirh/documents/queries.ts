import 'server-only';

import { and, asc, count, desc, eq, isNotNull, isNull, lte, type SQL } from 'drizzle-orm';

import type { TenantContext } from '@/lib/auth/tenant-guards';
import { withTenant } from '@/lib/db/with-tenant';
import { employes } from '@/db/schema/employes';
import { sirhDocuments, sirhDossiersDocuments } from '@/db/schema/test-sirh';

import { aujourdhuiIso } from '../calendrier';
import { exigerContexteSirhAction } from '../contexte';
import { nomComplet } from '../format';
import { peutGererSirh, peutVoirPaieSirh, ROLES_SIRH_LECTURE } from '../permissions';
import {
  agregerKpiDocuments,
  limiteExpiration,
  type FiltresDocuments,
  type KpiDocuments,
} from './regles';

/**
 * Lectures — Test SIRH › Documents RH (GED). Les pièces de candidature
 * (`candidat_id`) relèvent du Recrutement et sont exclues de la GED.
 *
 * Visibilité alignée sur `urlTelechargementDocumentSirh` : la gestion RH et la
 * paie voient tout ; les autres rôles de lecture ne voient que les documents
 * d'entreprise partagés avec les salariés (`visible_salarie`) — les pièces
 * individuelles des salariés leur restent masquées.
 */

/** Ligne de document au format attendu par `DocumentsListe` (compatible `listerDocumentsEmployeSirh`). */
export type DocumentListeLigne = {
  id: string;
  titre: string;
  dossierId: string | null;
  /** Nom du dossier (résolu côté serveur quand disponible). */
  dossierNom?: string | null | undefined;
  mimeType: string;
  tailleBytes: number | null;
  dateDocument: string | null;
  dateExpiration: string | null;
  visibleSalarie: boolean;
  signatureRequise: boolean;
  signeLe: string | null;
  createdAt: string;
};

/** Ligne de la GED (page Documents). */
export type DocumentGedLigne = DocumentListeLigne & {
  dossierNom: string | null;
  /** `null` = document d'entreprise. */
  employeId: string | null;
  employeNom: string | null;
  notes: string | null;
};

export type DossierAvecCompteur = {
  id: string;
  nom: string;
  description: string | null;
  visibleSalarie: boolean;
  ordre: number;
  nbDocuments: number;
};

/** La gestion RH et la paie voient toute la GED. */
function voitTout(ctx: TenantContext): boolean {
  const role = ctx.utilisateur.role;
  return peutGererSirh(role) || peutVoirPaieSirh(role);
}

/** Conditions de base : non supprimé, hors candidats, restreint selon le rôle. */
function conditionsVisibilite(ctx: TenantContext): SQL[] {
  const base: SQL[] = [isNull(sirhDocuments.deletedAt), isNull(sirhDocuments.candidatId)];
  if (!voitTout(ctx)) {
    base.push(isNull(sirhDocuments.employeId), eq(sirhDocuments.visibleSalarie, true));
  }
  return base;
}

/** Dossiers de la GED (ordre d'affichage) avec le nombre de documents visibles. */
export async function listerDossiersDocumentsAvecCompteurs(): Promise<DossierAvecCompteur[]> {
  const ctx = await exigerContexteSirhAction(ROLES_SIRH_LECTURE);
  return withTenant(ctx.entreprise.id, async (tx) => {
    const dossiers = await tx
      .select({
        id: sirhDossiersDocuments.id,
        nom: sirhDossiersDocuments.nom,
        description: sirhDossiersDocuments.description,
        visibleSalarie: sirhDossiersDocuments.visibleSalarie,
        ordre: sirhDossiersDocuments.ordre,
      })
      .from(sirhDossiersDocuments)
      .where(isNull(sirhDossiersDocuments.deletedAt))
      .orderBy(asc(sirhDossiersDocuments.ordre), asc(sirhDossiersDocuments.nom));
    const compteurs = await tx
      .select({ dossierId: sirhDocuments.dossierId, n: count() })
      .from(sirhDocuments)
      .where(and(...conditionsVisibilite(ctx)))
      .groupBy(sirhDocuments.dossierId);
    const parDossier = new Map(compteurs.map((c) => [c.dossierId, c.n]));
    return dossiers.map((d) => ({ ...d, nbDocuments: parDossier.get(d.id) ?? 0 }));
  });
}

/** Compteurs du rail : tous, sans dossier, expirés ou expirant sous 30 jours. */
export async function compteursDocuments(): Promise<{
  tous: number;
  sansDossier: number;
  expirant: number;
}> {
  const ctx = await exigerContexteSirhAction(ROLES_SIRH_LECTURE);
  const limite = limiteExpiration(aujourdhuiIso());
  return withTenant(ctx.entreprise.id, async (tx) => {
    const visibles = conditionsVisibilite(ctx);
    const [tous] = await tx
      .select({ n: count() })
      .from(sirhDocuments)
      .where(and(...visibles));
    const [sans] = await tx
      .select({ n: count() })
      .from(sirhDocuments)
      .where(and(...visibles, isNull(sirhDocuments.dossierId)));
    const [expirant] = await tx
      .select({ n: count() })
      .from(sirhDocuments)
      .where(
        and(
          ...visibles,
          isNotNull(sirhDocuments.dateExpiration),
          lte(sirhDocuments.dateExpiration, limite),
        ),
      );
    return { tous: tous?.n ?? 0, sansDossier: sans?.n ?? 0, expirant: expirant?.n ?? 0 };
  });
}

/** Documents de la GED selon les filtres d'URL (récents d'abord). */
export async function listerDocumentsGed(filtres: FiltresDocuments): Promise<DocumentGedLigne[]> {
  const ctx = await exigerContexteSirhAction(ROLES_SIRH_LECTURE);
  const conditions = conditionsVisibilite(ctx);
  const { dossier, concerne } = filtres;
  if (dossier.type === 'dossier') conditions.push(eq(sirhDocuments.dossierId, dossier.id));
  if (dossier.type === 'sans') conditions.push(isNull(sirhDocuments.dossierId));
  if (dossier.type === 'expirant') {
    conditions.push(
      isNotNull(sirhDocuments.dateExpiration),
      lte(sirhDocuments.dateExpiration, limiteExpiration(aujourdhuiIso())),
    );
  }
  if (concerne.type === 'employe') conditions.push(eq(sirhDocuments.employeId, concerne.id));
  if (concerne.type === 'entreprise') conditions.push(isNull(sirhDocuments.employeId));

  const rows = await withTenant(ctx.entreprise.id, (tx) =>
    tx
      .select({
        id: sirhDocuments.id,
        titre: sirhDocuments.titre,
        dossierId: sirhDocuments.dossierId,
        dossierNom: sirhDossiersDocuments.nom,
        employeId: sirhDocuments.employeId,
        employeNomFamille: employes.nom,
        employePrenom: employes.prenom,
        mimeType: sirhDocuments.mimeType,
        tailleBytes: sirhDocuments.tailleBytes,
        dateDocument: sirhDocuments.dateDocument,
        dateExpiration: sirhDocuments.dateExpiration,
        visibleSalarie: sirhDocuments.visibleSalarie,
        signatureRequise: sirhDocuments.signatureRequise,
        signeLe: sirhDocuments.signeLe,
        notes: sirhDocuments.notes,
        createdAt: sirhDocuments.createdAt,
      })
      .from(sirhDocuments)
      .leftJoin(
        sirhDossiersDocuments,
        and(
          eq(sirhDossiersDocuments.id, sirhDocuments.dossierId),
          isNull(sirhDossiersDocuments.deletedAt),
        ),
      )
      .leftJoin(employes, eq(employes.id, sirhDocuments.employeId))
      .where(and(...conditions))
      .orderBy(desc(sirhDocuments.createdAt)),
  );

  return rows.map((r) => ({
    id: r.id,
    titre: r.titre,
    dossierId: r.dossierId,
    dossierNom: r.dossierNom,
    employeId: r.employeId,
    employeNom: r.employeId ? nomComplet(r.employePrenom, r.employeNomFamille) : null,
    mimeType: r.mimeType,
    tailleBytes: r.tailleBytes,
    dateDocument: r.dateDocument,
    dateExpiration: r.dateExpiration,
    visibleSalarie: r.visibleSalarie,
    signatureRequise: r.signatureRequise,
    signeLe: r.signeLe ? r.signeLe.toISOString() : null,
    notes: r.notes,
    createdAt: r.createdAt.toISOString(),
  }));
}

/**
 * Documents d'ENTREPRISE partagés avec les salariés (règlement intérieur,
 * accords, notes de service…) — pour Mon espace, accessible à tout rôle.
 */
export async function listerDocumentsEntrepriseVisibles(): Promise<DocumentListeLigne[]> {
  const ctx = await exigerContexteSirhAction();
  const rows = await withTenant(ctx.entreprise.id, (tx) =>
    tx
      .select({
        id: sirhDocuments.id,
        titre: sirhDocuments.titre,
        dossierId: sirhDocuments.dossierId,
        dossierNom: sirhDossiersDocuments.nom,
        mimeType: sirhDocuments.mimeType,
        tailleBytes: sirhDocuments.tailleBytes,
        dateDocument: sirhDocuments.dateDocument,
        dateExpiration: sirhDocuments.dateExpiration,
        visibleSalarie: sirhDocuments.visibleSalarie,
        signatureRequise: sirhDocuments.signatureRequise,
        signeLe: sirhDocuments.signeLe,
        createdAt: sirhDocuments.createdAt,
      })
      .from(sirhDocuments)
      .leftJoin(
        sirhDossiersDocuments,
        and(
          eq(sirhDossiersDocuments.id, sirhDocuments.dossierId),
          isNull(sirhDossiersDocuments.deletedAt),
        ),
      )
      .where(
        and(
          isNull(sirhDocuments.deletedAt),
          isNull(sirhDocuments.employeId),
          isNull(sirhDocuments.candidatId),
          eq(sirhDocuments.visibleSalarie, true),
        ),
      )
      .orderBy(desc(sirhDocuments.createdAt)),
  );
  return rows.map((r) => ({
    ...r,
    signeLe: r.signeLe ? r.signeLe.toISOString() : null,
    createdAt: r.createdAt.toISOString(),
  }));
}

/** Indicateurs de la GED (tableau de bord) : total, entreprise, expirés, bientôt, à signer. */
export async function kpiDocuments(): Promise<KpiDocuments> {
  const ctx = await exigerContexteSirhAction(ROLES_SIRH_LECTURE);
  const rows = await withTenant(ctx.entreprise.id, (tx) =>
    tx
      .select({
        employeId: sirhDocuments.employeId,
        dateExpiration: sirhDocuments.dateExpiration,
        signatureRequise: sirhDocuments.signatureRequise,
        signeLe: sirhDocuments.signeLe,
      })
      .from(sirhDocuments)
      .where(and(...conditionsVisibilite(ctx))),
  );
  return agregerKpiDocuments(
    rows.map((r) => ({ ...r, signeLe: r.signeLe ? r.signeLe.toISOString() : null })),
    aujourdhuiIso(),
  );
}
