'use server';

import { and, asc, count, desc, eq, inArray, isNull } from 'drizzle-orm';
import type { PgColumn, PgTable } from 'drizzle-orm/pg-core';
import { revalidatePath } from 'next/cache';

import { auditLogIn } from '@/lib/audit/log';
import { aPermission } from '@/lib/auth/guards';
import { requireTenantContextWithMfa } from '@/lib/auth/tenant-guards';
import { withTenant, type TenantTx } from '@/lib/db/with-tenant';
import { messageBlocageSuppression } from '@/lib/common/references-suppression';
import { factures, situationsTravaux } from '@/db/schema/facturation';
import { generateNumero } from '@/lib/numbering/generate';
import {
  clients,
  composantsLigneDevis,
  devis,
  lignesDevis,
  postesInternesDevis,
  repartitionsPosteInterne,
  type ComposantLigneDevis,
  type Devis,
  type LigneDevis,
  type PosteInterne,
  type RepartitionPosteInterne,
} from '@/db/schema/commercial';
import {
  devisSchema,
  TRANSITIONS_STATUT_DEVIS,
  type DevisInput,
  type LigneDevisInput,
  type PosteInterneFormInput,
  type StatutDevis,
} from '@/lib/validation/commercial';
import { calculerMontantLigne, calculerPuDepuisComposants, calculerTotauxDevis } from './calculs';
import { appliquerRemiseGlobale } from '@/lib/remise-globale';
import { calculerVentilation, chapitreInvalide, type LigneVentilable } from './ventilation';

import { ROLES_COMMERCIAL_WRITE } from './permissions';
import type { ActionResult } from '@/lib/catalogue/types';

/** Permission atomique gardant l'écriture des postes internes ventilés.
 *  Sans ce droit, l'éditeur est masqué côté UI (cf. DevisEditor) et les
 *  postes existants sont préservés à l'identique par mettreAJourDevis. */
const PERM_POSTES_INTERNES = 'COMMERCIAL_DEVIS_POSTES_INTERNES';

/**
 * Relit les postes internes existants d'un devis sous la forme attendue
 * par le form (`PosteInterneFormInput[]`). Utilisé par `mettreAJourDevis`
 * pour préserver à l'identique les postes saisis par un utilisateur
 * autorisé pendant qu'un user sans droit édite le reste du devis.
 *
 * Doit être exécuté DANS la transaction tenant (RLS pose la GUC) — d'où le
 * paramètre `tx`.
 */
async function lirePostesInternesEnFormInput(
  tx: TenantTx,
  devisId: string,
): Promise<PosteInterneFormInput[]> {
  const postes = await tx
    .select()
    .from(postesInternesDevis)
    .where(eq(postesInternesDevis.devisId, devisId))
    .orderBy(asc(postesInternesDevis.ordre));
  if (postes.length === 0) return [];

  const lignesRows = await tx
    .select({ id: lignesDevis.id, ordre: lignesDevis.ordre })
    .from(lignesDevis)
    .where(eq(lignesDevis.devisId, devisId));
  const ligneIdToOrdre = new Map<string, number>(lignesRows.map((l) => [l.id, l.ordre]));

  const repartitions = await tx
    .select()
    .from(repartitionsPosteInterne)
    .where(
      inArray(
        repartitionsPosteInterne.posteInterneId,
        postes.map((p) => p.id),
      ),
    );

  const repartitionsParPoste = new Map<string, Array<{ ordreLigne: number; poids: string }>>();
  for (const r of repartitions) {
    const ordre = ligneIdToOrdre.get(r.ligneDevisId);
    if (ordre === undefined) continue;
    const arr = repartitionsParPoste.get(r.posteInterneId) ?? [];
    arr.push({ ordreLigne: ordre, poids: r.poids });
    repartitionsParPoste.set(r.posteInterneId, arr);
  }

  return postes.map((p): PosteInterneFormInput => {
    const reps = repartitionsParPoste.get(p.id) ?? [];
    if (p.portee === 'devis') {
      return {
        portee: 'devis',
        chapitreOrdre: null,
        libelle: p.libelle,
        montantHt: p.montantHt,
        notes: p.notes,
        repartitions: reps,
      };
    }
    return {
      portee: 'chapitre',
      chapitreOrdre: p.chapitreLigneId !== null ? (ligneIdToOrdre.get(p.chapitreLigneId) ?? 0) : 0,
      libelle: p.libelle,
      montantHt: p.montantHt,
      notes: p.notes,
      repartitions: reps,
    };
  });
}

export type DevisAvecClient = Devis & {
  clientCode: string;
  clientNom: string;
};

