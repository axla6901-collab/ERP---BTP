'use server';

import { and, desc, eq, isNull } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';

import { auditLogIn } from '@/lib/audit/log';
import { requireTenantContextWithMfa } from '@/lib/auth/tenant-guards';
import type { ActionResult } from '@/lib/common/action-result';
import { withTenant } from '@/lib/db/with-tenant';
import {
  corpsEtat,
  corpsEtatDocumentsRequis,
  naturesDocument,
} from '@/db/schema/referentiel-tiers';
import { societes } from '@/db/schema/societes';
import {
  tierAgrementRelances,
  tierCorpsEtat,
  tierDocuments,
  tierSocietesAutorisees,
  tiers,
} from '@/db/schema/tiers-registre';
import {
  agrementActionSchema,
  tierSchema,
  type AgrementActionInput,
  type NatureTiers,
  type StatutAgrement,
  type TierInput,
} from '@/lib/validation/referencement-tiers';

import {
  evaluerConformiteTier,
  type ClasseConformite,
  type DocumentLite,
  type LigneConformite,
  type MatriceLigne,
  type NatureDocLite,
} from './conformite';
import { peutEcrireRegistreTiers, peutStatuerAgrement } from './permissions';

function aujourdhuiISO(): string {
  return new Date().toISOString().slice(0, 10);
}

// ─────────────────────────────────────────────────────────────
// Types renvoyés au client (sérialisables)
// ─────────────────────────────────────────────────────────────

export type TierConformiteRow = {
  id: string;
  code: string;
  nom: string;
  natureTiers: NatureTiers;
  siret: string | null;
  statutAgrement: StatutAgrement;
  classe: ClasseConformite;
  nbProblemes: number;
  nbDocumentsRequis: number;
  lignes: LigneConformite[];
  derniereRelanceLe: string | null;
};

export type ReferentielTiers = {
  corpsEtat: Array<{ id: string; code: string; libelle: string }>;
  societes: Array<{ id: string; code: string; raisonSociale: string }>;
  natures: NatureDocLite[];
};

export type TierDetail = {
  tier: {
    id: string;
    code: string;
    nom: string;
    natureTiers: NatureTiers;
    nomGerant: string | null;
    telPortableGerant: string | null;
    siret: string | null;
    nTvaIntra: string | null;
    email: string | null;
    telephone: string | null;
    adresseLigne1: string | null;
    adresseLigne2: string | null;
    codePostal: string | null;
    ville: string | null;
    pays: string;
    statutAgrement: StatutAgrement;
    dateAgrement: string | null;
    dateRefus: string | null;
    motifRefus: string | null;
    actif: boolean;
  };
  corpsEtatIds: string[];
  societeIds: string[];
  documents: Array<{
    id: string;
    natureDocumentId: string;
    nomFichierOrigine: string | null;
    mimeType: string | null;
    tailleBytes: number | null;
    dateObtention: string | null;
    dateFinValidite: string | null;
    statut: DocumentLite['statut'];
    motifRefus: string | null;
    createdAt: string;
  }>;
  conformite: { classe: ClasseConformite; lignes: LigneConformite[]; nbProblemes: number };
};

// ─────────────────────────────────────────────────────────────
// Lecture du référentiel (pour les formulaires & calculs)
// ─────────────────────────────────────────────────────────────

export async function lireReferentielTiers(): Promise<ReferentielTiers> {
  const ctx = await requireTenantContextWithMfa();
  return withTenant(ctx.entreprise.id, async (tx) => {
    const [corps, socs, natures] = await Promise.all([
      tx
        .select({ id: corpsEtat.id, code: corpsEtat.code, libelle: corpsEtat.libelle })
        .from(corpsEtat)
        .where(and(eq(corpsEtat.actif, true), isNull(corpsEtat.deletedAt)))
        .orderBy(corpsEtat.ordreAffichage),
      tx
        .select({ id: societes.id, code: societes.code, raisonSociale: societes.raisonSociale })
        .from(societes)
        .where(and(eq(societes.actif, true), isNull(societes.deletedAt)))
        .orderBy(societes.raisonSociale),
      tx
        .select()
        .from(naturesDocument)
        .where(and(eq(naturesDocument.actif, true), isNull(naturesDocument.deletedAt)))
        .orderBy(naturesDocument.ordreAffichage),
    ]);
    return {
      corpsEtat: corps,
      societes: socs,
      natures: natures.map((n) => ({
        id: n.id,
        code: n.code,
        libelle: n.libelle,
        modeControle: n.modeControle,
        delaiValiditeJours: n.delaiValiditeJours,
        delaiRelanceJours: n.delaiRelanceJours,
      })),
    };
  });
}

