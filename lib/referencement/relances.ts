'use server';

import { and, desc, eq, isNull } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';

import { auditLogIn } from '@/lib/audit/log';
import { requireTenantContextWithMfa } from '@/lib/auth/tenant-guards';
import type { ActionResult } from '@/lib/common/action-result';
import { withTenant } from '@/lib/db/with-tenant';
import { corpsEtatDocumentsRequis, naturesDocument } from '@/db/schema/referentiel-tiers';
import {
  tierAgrementRelances,
  tierCorpsEtat,
  tierDocuments,
  tiers,
} from '@/db/schema/tiers-registre';
import { utilisateurs } from '@/db/schema/utilisateurs';
import type { NatureTiers } from '@/lib/validation/referencement-tiers';

import {
  evaluerConformiteTier,
  LIBELLES_STATUT_LIGNE,
  type DocumentLite,
  type LigneConformite,
  type MatriceLigne,
  type NatureDocLite,
} from './conformite';
import { peutEcrireDocumentsTiers } from './permissions';

type Tx = Parameters<Parameters<typeof withTenant>[1]>[0];
type Niveau = 'r1' | 'r2' | 'r3' | 'escalade_manager';
type Contexte = 'agrement_initial' | 'renouvellement';

const LIBELLE_NIVEAU: Record<Niveau, string> = {
  r1: '1ʳᵉ relance',
  r2: '2ᵉ relance',
  r3: '3ᵉ relance',
  escalade_manager: 'escalade manager',
};

function aujourdhuiISO(): string {
  return new Date().toISOString().slice(0, 10);
}

function niveauDepuisCompte(n: number): Niveau {
  if (n <= 0) return 'r1';
  if (n === 1) return 'r2';
  if (n === 2) return 'r3';
  return 'escalade_manager';
}

/** Construit l'objet + le corps de la relance à partir des documents en problème. */
function genererMail(
  nomTier: string,
  niveau: Niveau,
  lignesProblemes: LigneConformite[],
): { sujet: string; corps: string } {
  const sujet = `[${LIBELLE_NIVEAU[niveau]}] Documents administratifs à fournir — ${nomTier}`;
  const liste = lignesProblemes
    .map((l) => `  • ${l.libelle} : ${LIBELLES_STATUT_LIGNE[l.statut]}`)
    .join('\n');
  const corps =
    `Bonjour,\n\n` +
    `Dans le cadre de votre référencement, les documents administratifs suivants ` +
    `doivent être transmis ou mis à jour :\n\n${liste}\n\n` +
    `Merci de nous les faire parvenir dans les meilleurs délais.\n\nCordialement.`;
  return { sujet, corps };
}

type RefData = {
  naturesById: Map<string, NatureDocLite>;
  matrice: MatriceLigne[];
  corpsParTier: Map<string, string[]>;
  docsParTier: Map<string, Map<string, DocumentLite>>;
  emailParUser: Map<string, string>;
};

async function chargerRefData(tx: Tx): Promise<RefData> {
  const [natures, matriceRows, liens, documents, users] = await Promise.all([
    tx.select().from(naturesDocument).where(isNull(naturesDocument.deletedAt)),
    tx.select().from(corpsEtatDocumentsRequis),
    tx.select().from(tierCorpsEtat),
    tx
      .select({
        tierId: tierDocuments.tierId,
        natureDocumentId: tierDocuments.natureDocumentId,
        statut: tierDocuments.statut,
        dateFinValidite: tierDocuments.dateFinValidite,
      })
      .from(tierDocuments)
      .where(isNull(tierDocuments.deletedAt))
      .orderBy(desc(tierDocuments.createdAt)),
    tx.select({ id: utilisateurs.id, email: utilisateurs.email }).from(utilisateurs),
  ]);

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
  const corpsParTier = new Map<string, string[]>();
  for (const l of liens) {
    const liste = corpsParTier.get(l.tierId) ?? [];
    liste.push(l.corpsEtatId);
    corpsParTier.set(l.tierId, liste);
  }
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
  const emailParUser = new Map<string, string>(users.map((u) => [u.id, u.email]));
  return { naturesById, matrice, corpsParTier, docsParTier, emailParUser };
}

type ResultatRelance = 'envoyee' | 'rien_a_relancer' | 'deja_relancee' | 'introuvable';