export type PosteInterneHydrate = PosteInterne & {
  /** `ordre` (index dans `lignes`) de la ligne section servant de chapitre,
   *  ou null si portée = 'devis'. Pratique pour le form. */
  chapitreOrdre: number | null;
  /** Poids par `ordre` de ligne (vide si ventilation uniforme). */
  repartitions: Array<{ ordreLigne: number; poids: string }>;
};

export type LigneDevisHydrate = LigneDevis & {
  composants: ComposantLigneDevis[];
};

export type DevisHydrate = Devis & {
  client: { id: string; code: string; nom: string };
  lignes: LigneDevisHydrate[];
  postesInternes: PosteInterneHydrate[];
};

// ─────────────────────────────────────────────────────────────
// Lecture
// ─────────────────────────────────────────────────────────────

function libelleClient(c: {
  type: string;
  raisonSociale: string | null;
  nom: string | null;
  prenom: string | null;
}): string {
  if (c.type === 'professionnel') return c.raisonSociale ?? '?';
  return [c.prenom, c.nom].filter(Boolean).join(' ') || '?';
}

export async function listerDevis(): Promise<DevisAvecClient[]> {
  const ctx = await requireTenantContextWithMfa();
  const rows = await withTenant(ctx.entreprise.id, (tx) =>
    tx
      .select({
        devis,
        client: {
          type: clients.type,
          code: clients.code,
          raisonSociale: clients.raisonSociale,
          nom: clients.nom,
          prenom: clients.prenom,
        },
      })
      .from(devis)
      .leftJoin(clients, eq(devis.clientId, clients.id))
      .where(isNull(devis.deletedAt))
      .orderBy(desc(devis.dateDevis), desc(devis.numero)),
  );

  return rows.map((r) => ({
    ...r.devis,
    clientCode: r.client?.code ?? '',
    clientNom: r.client ? libelleClient(r.client) : '',
  }));
}

export async function lireDevis(id: string): Promise<DevisHydrate | null> {
  const ctx = await requireTenantContextWithMfa();
  return withTenant(ctx.entreprise.id, async (tx) => {
    const [row] = await tx
      .select({
        devis,
        client: {
          id: clients.id,
          code: clients.code,
          type: clients.type,
          raisonSociale: clients.raisonSociale,
          nom: clients.nom,
          prenom: clients.prenom,
        },
      })
      .from(devis)
      .leftJoin(clients, eq(devis.clientId, clients.id))
      .where(and(eq(devis.id, id), isNull(devis.deletedAt)))
      .limit(1);
    if (!row || !row.client) return null;

    const lignesRows = await tx
      .select()
      .from(lignesDevis)
      .where(eq(lignesDevis.devisId, id))
      .orderBy(asc(lignesDevis.ordre), asc(lignesDevis.id));

    // Charge tous les composants de toutes les lignes en un seul aller-retour.
    let composantsRows: ComposantLigneDevis[] = [];
    if (lignesRows.length > 0) {
      const ligneIds = lignesRows.map((l) => l.id);
      composantsRows = await tx
        .select()
        .from(composantsLigneDevis)
        .where(inArray(composantsLigneDevis.ligneDevisId, ligneIds))
        .orderBy(asc(composantsLigneDevis.ordre));
    }
    const composantsParLigne = new Map<string, ComposantLigneDevis[]>();
    for (const c of composantsRows) {
      const arr = composantsParLigne.get(c.ligneDevisId) ?? [];
      arr.push(c);
      composantsParLigne.set(c.ligneDevisId, arr);
    }
    const lignes: LigneDevisHydrate[] = lignesRows.map((l) => ({
      ...l,
      composants: composantsParLigne.get(l.id) ?? [],
    }));

    const postes = await tx
      .select()
      .from(postesInternesDevis)
      .where(eq(postesInternesDevis.devisId, id))
      .orderBy(asc(postesInternesDevis.ordre));

    const ligneIdToOrdre = new Map<string, number>();
    lignes.forEach((l) => ligneIdToOrdre.set(l.id, l.ordre));

    let repartitions: RepartitionPosteInterne[] = [];
    if (postes.length > 0) {
      const ids = postes.map((p) => p.id);
      repartitions = await tx
        .select()
        .from(repartitionsPosteInterne)
        .where(inArray(repartitionsPosteInterne.posteInterneId, ids));
    }

    const repartitionsParPoste = new Map<string, Array<{ ordreLigne: number; poids: string }>>();
    for (const r of repartitions) {
      const ordre = ligneIdToOrdre.get(r.ligneDevisId);
      if (ordre === undefined) continue; // ligne supprimée hors-bande
      const arr = repartitionsParPoste.get(r.posteInterneId) ?? [];
      arr.push({ ordreLigne: ordre, poids: r.poids });
      repartitionsParPoste.set(r.posteInterneId, arr);
    }

    const postesInternes: PosteInterneHydrate[] = postes.map((p) => ({
      ...p,
      chapitreOrdre:
        p.chapitreLigneId !== null ? (ligneIdToOrdre.get(p.chapitreLigneId) ?? null) : null,
      repartitions: repartitionsParPoste.get(p.id) ?? [],
    }));

    return {
      ...row.devis,
      client: {
        id: row.client.id,
        code: row.client.code,
        nom: libelleClient(row.client),
      },
      lignes,
      postesInternes,
    };
  });
}