// ─────────────────────────────────────────────────────────────
// Liste des tiers + conformité (cœur de la page : 2 chevrons)
// ─────────────────────────────────────────────────────────────

export async function listerTiersAvecConformite(): Promise<TierConformiteRow[]> {
  const ctx = await requireTenantContextWithMfa();
  const auj = aujourdhuiISO();

  return withTenant(ctx.entreprise.id, async (tx) => {
    const [rowsTiers, liens, natures, matriceRows, documents, relances] = await Promise.all([
      tx.select().from(tiers).where(isNull(tiers.deletedAt)).orderBy(tiers.nom),
      tx.select().from(tierCorpsEtat),
      tx.select().from(naturesDocument).where(isNull(naturesDocument.deletedAt)),
      tx.select().from(corpsEtatDocumentsRequis),
      tx
        .select({
          id: tierDocuments.id,
          tierId: tierDocuments.tierId,
          natureDocumentId: tierDocuments.natureDocumentId,
          statut: tierDocuments.statut,
          dateFinValidite: tierDocuments.dateFinValidite,
          createdAt: tierDocuments.createdAt,
        })
        .from(tierDocuments)
        .where(isNull(tierDocuments.deletedAt))
        .orderBy(desc(tierDocuments.createdAt)),
      tx
        .select({ tierId: tierAgrementRelances.tierId, envoyeLe: tierAgrementRelances.envoyeLe })
        .from(tierAgrementRelances)
        .orderBy(desc(tierAgrementRelances.envoyeLe)),
    ]);

    // Index référentiel
    const naturesById = new Map<string, NatureDocLite>(
      natures.map((n) => [
        n.id,
        {
          id: n.id,
          code: n.code,
          libelle: n.libelle,
          modeControle: n.modeControle,
          delaiValiditeJours: n.delaiValiditeJours,
          delaiRelanceJours: n.delaiRelanceJours,
        },
      ]),
    );
    const matrice: MatriceLigne[] = matriceRows.map((m) => ({
      corpsEtatId: m.corpsEtatId,
      natureDocumentId: m.natureDocumentId,
      natureTiers: m.natureTiers as NatureTiers,
      estBloquant: m.estBloquant,
    }));

    // corps d'état par tier
    const corpsParTier = new Map<string, string[]>();
    for (const l of liens) {
      const liste = corpsParTier.get(l.tierId) ?? [];
      liste.push(l.corpsEtatId);
      corpsParTier.set(l.tierId, liste);
    }

    // document le plus récent par (tier, nature) — `documents` trié desc createdAt
    const docsParTier = new Map<string, Map<string, DocumentLite>>();
    for (const d of documents) {
      const parNature = docsParTier.get(d.tierId) ?? new Map<string, DocumentLite>();
      if (!parNature.has(d.natureDocumentId)) {
        parNature.set(d.natureDocumentId, {
          natureDocumentId: d.natureDocumentId,
          statut: d.statut,
          dateFinValidite: d.dateFinValidite,
        });
      }
      docsParTier.set(d.tierId, parNature);
    }

    // dernière relance par tier (relances triées desc)
    const derniereRelance = new Map<string, string>();
    for (const r of relances) {
      if (!derniereRelance.has(r.tierId)) {
        derniereRelance.set(r.tierId, r.envoyeLe.toISOString());
      }
    }

    return rowsTiers.map((t): TierConformiteRow => {
      const corpsIds = corpsParTier.get(t.id) ?? [];
      const docs = docsParTier.get(t.id) ?? new Map<string, DocumentLite>();
      const conf = evaluerConformiteTier(
        { natureTiers: t.natureTiers as NatureTiers, corpsEtatIds: corpsIds },
        matrice,
        naturesById,
        docs,
        auj,
      );
      return {
        id: t.id,
        code: t.code,
        nom: t.nom,
        natureTiers: t.natureTiers as NatureTiers,
        siret: t.siret,
        statutAgrement: t.statutAgrement as StatutAgrement,
        classe: conf.classe,
        nbProblemes: conf.nbProblemes,
        nbDocumentsRequis: conf.lignes.length,
        lignes: conf.lignes,
        derniereRelanceLe: derniereRelance.get(t.id) ?? null,
      };
    });
  });
}