async function relancerUnTier(
  tx: Tx,
  ctx: { entreprise: { id: string }; utilisateur: { id: string } },
  tierId: string,
  ref: RefData,
): Promise<{ resultat: ResultatRelance; niveau?: Niveau }> {
  const [tier] = await tx
    .select()
    .from(tiers)
    .where(and(eq(tiers.id, tierId), isNull(tiers.deletedAt)));
  if (!tier) return { resultat: 'introuvable' };

  const conf = evaluerConformiteTier(
    {
      natureTiers: tier.natureTiers as NatureTiers,
      corpsEtatIds: ref.corpsParTier.get(tierId) ?? [],
    },
    ref.matrice,
    ref.naturesById,
    ref.docsParTier.get(tierId) ?? new Map<string, DocumentLite>(),
    aujourdhuiISO(),
  );
  const problemes = conf.lignes.filter((l) => l.statut !== 'a_jour');
  if (problemes.length === 0) return { resultat: 'rien_a_relancer' };

  const contexte: Contexte =
    tier.statutAgrement === 'agree' || tier.statutAgrement === 'suspendu'
      ? 'renouvellement'
      : 'agrement_initial';

  const existantes = await tx
    .select({ id: tierAgrementRelances.id })
    .from(tierAgrementRelances)
    .where(
      and(eq(tierAgrementRelances.tierId, tierId), eq(tierAgrementRelances.contexte, contexte)),
    );
  const niveau = niveauDepuisCompte(existantes.length);

  const { sujet, corps } = genererMail(tier.nom, niveau, problemes);
  const destinataires = tier.email ? [tier.email] : [];
  const cdtEmail = tier.cdtResponsableId ? ref.emailParUser.get(tier.cdtResponsableId) : undefined;
  const cc = niveau !== 'r1' && cdtEmail ? [cdtEmail] : [];

  try {
    const [created] = await tx
      .insert(tierAgrementRelances)
      .values({
        entrepriseId: ctx.entreprise.id,
        tierId,
        contexte,
        niveau,
        jourEnvoi: aujourdhuiISO(),
        destinataires,
        cc,
        sujet,
        corps,
      })
      .returning({ id: tierAgrementRelances.id });

    // Bascule du statut au premier contact (process assisté, pas d'envoi auto).
    if (tier.statutAgrement === 'a_creer') {
      await tx
        .update(tiers)
        .set({
          statutAgrement: 'en_attente_documents',
          updatedAt: new Date(),
          updatedBy: ctx.utilisateur.id,
        })
        .where(eq(tiers.id, tierId));
    }

    await auditLogIn(tx, {
      action: 'insert',
      tableName: 'tier_agrement_relances',
      rowId: created?.id ?? tierId,
      after: { tierId, contexte, niveau, sujet },
    });
    return { resultat: 'envoyee', niveau };
  } catch (err) {
    // Idempotence : déjà relancé aujourd'hui pour ce contexte+niveau.
    if (err instanceof Error && /uq_tier_agrement_relances_idempotence/.test(err.message)) {
      return { resultat: 'deja_relancee' };
    }
    throw err;
  }
}

/** Relance un tier (enregistre la trace + génère le mail, sans envoi automatique). */
export async function relancerTier(tierId: string): Promise<ActionResult<{ niveau: Niveau }>> {
  const ctx = await requireTenantContextWithMfa();
  if (!peutEcrireDocumentsTiers(ctx.utilisateur.role)) {
    return { ok: false, error: 'Accès refusé.' };
  }

  const res = await withTenant(ctx.entreprise.id, async (tx) => {
    const ref = await chargerRefData(tx);
    return relancerUnTier(tx, ctx, tierId, ref);
  });

  if (res.resultat === 'introuvable') return { ok: false, error: 'Tier introuvable.' };
  if (res.resultat === 'rien_a_relancer') {
    return { ok: false, error: 'Ce tier est à jour : aucune relance nécessaire.' };
  }
  if (res.resultat === 'deja_relancee') {
    return { ok: false, error: 'Une relance de ce niveau a déjà été enregistrée aujourd’hui.' };
  }
  revalidatePath(`/${ctx.entreprise.slug}/tiers/referencement`);
  revalidatePath(`/${ctx.entreprise.slug}/tiers/referencement/${tierId}`);
  return { ok: true, data: { niveau: res.niveau! } };
}

/** Relance en masse : enchaîne les tiers sélectionnés, ignore ceux à jour / déjà relancés. */
export async function relancerTiersEnMasse(
  tierIds: string[],
): Promise<ActionResult<{ envoyees: number; ignores: number }>> {
  const ctx = await requireTenantContextWithMfa();
  if (!peutEcrireDocumentsTiers(ctx.utilisateur.role)) {
    return { ok: false, error: 'Accès refusé.' };
  }
  const ids = [...new Set(tierIds)].slice(0, 500);
  if (ids.length === 0) return { ok: false, error: 'Aucun tier sélectionné.' };

  const { envoyees, ignores } = await withTenant(ctx.entreprise.id, async (tx) => {
    const ref = await chargerRefData(tx);
    let env = 0;
    let ign = 0;
    for (const tierId of ids) {
      const r = await relancerUnTier(tx, ctx, tierId, ref);
      if (r.resultat === 'envoyee') env++;
      else ign++;
    }
    return { envoyees: env, ignores: ign };
  });

  revalidatePath(`/${ctx.entreprise.slug}/tiers/referencement`);
  return { ok: true, data: { envoyees, ignores } };
}