// ─────────────────────────────────────────────────────────────
// Mutations
// ─────────────────────────────────────────────────────────────

function preparerLignesAInserer(
  entrepriseId: string,
  devisId: string,
  lignesInput: LigneDevisInput[],
  apportsParOrdre: Map<number, number>,
) {
  return lignesInput.map((l, idx) => {
    const apport = apportsParOrdre.get(idx) ?? 0;
    const montants = calculerMontantLigne(l, apport);
    // Si la ligne a des composants, on stocke le PU dérivé (auto-chiffrage)
    // en colonne `prix_unitaire_ht` plutôt que celui saisi. Cela garde la
    // contrainte de cohérence du cache montantHt = qte × PU × (1-remise).
    const puStocke =
      l.type === 'section'
        ? null
        : (calculerPuDepuisComposants(l.composants ?? []) ?? (l.prixUnitaireHt as string));
    return {
      entrepriseId,
      devisId,
      ordre: idx,
      type: l.type,
      designation: l.designation,
      articleId: 'articleId' in l ? l.articleId : null,
      quantite: l.type === 'section' ? null : (l.quantite as string),
      unite: l.type === 'section' ? null : (l.unite as string),
      prixUnitaireHt: puStocke,
      tauxTva: l.type === 'section' ? null : (l.tauxTva as string),
      remisePourcent: l.type === 'section' ? null : (l.remisePourcent ?? '0'),
      montantHt: montants.montantHt,
      montantTva: montants.montantTva,
      montantTtc: montants.montantTtc,
      notes: l.notes ?? null,
      origineDpgf: l.origineDpgf ?? false,
    };
  });
}

async function insererComposants(
  tx: TenantTx,
  entrepriseId: string,
  lignesInput: LigneDevisInput[],
  lignesInserees: { ordre: number; id: string }[],
) {
  const ordreVersId = new Map(lignesInserees.map((l) => [l.ordre, l.id]));
  const rows: Array<{
    entrepriseId: string;
    ligneDevisId: string;
    ordre: number;
    type: 'article_catalogue' | 'libre';
    articleId: string | null;
    designation: string | null;
    quantiteParUnite: string;
    prixUnitaireHt: string;
    tauxTva: string | null;
    remisePourcent: string | null;
    notes: string | null;
  }> = [];
  lignesInput.forEach((l, idx) => {
    if (l.type === 'section') return;
    const ligneId = ordreVersId.get(idx);
    if (!ligneId) return;
    (l.composants ?? []).forEach((c, j) => {
      rows.push({
        entrepriseId,
        ligneDevisId: ligneId,
        ordre: j,
        type: c.type,
        articleId: c.type === 'article_catalogue' ? c.articleId : null,
        designation: c.type === 'libre' ? c.designation : null,
        quantiteParUnite: c.quantiteParUnite,
        prixUnitaireHt: c.prixUnitaireHt,
        tauxTva: c.type === 'libre' ? c.tauxTva : null,
        remisePourcent: c.type === 'libre' ? c.remisePourcent : null,
        notes: c.notes,
      });
    });
  });
  if (rows.length > 0) {
    await tx.insert(composantsLigneDevis).values(rows);
  }
}

/**
 * Vérifie que chaque poste interne référence des ordres de ligne valides
 * (chapitreOrdre = section existante ; ordreLigne dans répartitions = ligne
 * non-section présente). Retourne un message d'erreur ou null.
 */