// ─────────────────────────────────────────────────────────────
// Détail d'un tier
// ─────────────────────────────────────────────────────────────

export async function lireTier(id: string): Promise<TierDetail | null> {
  const ctx = await requireTenantContextWithMfa();
  const auj = aujourdhuiISO();

  return withTenant(ctx.entreprise.id, async (tx) => {
    const [tier] = await tx
      .select()
      .from(tiers)
      .where(and(eq(tiers.id, id), isNull(tiers.deletedAt)));
    if (!tier) return null;

    const [corpsLiens, socLiens, docs, natures, matriceRows] = await Promise.all([
      tx.select().from(tierCorpsEtat).where(eq(tierCorpsEtat.tierId, id)),
      tx.select().from(tierSocietesAutorisees).where(eq(tierSocietesAutorisees.tierId, id)),
      tx
        .select()
        .from(tierDocuments)
        .where(and(eq(tierDocuments.tierId, id), isNull(tierDocuments.deletedAt)))
        .orderBy(desc(tierDocuments.createdAt)),
      tx.select().from(naturesDocument).where(isNull(naturesDocument.deletedAt)),
      tx.select().from(corpsEtatDocumentsRequis),
    ]);

    const corpsEtatIds = corpsLiens.map((l) => l.corpsEtatId);
    const naturesById = new Map<string, NatureDocLite>(
      natures.map((n) => [
        n.id,
        {
          id: n.id,
          code: n.code,
          libelle: n.libelle,
          modeControle: n.modeControle,
          delaiValiditeJours: n.delaiValiditeJours,
          delaiRelanceJours: n.delaiRelanceJours,
        },
      ]),
    );
    const matrice: MatriceLigne[] = matriceRows.map((m) => ({
      corpsEtatId: m.corpsEtatId,
      natureDocumentId: m.natureDocumentId,
      natureTiers: m.natureTiers as NatureTiers,
      estBloquant: m.estBloquant,
    }));

    // document le plus récent par nature
    const docsParNature = new Map<string, DocumentLite>();
    for (const d of docs) {
      if (!docsParNature.has(d.natureDocumentId)) {
        docsParNature.set(d.natureDocumentId, {
          natureDocumentId: d.natureDocumentId,
          statut: d.statut,
          dateFinValidite: d.dateFinValidite,
        });
      }
    }
    const conformite = evaluerConformiteTier(
      { natureTiers: tier.natureTiers as NatureTiers, corpsEtatIds },
      matrice,
      naturesById,
      docsParNature,
      auj,
    );

    return {
      tier: {
        id: tier.id,
        code: tier.code,
        nom: tier.nom,
        natureTiers: tier.natureTiers as NatureTiers,
        nomGerant: tier.nomGerant,
        telPortableGerant: tier.telPortableGerant,
        siret: tier.siret,
        nTvaIntra: tier.nTvaIntra,
        email: tier.email,
        telephone: tier.telephone,
        adresseLigne1: tier.adresseLigne1,
        adresseLigne2: tier.adresseLigne2,
        codePostal: tier.codePostal,
        ville: tier.ville,
        pays: tier.pays,
        statutAgrement: tier.statutAgrement as StatutAgrement,
        dateAgrement: tier.dateAgrement,
        dateRefus: tier.dateRefus,
        motifRefus: tier.motifRefus,
        actif: tier.actif,
      },
      corpsEtatIds,
      societeIds: socLiens.map((l) => l.societeId),
      documents: docs.map((d) => ({
        id: d.id,
        natureDocumentId: d.natureDocumentId,
        nomFichierOrigine: d.nomFichierOrigine,
        mimeType: d.mimeType,
        tailleBytes: d.tailleBytes,
        dateObtention: d.dateObtention,
        dateFinValidite: d.dateFinValidite,
        statut: d.statut,
        motifRefus: d.motifRefus,
        createdAt: d.createdAt.toISOString(),
      })),
      conformite,
    };
  });
}