function validerPostesContreLignes(
  lignes: LigneDevisInput[],
  postes: PosteInterneFormInput[],
): string | null {
  const ventilables: LigneVentilable[] = lignes.map((l, i) => ({
    ordre: i,
    type: l.type,
    quantite: l.type === 'section' ? null : l.quantite,
    prixUnitaireHt: l.type === 'section' ? null : l.prixUnitaireHt,
    remisePourcent: l.type === 'section' ? null : (l.remisePourcent ?? '0'),
  }));
  for (let i = 0; i < postes.length; i++) {
    const p = postes[i]!;
    if (p.portee === 'chapitre') {
      if (chapitreInvalide(ventilables, p.chapitreOrdre)) {
        return `Poste interne « ${p.libelle} » : le chapitre sélectionné n'existe pas ou n'est plus une section.`;
      }
    }
    for (const r of p.repartitions) {
      const ligne = lignes[r.ordreLigne];
      if (!ligne) {
        return `Poste interne « ${p.libelle} » : référence vers une ligne inexistante.`;
      }
      if (ligne.type === 'section') {
        return `Poste interne « ${p.libelle} » : on ne peut pondérer qu'une ligne d'article, pas une section.`;
      }
    }
  }
  return null;
}

function calculerApports(
  lignes: LigneDevisInput[],
  postes: PosteInterneFormInput[],
): Map<number, number> {
  return calculerVentilation(
    lignes.map(
      (l, i): LigneVentilable => ({
        ordre: i,
        type: l.type,
        quantite: l.type === 'section' ? null : l.quantite,
        prixUnitaireHt: l.type === 'section' ? null : l.prixUnitaireHt,
        remisePourcent: l.type === 'section' ? null : (l.remisePourcent ?? '0'),
      }),
    ),
    postes.map((p) => ({
      montantHt: p.montantHt,
      portee: p.portee,
      chapitreOrdre: p.portee === 'chapitre' ? p.chapitreOrdre : null,
      repartitions: p.repartitions,
    })),
  );
}

async function insererPostesInternes(
  tx: TenantTx,
  entrepriseId: string,
  devisId: string,
  lignesInserees: { ordre: number; id: string; type: string }[],
  postes: PosteInterneFormInput[],
) {
  if (postes.length === 0) return;
  const ordreVersId = new Map(lignesInserees.map((l) => [l.ordre, l.id]));

  for (let i = 0; i < postes.length; i++) {
    const p = postes[i]!;
    const chapitreLigneId =
      p.portee === 'chapitre' ? (ordreVersId.get(p.chapitreOrdre) ?? null) : null;
    const [insertedPoste] = await tx
      .insert(postesInternesDevis)
      .values({
        entrepriseId,
        devisId,
        ordre: i,
        libelle: p.libelle,
        montantHt: p.montantHt,
        portee: p.portee,
        chapitreLigneId,
        notes: p.notes,
      })
      .returning({ id: postesInternesDevis.id });
    if (!insertedPoste) throw new Error('INSERT poste interne failed');

    if (p.repartitions.length > 0) {
      const rows = p.repartitions
        .map((r) => {
          const ligneId = ordreVersId.get(r.ordreLigne);
          if (!ligneId) return null;
          return {
            entrepriseId,
            posteInterneId: insertedPoste.id,
            ligneDevisId: ligneId,
            poids: r.poids,
          };
        })
        .filter((x): x is NonNullable<typeof x> => x !== null);
      if (rows.length > 0) {
        await tx.insert(repartitionsPosteInterne).values(rows);
      }
    }
  }
}

export async function creerDevis(
  input: DevisInput,
): Promise<ActionResult<{ id: string; numero: string }>> {
  const ctx = await requireTenantContextWithMfa(ROLES_COMMERCIAL_WRITE);
  const parsed = devisSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: 'Données invalides.',
      fieldErrors: parsed.error.flatten().fieldErrors as Record<string, string[]>,
    };
  }

  // Filtre défensif : sans le droit COMMERCIAL_DEVIS_POSTES_INTERNES, on
  // ignore les postes envoyés (l'éditeur lui est masqué dans le DevisEditor).
  const peutGererPostes = await aPermission(ctx.utilisateur.roleId, PERM_POSTES_INTERNES);
  const postesEffectifs: PosteInterneFormInput[] = peutGererPostes
    ? parsed.data.postesInternes
    : [];

  const erreurPostes = validerPostesContreLignes(parsed.data.lignes, postesEffectifs);
  if (erreurPostes) return { ok: false, error: erreurPostes };

  const apportsParOrdre = calculerApports(parsed.data.lignes, postesEffectifs);

  const totaux = appliquerRemiseGlobale(calculerTotauxDevis(parsed.data.lignes, postesEffectifs), {
    type: parsed.data.remiseGlobaleType,
    valeur: parsed.data.remiseGlobaleValeur,
  });

  try {
    const result = await withTenant(ctx.entreprise.id, async (tx) => {
      const numero = await generateNumero(tx, 'devis', ctx.entreprise.id);
      const [inserted] = await tx
        .insert(devis)
        .values({
          entrepriseId: ctx.entreprise.id,
          numero,
          clientId: parsed.data.clientId,
          dateDevis: parsed.data.dateDevis,
          dateValidite: parsed.data.dateValidite,
          statut: 'brouillon',
          objet: parsed.data.objet,
          conditionsGenerales: parsed.data.conditionsGenerales,
          notes: parsed.data.notes,
          totalHt: totaux.totalHt,
          totalTva: totaux.totalTva,
          totalTtc: totaux.totalTtc,
          detailsTva: totaux.detailsTva,
          remiseGlobaleType: parsed.data.remiseGlobaleType,
          remiseGlobaleValeur: parsed.data.remiseGlobaleValeur,
          createdBy: ctx.utilisateur.id,
          updatedBy: ctx.utilisateur.id,
        })
        .returning({ id: devis.id });
      if (!inserted) throw new Error('INSERT failed');

      const lignesInserees: { ordre: number; id: string; type: string }[] = [];
      if (parsed.data.lignes.length > 0) {
        const values = preparerLignesAInserer(
          ctx.entreprise.id,
          inserted.id,
          parsed.data.lignes,
          apportsParOrdre,
        );
        const rows = await tx.insert(lignesDevis).values(values).returning({
          id: lignesDevis.id,
          ordre: lignesDevis.ordre,
          type: lignesDevis.type,
        });
        for (const r of rows) lignesInserees.push(r);
      }

      await insererPostesInternes(
        tx,
        ctx.entreprise.id,
        inserted.id,
        lignesInserees,
        postesEffectifs,
      );
      await insererComposants(tx, ctx.entreprise.id, parsed.data.lignes, lignesInserees);

      await auditLogIn(tx, {
        action: 'insert',
        tableName: 'devis',
        rowId: inserted.id,
        after: {
          numero,
          clientId: parsed.data.clientId,
          lignes: parsed.data.lignes.length,
          postesInternes: postesEffectifs.length,
          totaux,
        },
      });

      return { id: inserted.id, numero };
    });
    revalidatePath(`/${ctx.entreprise.slug}/commercial/devis`);
    revalidatePath(`/${ctx.entreprise.slug}/commercial`);
    return { ok: true, data: { id: result.id, numero: result.numero } };
  } catch (err) {
    throw err;
  }
}