// ─────────────────────────────────────────────────────────────
// Création / mise à jour d'un tier
// ─────────────────────────────────────────────────────────────

async function remplacerLiens(
  tx: Parameters<Parameters<typeof withTenant>[1]>[0],
  tierId: string,
  entrepriseId: string,
  userId: string,
  corpsEtatIds: string[],
  societeIds: string[],
): Promise<void> {
  await tx.delete(tierCorpsEtat).where(eq(tierCorpsEtat.tierId, tierId));
  await tx.delete(tierSocietesAutorisees).where(eq(tierSocietesAutorisees.tierId, tierId));
  if (corpsEtatIds.length > 0) {
    await tx.insert(tierCorpsEtat).values(
      corpsEtatIds.map((corpsEtatId) => ({
        tierId,
        corpsEtatId,
        entrepriseId,
        createdBy: userId,
      })),
    );
  }
  if (societeIds.length > 0) {
    await tx
      .insert(tierSocietesAutorisees)
      .values(
        societeIds.map((societeId) => ({ tierId, societeId, entrepriseId, createdBy: userId })),
      );
  }
}

export async function creerTier(input: TierInput): Promise<ActionResult<{ id: string }>> {
  const parsed = tierSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: 'Données invalides.',
      fieldErrors: parsed.error.flatten().fieldErrors as Record<string, string[]>,
    };
  }
  const ctx = await requireTenantContextWithMfa();
  if (!peutEcrireRegistreTiers(ctx.utilisateur.role)) {
    return { ok: false, error: 'Accès refusé.' };
  }
  const d = parsed.data;

  try {
    const id = await withTenant(ctx.entreprise.id, async (tx) => {
      const [created] = await tx
        .insert(tiers)
        .values({
          entrepriseId: ctx.entreprise.id,
          code: d.code,
          nom: d.nom,
          natureTiers: d.natureTiers,
          nomGerant: d.nomGerant,
          telPortableGerant: d.telPortableGerant,
          siret: d.siret,
          nTvaIntra: d.nTvaIntra,
          email: d.email,
          telephone: d.telephone,
          adresseLigne1: d.adresseLigne1,
          adresseLigne2: d.adresseLigne2,
          codePostal: d.codePostal,
          ville: d.ville,
          pays: d.pays,
          cdtResponsableId: d.cdtResponsableId,
          managerCdtId: d.managerCdtId,
          createdBy: ctx.utilisateur.id,
          updatedBy: ctx.utilisateur.id,
        })
        .returning({ id: tiers.id });
      if (!created) throw new Error('INSERT tier échoué');
      await remplacerLiens(
        tx,
        created.id,
        ctx.entreprise.id,
        ctx.utilisateur.id,
        d.corpsEtatIds,
        d.societeIds,
      );
      await auditLogIn(tx, { action: 'insert', tableName: 'tiers', rowId: created.id, after: d });
      return created.id;
    });
    revalidatePath(`/${ctx.entreprise.slug}/tiers/referencement`);
    return { ok: true, data: { id } };
  } catch (err) {
    if (err instanceof Error && /uq_tiers_(code|siret)_active/.test(err.message)) {
      return { ok: false, error: 'Un tier avec ce code ou ce SIRET existe déjà.' };
    }
    throw err;
  }
}