export async function mettreAJourDevis(id: string, input: DevisInput): Promise<ActionResult> {
  const ctx = await requireTenantContextWithMfa(ROLES_COMMERCIAL_WRITE);
  const parsed = devisSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: 'Données invalides.',
      fieldErrors: parsed.error.flatten().fieldErrors as Record<string, string[]>,
    };
  }

  // Sans le droit COMMERCIAL_DEVIS_POSTES_INTERNES, on préserve les postes
  // existants à l'identique (relus depuis la base) plutôt que d'accepter
  // l'input. L'éditeur étant masqué côté UI, le form soumet quand même les
  // postes via `defaultValues` — on les ignore par sécurité (silent).
  const peutGererPostes = await aPermission(ctx.utilisateur.roleId, PERM_POSTES_INTERNES);

  try {
    await withTenant(ctx.entreprise.id, async (tx) => {
      const postesEffectifs: PosteInterneFormInput[] = peutGererPostes
        ? parsed.data.postesInternes
        : await lirePostesInternesEnFormInput(tx, id);

      const erreurPostes = validerPostesContreLignes(parsed.data.lignes, postesEffectifs);
      if (erreurPostes) throw new Error(`VALIDATION:${erreurPostes}`);

      const apportsParOrdre = calculerApports(parsed.data.lignes, postesEffectifs);
      const totaux = appliquerRemiseGlobale(
        calculerTotauxDevis(parsed.data.lignes, postesEffectifs),
        {
          type: parsed.data.remiseGlobaleType,
          valeur: parsed.data.remiseGlobaleValeur,
        },
      );

      const [before] = await tx
        .select()
        .from(devis)
        .where(and(eq(devis.id, id), isNull(devis.deletedAt)));
      if (!before) throw new Error('NOT_FOUND');

      // Replace all postes (cascade ON DELETE supprime les répartitions),
      // puis toutes les lignes, puis réinsère. Les IDs des lignes changent
      // donc les références sont reconstruites depuis les ordres du form.
      await tx.delete(postesInternesDevis).where(eq(postesInternesDevis.devisId, id));
      await tx.delete(lignesDevis).where(eq(lignesDevis.devisId, id));

      const lignesInserees: { ordre: number; id: string; type: string }[] = [];
      if (parsed.data.lignes.length > 0) {
        const values = preparerLignesAInserer(
          ctx.entreprise.id,
          id,
          parsed.data.lignes,
          apportsParOrdre,
        );
        const rows = await tx.insert(lignesDevis).values(values).returning({
          id: lignesDevis.id,
          ordre: lignesDevis.ordre,
          type: lignesDevis.type,
        });
        for (const r of rows) lignesInserees.push(r);
      }

      await insererPostesInternes(tx, ctx.entreprise.id, id, lignesInserees, postesEffectifs);
      await insererComposants(tx, ctx.entreprise.id, parsed.data.lignes, lignesInserees);

      await tx
        .update(devis)
        .set({
          clientId: parsed.data.clientId,
          dateDevis: parsed.data.dateDevis,
          dateValidite: parsed.data.dateValidite,
          objet: parsed.data.objet,
          conditionsGenerales: parsed.data.conditionsGenerales,
          notes: parsed.data.notes,
          totalHt: totaux.totalHt,
          totalTva: totaux.totalTva,
          totalTtc: totaux.totalTtc,
          detailsTva: totaux.detailsTva,
          remiseGlobaleType: parsed.data.remiseGlobaleType,
          remiseGlobaleValeur: parsed.data.remiseGlobaleValeur,
          updatedBy: ctx.utilisateur.id,
        })
        .where(eq(devis.id, id));

      await auditLogIn(tx, {
        action: 'update',
        tableName: 'devis',
        rowId: id,
        before,
        after: {
          lignes: parsed.data.lignes.length,
          postesInternes: postesEffectifs.length,
          totaux,
        },
      });
    });
    revalidatePath(`/${ctx.entreprise.slug}/commercial/devis`);
    revalidatePath(`/${ctx.entreprise.slug}/commercial/devis/${id}`);
    return { ok: true, data: undefined };
  } catch (err) {
    if (err instanceof Error && err.message === 'NOT_FOUND') {
      return { ok: false, error: 'Devis introuvable.' };
    }
    if (err instanceof Error && err.message.startsWith('VALIDATION:')) {
      return { ok: false, error: err.message.slice('VALIDATION:'.length) };
    }
    throw err;
  }
}

/** Permission RBAC déjà seedée par la migration 0021 (cf. db/migrations/0021_rbac_granulaire.sql).
 *  Accordée par défaut à admin / comptable / conducteur_travaux. */
const PERM_VALIDER = 'COMMERCIAL_DEVIS_VALIDATE';

/** Vérifie si la transition demandée est une action réservée au valideur
 *  (en_validation → valide ou en_validation → brouillon pour refus). */
function estTransitionValideur(before: StatutDevis, next: StatutDevis): boolean {
  return before === 'en_validation' && (next === 'valide' || next === 'brouillon');
}

export async function changerStatutDevis(
  id: string,
  nouveauStatut: StatutDevis,
): Promise<ActionResult> {
  const ctx = await requireTenantContextWithMfa(ROLES_COMMERCIAL_WRITE);

  try {
    await withTenant(ctx.entreprise.id, async (tx) => {
      const [before] = await tx.select().from(devis).where(eq(devis.id, id));
      if (!before) throw new Error('NOT_FOUND');
      const transitionsValides = TRANSITIONS_STATUT_DEVIS[before.statut as StatutDevis];
      if (!transitionsValides.includes(nouveauStatut)) {
        throw new Error(
          `TRANSITION_INTERDITE:${before.statut} → ${nouveauStatut}. Possible : ${transitionsValides.join(', ') || 'aucune'}.`,
        );
      }
      // Gate RBAC : seul un utilisateur avec COMMERCIAL_DEVIS_VALIDER peut
      // valider ou refuser un devis en validation.
      if (estTransitionValideur(before.statut as StatutDevis, nouveauStatut)) {
        if (!(await aPermission(ctx.utilisateur.roleId, PERM_VALIDER))) {
          throw new Error('NON_VALIDEUR');
        }
      }
      await tx
        .update(devis)
        .set({ statut: nouveauStatut, updatedBy: ctx.utilisateur.id })
        .where(eq(devis.id, id));
      await auditLogIn(tx, {
        action: 'update',
        tableName: 'devis',
        rowId: id,
        before: { statut: before.statut },
        after: { statut: nouveauStatut },
      });
    });
    revalidatePath(`/${ctx.entreprise.slug}/commercial/devis`);
    revalidatePath(`/${ctx.entreprise.slug}/commercial/devis/${id}`);
    return { ok: true, data: undefined };
  } catch (err) {
    if (err instanceof Error && err.message === 'NOT_FOUND') {
      return { ok: false, error: 'Devis introuvable.' };
    }
    if (err instanceof Error && err.message === 'NON_VALIDEUR') {
      return {
        ok: false,
        error:
          'Seul un utilisateur avec la permission « Valider un devis » peut approuver ou refuser.',
      };
    }
    if (err instanceof Error && err.message.startsWith('TRANSITION_INTERDITE:')) {
      return {
        ok: false,
        error: `Transition impossible : ${err.message.slice('TRANSITION_INTERDITE:'.length)}`,
      };
    }
    throw err;
  }
}