export async function mettreAJourTier(
  id: string,
  input: TierInput,
): Promise<ActionResult<{ id: string }>> {
  const parsed = tierSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: 'Données invalides.',
      fieldErrors: parsed.error.flatten().fieldErrors as Record<string, string[]>,
    };
  }
  const ctx = await requireTenantContextWithMfa();
  if (!peutEcrireRegistreTiers(ctx.utilisateur.role)) {
    return { ok: false, error: 'Accès refusé.' };
  }
  const d = parsed.data;

  try {
    const res = await withTenant(ctx.entreprise.id, async (tx) => {
      const [before] = await tx
        .select()
        .from(tiers)
        .where(and(eq(tiers.id, id), isNull(tiers.deletedAt)));
      if (!before) return 'Tier introuvable.';
      await tx
        .update(tiers)
        .set({
          code: d.code,
          nom: d.nom,
          natureTiers: d.natureTiers,
          nomGerant: d.nomGerant,
          telPortableGerant: d.telPortableGerant,
          siret: d.siret,
          nTvaIntra: d.nTvaIntra,
          email: d.email,
          telephone: d.telephone,
          adresseLigne1: d.adresseLigne1,
          adresseLigne2: d.adresseLigne2,
          codePostal: d.codePostal,
          ville: d.ville,
          pays: d.pays,
          cdtResponsableId: d.cdtResponsableId,
          managerCdtId: d.managerCdtId,
          updatedAt: new Date(),
          updatedBy: ctx.utilisateur.id,
        })
        .where(eq(tiers.id, id));
      await remplacerLiens(
        tx,
        id,
        ctx.entreprise.id,
        ctx.utilisateur.id,
        d.corpsEtatIds,
        d.societeIds,
      );
      await auditLogIn(tx, {
        action: 'update',
        tableName: 'tiers',
        rowId: id,
        before,
        after: { ...before, ...d },
      });
      return null;
    });
    if (res) return { ok: false, error: res };
    revalidatePath(`/${ctx.entreprise.slug}/tiers/referencement`);
    revalidatePath(`/${ctx.entreprise.slug}/tiers/referencement/${id}`);
    return { ok: true, data: { id } };
  } catch (err) {
    if (err instanceof Error && /uq_tiers_(code|siret)_active/.test(err.message)) {
      return { ok: false, error: 'Un tier avec ce code ou ce SIRET existe déjà.' };
    }
    throw err;
  }
}

// ─────────────────────────────────────────────────────────────
// Statuer sur l'agrément (manuel)
// ─────────────────────────────────────────────────────────────

export async function statuerAgrement(
  id: string,
  input: AgrementActionInput,
): Promise<ActionResult<void>> {
  const parsed = agrementActionSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.issues[0]?.message ?? 'Données invalides.',
    };
  }
  const ctx = await requireTenantContextWithMfa();
  if (!peutStatuerAgrement(ctx.utilisateur.role)) {
    return { ok: false, error: 'Accès refusé.' };
  }
  const auj = aujourdhuiISO();

  const res = await withTenant(ctx.entreprise.id, async (tx) => {
    const [before] = await tx
      .select()
      .from(tiers)
      .where(and(eq(tiers.id, id), isNull(tiers.deletedAt)));
    if (!before) return 'Tier introuvable.';

    // Respecte les contraintes CHECK de cohérence (refus⇒date_refus, agree⇒date_agrement).
    let patch: Partial<typeof tiers.$inferInsert>;
    switch (parsed.data.action) {
      case 'agreer':
        patch = { statutAgrement: 'agree', dateAgrement: auj, dateRefus: null, motifRefus: null };
        break;
      case 'refuser':
        patch = { statutAgrement: 'refuse_manuel', dateRefus: auj, motifRefus: parsed.data.motif };
        break;
      case 'suspendre':
        patch = { statutAgrement: 'suspendu', dateRefus: null, motifRefus: parsed.data.motif };
        break;
      case 'reactiver':
        patch = {
          statutAgrement: 'agree',
          dateAgrement: before.dateAgrement ?? auj,
          dateRefus: null,
          motifRefus: null,
        };
        break;
    }

    await tx
      .update(tiers)
      .set({ ...patch, updatedAt: new Date(), updatedBy: ctx.utilisateur.id })
      .where(eq(tiers.id, id));
    await auditLogIn(tx, {
      action: 'update',
      tableName: 'tiers',
      rowId: id,
      before,
      after: { ...before, ...patch },
    });
    return null;
  });

  if (res) return { ok: false, error: res };
  revalidatePath(`/${ctx.entreprise.slug}/tiers/referencement`);
  revalidatePath(`/${ctx.entreprise.slug}/tiers/referencement/${id}`);
  return { ok: true, data: undefined };
}