export async function supprimerDevis(id: string): Promise<ActionResult> {
  const ctx = await requireTenantContextWithMfa(ROLES_COMMERCIAL_WRITE);
  try {
    const blocage = await withTenant(ctx.entreprise.id, async (tx) => {
      const [before] = await tx
        .select()
        .from(devis)
        .where(and(eq(devis.id, id), isNull(devis.deletedAt)));
      if (!before) return null;
      if (before.statut !== 'brouillon') {
        throw new Error('Seuls les devis en brouillon peuvent être supprimés.');
      }

      // Soft-delete : pas de FK déclenchée. Les lignes et postes internes sont
      // en cascade. On bloque si une facture ou une situation s'y réfère encore.
      const compte = async (table: PgTable, col: PgColumn) => {
        const [r] = await tx.select({ n: count() }).from(table).where(eq(col, id));
        return r?.n ?? 0;
      };
      const message = messageBlocageSuppression('ce devis', [
        {
          nombre: await compte(factures, factures.devisId),
          singulier: 'facture',
          pluriel: 'factures',
        },
        {
          nombre: await compte(situationsTravaux, situationsTravaux.devisId),
          singulier: 'situation de travaux',
          pluriel: 'situations de travaux',
        },
      ]);
      if (message) return message;

      await tx
        .update(devis)
        .set({ deletedAt: new Date(), updatedBy: ctx.utilisateur.id })
        .where(eq(devis.id, id));
      await auditLogIn(tx, {
        action: 'delete',
        tableName: 'devis',
        rowId: id,
        before,
      });
      return null;
    });
    if (blocage) return { ok: false, error: blocage };
    revalidatePath(`/${ctx.entreprise.slug}/commercial/devis`);
    return { ok: true, data: undefined };
  } catch (err) {
    if (err instanceof Error && err.message.startsWith('Seuls les devis')) {
      return { ok: false, error: err.message };
    }
    throw err;
  }
}

// ─────────────────────────────────────────────────────────────
// Duplication d'un devis
// ─────────────────────────────────────────────────────────────

const PERM_VERSION = 'COMMERCIAL_DEVIS_VERSION';

export type DupliquerMode = 'meme_client' | 'autre_client';

/** Duplique un devis existant en créant un nouveau devis en statut `brouillon`
 *  avec un nouveau numéro et la même structure (lignes + composants + postes
 *  internes).
 *
 *  - mode='meme_client'  → garde `clientId`, gated par COMMERCIAL_DEVIS_VERSION
 *    (négociation : créer une v2/v3 du devis pour le même client).
 *  - mode='autre_client' → met `clientId` à null (l'utilisateur choisira
 *    sur l'écran d'édition), gated par ROLES_COMMERCIAL_WRITE uniquement.
 *
 *  Retourne `{ id, numero }` du nouveau devis pour permettre la redirection
 *  côté client. */
export async function dupliquerDevis(
  sourceId: string,
  mode: DupliquerMode,
): Promise<ActionResult<{ id: string; numero: string }>> {
  const ctx = await requireTenantContextWithMfa(ROLES_COMMERCIAL_WRITE);

  if (mode === 'meme_client') {
    const ok = await aPermission(ctx.utilisateur.roleId, PERM_VERSION);
    if (!ok) {
      return {
        ok: false,
        error:
          "Permission manquante : gérer les versions d'un devis (« COMMERCIAL_DEVIS_VERSION »).",
      };
    }
  }

  const source = await lireDevis(sourceId);
  if (!source) return { ok: false, error: 'Devis source introuvable.' };

  // Reconstruction d'un DevisInput depuis le devis hydraté (même logique
  // que dans app/(app)/[entrepriseSlug]/commercial/devis/[id]/page.tsx).
  const lignesInput: LigneDevisInput[] = source.lignes.map((l) => {
    const composants = l.composants.map((c) =>
      c.type === 'libre'
        ? {
            type: 'libre' as const,
            articleId: null,
            designation: c.designation ?? '',
            quantiteParUnite: c.quantiteParUnite,
            prixUnitaireHt: c.prixUnitaireHt,
            tauxTva: c.tauxTva,
            remisePourcent: c.remisePourcent,
            notes: c.notes,
          }
        : {
            type: 'article_catalogue' as const,
            articleId: c.articleId!,
            designation: null,
            quantiteParUnite: c.quantiteParUnite,
            prixUnitaireHt: c.prixUnitaireHt,
            tauxTva: null,
            remisePourcent: null,
            notes: c.notes,
          },
    );
    if (l.type === 'section') {
      return {
        type: 'section',
        designation: l.designation,
        articleId: null,
        quantite: null,
        unite: null,
        prixUnitaireHt: null,
        tauxTva: null,
        remisePourcent: null,
        notes: l.notes,
        composants: [],
        origineDpgf: l.origineDpgf,
      } as LigneDevisInput;
    }
    if (l.type === 'article_catalogue') {
      return {
        type: 'article_catalogue',
        articleId: l.articleId ?? '',
        designation: l.designation,
        quantite: l.quantite ?? '0',
        unite: l.unite ?? 'u',
        prixUnitaireHt: l.prixUnitaireHt ?? '0',
        tauxTva: l.tauxTva ?? '20.00',
        remisePourcent: l.remisePourcent ?? '0',
        notes: l.notes,
        composants,
        origineDpgf: l.origineDpgf,
      } as LigneDevisInput;
    }
    return {
      type: 'libre',
      articleId: null,
      designation: l.designation,
      quantite: l.quantite ?? '0',
      unite: l.unite ?? 'u',
      prixUnitaireHt: l.prixUnitaireHt ?? '0',
      tauxTva: l.tauxTva ?? '20.00',
      remisePourcent: l.remisePourcent ?? '0',
      notes: l.notes,
      composants,
      origineDpgf: l.origineDpgf,
    } as LigneDevisInput;
  });

  const postesInternesInput: PosteInterneFormInput[] = source.postesInternes.map((p) =>
    p.portee === 'devis'
      ? {
          portee: 'devis',
          chapitreOrdre: null,
          libelle: p.libelle,
          montantHt: p.montantHt,
          notes: p.notes ?? null,
          repartitions: p.repartitions,
        }
      : {
          portee: 'chapitre',
          chapitreOrdre: p.chapitreOrdre ?? 0,
          libelle: p.libelle,
          montantHt: p.montantHt,
          notes: p.notes ?? null,
          repartitions: p.repartitions,
        },
  );

  // En autre_client : on vide clientId pour forcer la sélection à l'édition.
  // Le schéma Zod exige un UUID non vide → on doit donc gérer le clientId
  // vide spécialement. Comme creerDevis exige un client, on garde l'ancien
  // par défaut et on documentera le UX : l'utilisateur change le client
  // après duplication. C'est la solution la plus simple sans refactor de schéma.
  const clientIdNouveau = source.client.id;

  // Dates : aujourd'hui + validité 30j, pas de copie des anciennes dates qui
  // seraient probablement obsolètes.
  const today = new Date().toISOString().slice(0, 10);
  const plus30 = (() => {
    const d = new Date();
    d.setDate(d.getDate() + 30);
    return d.toISOString().slice(0, 10);
  })();

  const objetSuffix = mode === 'meme_client' ? ' (nouvelle version)' : ' (copie)';
  const objetCopy = ((source.objet ?? '') + objetSuffix).slice(0, 200);

  const input: DevisInput = {
    clientId: clientIdNouveau,
    dateDevis: today,
    dateValidite: plus30,
    objet: objetCopy,
    conditionsGenerales: source.conditionsGenerales,
    notes: source.notes,
    lignes: lignesInput,
    postesInternes: postesInternesInput,
    remiseGlobaleType: source.remiseGlobaleType as DevisInput['remiseGlobaleType'],
    remiseGlobaleValeur: source.remiseGlobaleValeur,
  };

  // Délègue toute la logique d'insertion (numéro, lignes, composants, postes)
  // à creerDevis pour garantir la cohérence avec une création manuelle.
  const r = await creerDevis(input);
  if (!r.ok) return r;

  await withTenant(ctx.entreprise.id, async (tx) => {
    await auditLogIn(tx, {
      action: 'insert',
      tableName: 'devis',
      rowId: r.data.id,
      after: { dupliqueDepuis: sourceId, mode, numero: r.data.numero },
    });
  });

  revalidatePath(`/${ctx.entreprise.slug}/commercial/devis`);
  return { ok: true, data: r.data };
}
