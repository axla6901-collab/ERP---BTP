'use server';

import { and, asc, desc, eq, isNull, ne, sql } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';

import { auditLogIn } from '@/lib/audit/log';
import { requireTenantContextWithMfa } from '@/lib/auth/tenant-guards';
import { withTenant } from '@/lib/db/with-tenant';
import { generateNumero } from '@/lib/numbering/generate';
import { chantiers } from '@/db/schema/chantiers';
import { devis, lignesDevis } from '@/db/schema/commercial';
import {
  factures,
  lignesFacture,
  lignesSituation,
  situationsTravaux,
  type LigneSituation,
  type SituationTravaux,
} from '@/db/schema/facturation';
import {
  situationTravauxSchema,
  type SituationTravauxInput,
} from '@/lib/validation/facturation';

import {
  calculerLigneSituation,
  calculerTotauxSituation,
} from './calculs';
import {
  appliquerRemiseGlobale,
  calculerMontantRemiseGlobale,
  type RemiseGlobaleType,
} from '@/lib/remise-globale';
import { ROLES_FACTURATION_WRITE } from './permissions';
import type { ActionResult } from './types';

export type SituationAvecChantier = SituationTravaux & {
  chantierNumero: string;
  chantierLibelle: string;
  factureNumero: string | null;
};

export type SituationHydrate = SituationTravaux & {
  chantierNumero: string;
  chantierLibelle: string;
  factureNumero: string | null;
  lignes: LigneSituation[];
};

function libelleClient(c: {
  type: string;
  raisonSociale: string | null;
  nom: string | null;
  prenom: string | null;
}): string {
  if (c.type === 'professionnel') return c.raisonSociale ?? '?';
  return [c.prenom, c.nom].filter(Boolean).join(' ') || '?';
}

// ─────────────────────────────────────────────────────────────
// Lecture
// ─────────────────────────────────────────────────────────────

export async function listerSituations(): Promise<SituationAvecChantier[]> {
  const ctx = await requireTenantContextWithMfa();
  const rows = await withTenant(ctx.entreprise.id, (tx) =>
    tx
      .select({
        situation: situationsTravaux,
        chantierNumero: chantiers.numero,
        chantierLibelle: chantiers.libelle,
        factureNumero: factures.numero,
      })
      .from(situationsTravaux)
      .leftJoin(chantiers, eq(situationsTravaux.chantierId, chantiers.id))
      .leftJoin(factures, eq(situationsTravaux.factureId, factures.id))
      .where(isNull(situationsTravaux.deletedAt))
      .orderBy(desc(situationsTravaux.dateSituation), desc(situationsTravaux.numero)),
  );

  return rows.map((r) => ({
    ...r.situation,
    chantierNumero: r.chantierNumero ?? '',
    chantierLibelle: r.chantierLibelle ?? '',
    factureNumero: r.factureNumero ?? null,
  }));
}

export async function listerSituationsChantier(
  chantierId: string,
): Promise<SituationAvecChantier[]> {
  const ctx = await requireTenantContextWithMfa();
  const rows = await withTenant(ctx.entreprise.id, (tx) =>
    tx
      .select({
        situation: situationsTravaux,
        chantierNumero: chantiers.numero,
        chantierLibelle: chantiers.libelle,
        factureNumero: factures.numero,
      })
      .from(situationsTravaux)
      .leftJoin(chantiers, eq(situationsTravaux.chantierId, chantiers.id))
      .leftJoin(factures, eq(situationsTravaux.factureId, factures.id))
      .where(
        and(
          eq(situationsTravaux.chantierId, chantierId),
          isNull(situationsTravaux.deletedAt),
        ),
      )
      .orderBy(desc(situationsTravaux.numero)),
  );

  return rows.map((r) => ({
    ...r.situation,
    chantierNumero: r.chantierNumero ?? '',
    chantierLibelle: r.chantierLibelle ?? '',
    factureNumero: r.factureNumero ?? null,
  }));
}

export async function lireSituation(id: string): Promise<SituationHydrate | null> {
  const ctx = await requireTenantContextWithMfa();
  return withTenant(ctx.entreprise.id, async (tx) => {
    const [row] = await tx
      .select({
        situation: situationsTravaux,
        chantierNumero: chantiers.numero,
        chantierLibelle: chantiers.libelle,
        factureNumero: factures.numero,
      })
      .from(situationsTravaux)
      .leftJoin(chantiers, eq(situationsTravaux.chantierId, chantiers.id))
      .leftJoin(factures, eq(situationsTravaux.factureId, factures.id))
      .where(and(eq(situationsTravaux.id, id), isNull(situationsTravaux.deletedAt)))
      .limit(1);
    if (!row) return null;

    const lignes = await tx
      .select()
      .from(lignesSituation)
      .where(eq(lignesSituation.situationId, id))
      .orderBy(asc(lignesSituation.ordre), asc(lignesSituation.id));

    return {
      ...row.situation,
      chantierNumero: row.chantierNumero ?? '',
      chantierLibelle: row.chantierLibelle ?? '',
      factureNumero: row.factureNumero ?? null,
      lignes,
    };
  });
}

export type LignePrecedente = {
  lignePrecedenteId: string;
  designation: string;
  articleId: string | null;
  quantite: string | null;
  unite: string | null;
  prixUnitaireHt: string | null;
  montantMarcheHt: string;
  pctAvancementCumule: string;
  montantCumuleHt: string;
  notes: string | null;
};

/**
 * Charge les lignes de la situation précédente d'un chantier (utile pour
 * pré-remplir une nouvelle situation : on reprend les postes et on ajuste
 * juste les %).
 */
export async function chargerLignesPrecedentes(
  chantierId: string,
): Promise<{ lignes: LignePrecedente[]; situationNumero: number } | null> {
  const ctx = await requireTenantContextWithMfa(ROLES_FACTURATION_WRITE);
  return withTenant(ctx.entreprise.id, async (tx) => {
    const [precedente] = await tx
      .select()
      .from(situationsTravaux)
      .where(
        and(
          eq(situationsTravaux.chantierId, chantierId),
          isNull(situationsTravaux.deletedAt),
          ne(situationsTravaux.statut, 'annulee'),
        ),
      )
      .orderBy(desc(situationsTravaux.numero))
      .limit(1);
    if (!precedente) return null;

    const lignes = await tx
      .select()
      .from(lignesSituation)
      .where(eq(lignesSituation.situationId, precedente.id))
      .orderBy(asc(lignesSituation.ordre), asc(lignesSituation.id));

    return {
      situationNumero: precedente.numero,
      lignes: lignes.map((l) => ({
        lignePrecedenteId: l.id,
        designation: l.designation,
        articleId: l.articleId,
        quantite: l.quantite,
        unite: l.unite,
        prixUnitaireHt: l.prixUnitaireHt,
        montantMarcheHt: l.montantMarcheHt,
        pctAvancementCumule: l.pctAvancementCumule,
        montantCumuleHt: l.montantCumuleHt,
        notes: l.notes,
      })),
    };
  });
}

export type LigneDevisPourSituation = {
  designation: string;
  articleId: string | null;
  quantite: string | null;
  unite: string | null;
  prixUnitaireHt: string | null;
  montantMarcheHt: string;
};

export type DevisFacturable = {
  id: string;
  numero: string;
  dateDevis: string;
  totalHt: string;
};

/**
 * Liste les devis « facturables » d'un chantier : statut accepté, non
 * supprimé, du même client que le chantier. Utilisé par le sélecteur de
 * devis source dans le formulaire de situation.
 */
export async function listerDevisFacturablesChantier(
  chantierId: string,
): Promise<DevisFacturable[]> {
  const ctx = await requireTenantContextWithMfa();
  return withTenant(ctx.entreprise.id, async (tx) => {
    const [c] = await tx
      .select({ clientId: chantiers.clientId })
      .from(chantiers)
      .where(eq(chantiers.id, chantierId))
      .limit(1);
    if (!c) return [];
    const rows = await tx
      .select({
        id: devis.id,
        numero: devis.numero,
        dateDevis: devis.dateDevis,
        totalHt: devis.totalHt,
      })
      .from(devis)
      .where(
        and(
          eq(devis.clientId, c.clientId),
          eq(devis.statut, 'gagne'),
          isNull(devis.deletedAt),
        ),
      )
      .orderBy(desc(devis.dateDevis));
    return rows;
  });
}

/** Remise du devis reprise sur la situation, toujours exprimée en pourcentage
 *  (un montant fixe du devis est converti en % de son total HT brut, pour se
 *  répartir correctement sur les situations successives — sinon il serait
 *  déduit en entier à chaque situation). */
export type RemiseReprise = { type: 'pourcent'; valeur: string } | null;

/**
 * Transforme les lignes d'un devis accepté en lignes prêtes à remplir une
 * situation. Les sections sont ignorées (pas de montant). Le calcul
 * applique la remise éventuelle pour obtenir le montant marché HT du poste.
 * Renvoie aussi la remise globale du devis (cf. [[RemiseReprise]]).
 */
export async function chargerLignesDevis(
  devisId: string,
): Promise<{
  lignes: LigneDevisPourSituation[];
  devisNumero: string;
  remiseGlobale: RemiseReprise;
} | null> {
  const ctx = await requireTenantContextWithMfa(ROLES_FACTURATION_WRITE);
  return withTenant(ctx.entreprise.id, async (tx) => {
    const [d] = await tx
      .select({
        numero: devis.numero,
        statut: devis.statut,
        remiseGlobaleType: devis.remiseGlobaleType,
        remiseGlobaleValeur: devis.remiseGlobaleValeur,
      })
      .from(devis)
      .where(and(eq(devis.id, devisId), isNull(devis.deletedAt)))
      .limit(1);
    if (!d) return null;
    if (d.statut !== 'gagne') {
      // On autorise quand même (au cas où) mais on pourrait restreindre.
      // Décision : on filtre côté server au listing, mais on n'empêche pas ici.
    }

    const rows = await tx
      .select()
      .from(lignesDevis)
      .where(eq(lignesDevis.devisId, devisId))
      .orderBy(asc(lignesDevis.ordre), asc(lignesDevis.id));

    const lignes: LigneDevisPourSituation[] = [];
    let brutHt = 0;
    for (const l of rows) {
      if (l.type === 'section') continue;
      if (!l.quantite || !l.prixUnitaireHt) continue;
      const qty = Number(l.quantite);
      if (!Number.isFinite(qty) || qty <= 0) continue;
      // Le cache `montantHt` reflète le PU EFFECTIF (PU nu + apport ventilé
      // des postes internes) — c'est ce que le client paiera. La situation
      // doit en hériter pour que les % d'avancement portent sur le marché
      // all-in. On recalcule aussi le PU effectif (montant / qté) pour
      // garder la traçabilité.
      const montantEffectif = Number(l.montantHt ?? '0');
      if (!Number.isFinite(montantEffectif) || montantEffectif <= 0) continue;
      brutHt += montantEffectif;
      const puEffectif = montantEffectif / qty;
      lignes.push({
        designation: l.designation,
        articleId: l.articleId,
        quantite: l.quantite,
        unite: l.unite,
        prixUnitaireHt: puEffectif.toFixed(2),
        montantMarcheHt: montantEffectif.toFixed(2),
      });
    }

    // Reprend la remise globale du devis, normalisée en pourcentage du total
    // HT brut (somme des montants de ligne, avant remise globale).
    let remiseGlobale: RemiseReprise = null;
    if (d.remiseGlobaleType === 'pourcent' && d.remiseGlobaleValeur) {
      remiseGlobale = { type: 'pourcent', valeur: Number(d.remiseGlobaleValeur).toFixed(2) };
    } else if (d.remiseGlobaleType === 'montant' && d.remiseGlobaleValeur && brutHt > 0) {
      const montant = calculerMontantRemiseGlobale(brutHt, {
        type: 'montant',
        valeur: d.remiseGlobaleValeur,
      });
      const pct = (montant / brutHt) * 100;
      if (pct > 0) remiseGlobale = { type: 'pourcent', valeur: pct.toFixed(2) };
    }

    return { lignes, devisNumero: d.numero, remiseGlobale };
  });
}

// ─────────────────────────────────────────────────────────────
// Écriture
// ─────────────────────────────────────────────────────────────

export async function creerSituation(
  input: SituationTravauxInput,
): Promise<ActionResult<{ id: string; numero: number }>> {
  const ctx = await requireTenantContextWithMfa(ROLES_FACTURATION_WRITE);
  const parsed = situationTravauxSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: 'Données invalides.',
      fieldErrors: parsed.error.flatten().fieldErrors as Record<string, string[]>,
    };
  }

  try {
    const { id, numero } = await withTenant(ctx.entreprise.id, async (tx) => {
      // Situation précédente (active) : sert à numéroter et calculer le delta
      const [precedente] = await tx
        .select()
        .from(situationsTravaux)
        .where(
          and(
            eq(situationsTravaux.chantierId, parsed.data.chantierId),
            isNull(situationsTravaux.deletedAt),
            ne(situationsTravaux.statut, 'annulee'),
          ),
        )
        .orderBy(desc(situationsTravaux.numero))
        .limit(1);

      // Map ligne_precedente_id → montant_cumule_ht (calcul delta par poste)
      const cumulesPrecedents = new Map<string, string>();
      if (precedente) {
        const lignesPrec = await tx
          .select({
            id: lignesSituation.id,
            montantCumuleHt: lignesSituation.montantCumuleHt,
          })
          .from(lignesSituation)
          .where(eq(lignesSituation.situationId, precedente.id));
        for (const lp of lignesPrec) cumulesPrecedents.set(lp.id, lp.montantCumuleHt);
      }

      const nouveauNumero = (precedente?.numero ?? 0) + 1;

      // Calcule les montants figés ligne par ligne
      const lignesHydratees = parsed.data.lignes.map((l, idx) => {
        const precCumule =
          l.lignePrecedenteId && cumulesPrecedents.has(l.lignePrecedenteId)
            ? cumulesPrecedents.get(l.lignePrecedenteId)!
            : '0';
        const calc = calculerLigneSituation(l, precCumule);
        if (!calc) {
          throw new Error(
            `Ligne ${idx + 1} : montant marché impossible à déterminer (quantité + PU OU montant direct requis).`,
          );
        }
        if (Number(calc.montantAFacturerHt) < 0) {
          throw new Error(
            `Ligne ${idx + 1} : le % d'avancement (${l.pctAvancementCumule}) est inférieur à celui de la situation précédente.`,
          );
        }
        return { ligne: l, calc, ordre: idx };
      });

      // Cache agrégé sur situations_travaux
      const totaux = calculerTotauxSituation(lignesHydratees.map((h) => h.calc));

      const [inserted] = await tx
        .insert(situationsTravaux)
        .values({
          entrepriseId: ctx.entreprise.id,
          chantierId: parsed.data.chantierId,
          devisId: parsed.data.devisId,
          numero: nouveauNumero,
          dateSituation: parsed.data.dateSituation,
          pctAvancementCumule: totaux.pctAvancementCumule,
          montantMarcheHt: totaux.montantMarcheHt,
          montantCumuleHt: totaux.montantCumuleHt,
          montantSituationPrecedenteHt: totaux.montantSituationPrecedenteHt,
          montantAFacturerHt: totaux.montantAFacturerHt,
          tauxTva: parsed.data.tauxTva,
          remiseGlobaleType: parsed.data.remiseGlobaleType,
          remiseGlobaleValeur: parsed.data.remiseGlobaleValeur,
          notes: parsed.data.notes,
          createdBy: ctx.utilisateur.id,
          updatedBy: ctx.utilisateur.id,
        })
        .returning({ id: situationsTravaux.id, numero: situationsTravaux.numero });
      if (!inserted) throw new Error('INSERT situation failed');

      await tx.insert(lignesSituation).values(
        lignesHydratees.map((h) => ({
          entrepriseId: ctx.entreprise.id,
          situationId: inserted.id,
          ordre: h.ordre,
          lignePrecedenteId: h.ligne.lignePrecedenteId,
          designation: h.ligne.designation,
          articleId: h.ligne.articleId,
          quantite: h.ligne.quantite,
          unite: h.ligne.unite,
          prixUnitaireHt: h.ligne.prixUnitaireHt,
          montantMarcheHt: h.calc.montantMarcheHt,
          pctAvancementCumule: h.ligne.pctAvancementCumule,
          montantCumuleHt: h.calc.montantCumuleHt,
          montantSituationPrecedenteHt: h.calc.montantSituationPrecedenteHt,
          montantAFacturerHt: h.calc.montantAFacturerHt,
          notes: h.ligne.notes,
        })),
      );

      await auditLogIn(tx, {
        action: 'insert',
        tableName: 'situations_travaux',
        rowId: inserted.id,
        after: {
          numero: nouveauNumero,
          chantierId: parsed.data.chantierId,
          nbLignes: parsed.data.lignes.length,
          ...totaux,
        },
      });

      return { id: inserted.id, numero: nouveauNumero };
    });
    revalidatePath(`/${ctx.entreprise.slug}/facturation/situations`);
    revalidatePath(`/${ctx.entreprise.slug}/chantiers/${parsed.data.chantierId}`);
    return { ok: true, data: { id, numero } };
  } catch (err) {
    if (err instanceof Error) return { ok: false, error: err.message };
    throw err;
  }
}

export async function validerSituation(id: string): Promise<ActionResult> {
  const ctx = await requireTenantContextWithMfa(ROLES_FACTURATION_WRITE);
  try {
    await withTenant(ctx.entreprise.id, async (tx) => {
      const [before] = await tx
        .select()
        .from(situationsTravaux)
        .where(and(eq(situationsTravaux.id, id), isNull(situationsTravaux.deletedAt)));
      if (!before) throw new Error('NOT_FOUND');
      if (before.statut !== 'brouillon') throw new Error('NON_VALIDABLE');

      await tx
        .update(situationsTravaux)
        .set({ statut: 'validee', updatedBy: ctx.utilisateur.id })
        .where(eq(situationsTravaux.id, id));

      await auditLogIn(tx, {
        action: 'update',
        tableName: 'situations_travaux',
        rowId: id,
        before: { statut: before.statut },
        after: { statut: 'validee' },
      });
    });
    revalidatePath(`/${ctx.entreprise.slug}/facturation/situations`);
    revalidatePath(`/${ctx.entreprise.slug}/facturation/situations/${id}`);
    return { ok: true, data: undefined };
  } catch (err) {
    if (err instanceof Error && err.message === 'NOT_FOUND') {
      return { ok: false, error: 'Situation introuvable.' };
    }
    if (err instanceof Error && err.message === 'NON_VALIDABLE') {
      return { ok: false, error: 'Seules les situations en brouillon peuvent être validées.' };
    }
    throw err;
  }
}

/**
 * Génère une facture brouillon à partir d'une situation. Chaque ligne de la
 * situation (avec delta > 0) devient une ligne de facture (type 'libre' ou
 * 'article_catalogue' si la ligne est rattachée à un article).
 */
export async function genererFactureDepuisSituation(
  id: string,
): Promise<ActionResult<{ factureId: string; factureNumero: string }>> {
  const ctx = await requireTenantContextWithMfa(ROLES_FACTURATION_WRITE);
  try {
    const result = await withTenant(ctx.entreprise.id, async (tx) => {
      const [situation] = await tx
        .select()
        .from(situationsTravaux)
        .where(and(eq(situationsTravaux.id, id), isNull(situationsTravaux.deletedAt)));
      if (!situation) throw new Error('NOT_FOUND');
      if (situation.statut === 'annulee') throw new Error('STATUT_INVALIDE');
      if (situation.factureId) throw new Error('DEJA_FACTUREE');

      const [chantier] = await tx
        .select({
          id: chantiers.id,
          numero: chantiers.numero,
          libelle: chantiers.libelle,
          clientId: chantiers.clientId,
        })
        .from(chantiers)
        .where(eq(chantiers.id, situation.chantierId))
        .limit(1);
      if (!chantier) throw new Error('CHANTIER_INTROUVABLE');

      const lignesSit = await tx
        .select()
        .from(lignesSituation)
        .where(eq(lignesSituation.situationId, id))
        .orderBy(asc(lignesSituation.ordre), asc(lignesSituation.id));

      if (lignesSit.length === 0) throw new Error('AUCUNE_LIGNE');

      const lignesAFacturer = lignesSit.filter((l) => Number(l.montantAFacturerHt) > 0);
      if (lignesAFacturer.length === 0) throw new Error('DELTA_ZERO');

      const factureNumero = await generateNumero(tx, 'facture', ctx.entreprise.id);

      const tauxTva = Number(situation.tauxTva);
      const totalHt = lignesAFacturer.reduce(
        (acc, l) => acc + Number(l.montantAFacturerHt),
        0,
      );
      const totalTva = (totalHt * tauxTva) / 100;
      const totalTtc = totalHt + totalTva;

      // Reporte la remise globale de la situation sur la facture : les lignes
      // restent brutes (montant à facturer) et les totaux sont ventilés nets,
      // exactement comme une facture saisie manuellement (cf. creerFacture).
      const totaux = appliquerRemiseGlobale(
        {
          totalHt: totalHt.toFixed(2),
          totalTva: totalTva.toFixed(2),
          totalTtc: totalTtc.toFixed(2),
          detailsTva: {
            [situation.tauxTva]: {
              base: totalHt.toFixed(2),
              tva: totalTva.toFixed(2),
            },
          },
        },
        {
          type: situation.remiseGlobaleType as RemiseGlobaleType | null,
          valeur: situation.remiseGlobaleValeur,
        },
      );

      const objet = `Situation n°${situation.numero} — ${chantier.libelle} — Avancement cumulé ${Number(situation.pctAvancementCumule).toFixed(2)} %`;

      const [insertedFacture] = await tx
        .insert(factures)
        .values({
          entrepriseId: ctx.entreprise.id,
          numero: factureNumero,
          clientId: chantier.clientId,
          chantierId: chantier.id,
          dateFacture: new Date().toISOString().slice(0, 10),
          objet,
          totalHt: totaux.totalHt,
          totalTva: totaux.totalTva,
          totalTtc: totaux.totalTtc,
          detailsTva: totaux.detailsTva,
          remiseGlobaleType: situation.remiseGlobaleType,
          remiseGlobaleValeur: situation.remiseGlobaleValeur,
          createdBy: ctx.utilisateur.id,
          updatedBy: ctx.utilisateur.id,
        })
        .returning({ id: factures.id });
      if (!insertedFacture) throw new Error('INSERT facture failed');

      await tx.insert(lignesFacture).values(
        lignesAFacturer.map((l, idx) => {
          const ht = Number(l.montantAFacturerHt);
          const tva = (ht * tauxTva) / 100;
          const ttc = ht + tva;
          const pct = Number(l.pctAvancementCumule).toFixed(2);
          return {
            entrepriseId: ctx.entreprise.id,
            factureId: insertedFacture.id,
            ordre: idx,
            type: (l.articleId ? 'article_catalogue' : 'libre') as
              | 'article_catalogue'
              | 'libre',
            designation: `${l.designation} (avancement cumulé ${pct} %)`,
            articleId: l.articleId,
            quantite: '1',
            unite: 'forfait',
            prixUnitaireHt: l.montantAFacturerHt,
            tauxTva: situation.tauxTva,
            remisePourcent: '0',
            montantHt: l.montantAFacturerHt,
            montantTva: tva.toFixed(2),
            montantTtc: ttc.toFixed(2),
            notes: null,
          };
        }),
      );

      await tx
        .update(situationsTravaux)
        .set({ factureId: insertedFacture.id, updatedBy: ctx.utilisateur.id })
        .where(eq(situationsTravaux.id, id));

      await auditLogIn(tx, {
        action: 'insert',
        tableName: 'factures',
        rowId: insertedFacture.id,
        after: {
          numero: factureNumero,
          source: 'situation',
          situationId: id,
          situationNumero: situation.numero,
          nbLignes: lignesAFacturer.length,
        },
      });

      return { factureId: insertedFacture.id, factureNumero };
    });
    revalidatePath(`/${ctx.entreprise.slug}/facturation/situations`);
    revalidatePath(`/${ctx.entreprise.slug}/facturation/factures`);
    revalidatePath(`/${ctx.entreprise.slug}/facturation/situations/${id}`);
    return { ok: true, data: result };
  } catch (err) {
    if (err instanceof Error && err.message === 'NOT_FOUND') {
      return { ok: false, error: 'Situation introuvable.' };
    }
    if (err instanceof Error && err.message === 'STATUT_INVALIDE') {
      return { ok: false, error: 'Situation annulée : génération de facture impossible.' };
    }
    if (err instanceof Error && err.message === 'DEJA_FACTUREE') {
      return { ok: false, error: 'Cette situation a déjà une facture liée.' };
    }
    if (err instanceof Error && err.message === 'AUCUNE_LIGNE') {
      return { ok: false, error: 'Aucune ligne dans la situation.' };
    }
    if (err instanceof Error && err.message === 'DELTA_ZERO') {
      return {
        ok: false,
        error:
          'Aucune ligne avec un delta à facturer (toutes les lignes ont déjà été facturées dans une situation précédente).',
      };
    }
    throw err;
  }
}

export async function annulerSituation(id: string): Promise<ActionResult> {
  const ctx = await requireTenantContextWithMfa(ROLES_FACTURATION_WRITE);
  try {
    await withTenant(ctx.entreprise.id, async (tx) => {
      const [before] = await tx
        .select()
        .from(situationsTravaux)
        .where(and(eq(situationsTravaux.id, id), isNull(situationsTravaux.deletedAt)));
      if (!before) return;
      if (before.statut === 'facturee') throw new Error('DEJA_FACTUREE');
      await tx
        .update(situationsTravaux)
        .set({ statut: 'annulee', updatedBy: ctx.utilisateur.id })
        .where(eq(situationsTravaux.id, id));
      await auditLogIn(tx, {
        action: 'update',
        tableName: 'situations_travaux',
        rowId: id,
        before: { statut: before.statut },
        after: { statut: 'annulee' },
      });
    });
    revalidatePath(`/${ctx.entreprise.slug}/facturation/situations`);
    return { ok: true, data: undefined };
  } catch (err) {
    if (err instanceof Error && err.message === 'DEJA_FACTUREE') {
      return {
        ok: false,
        error:
          'Situation déjà facturée : annulation impossible. Annulez d’abord la facture associée.',
      };
    }
    throw err;
  }
}

export type ChantierAvecAvancement = {
  id: string;
  numero: string;
  libelle: string;
  clientNom: string;
  montantPrevisionnelHt: string | null;
  dernierPctCumule: string;
  dernierMontantCumuleHt: string;
  prochainNumero: number;
};

export async function listerChantiersFacturables(): Promise<ChantierAvecAvancement[]> {
  const ctx = await requireTenantContextWithMfa();
  const rows = await withTenant(ctx.entreprise.id, (tx) =>
    tx.execute<{
      id: string;
      numero: string;
      libelle: string;
      client_type: string | null;
      client_raison_sociale: string | null;
      client_nom: string | null;
      client_prenom: string | null;
      montant_previsionnel_ht: string | null;
      dernier_pct: string | null;
      dernier_cumule: string | null;
      dernier_numero: number | null;
    }>(sql`
      SELECT
        c.id, c.numero, c.libelle, c.montant_previsionnel_ht,
        cl.type AS client_type,
        cl.raison_sociale AS client_raison_sociale,
        cl.nom AS client_nom,
        cl.prenom AS client_prenom,
        derniere.pct_avancement_cumule AS dernier_pct,
        derniere.montant_cumule_ht AS dernier_cumule,
        derniere.numero AS dernier_numero
      FROM chantiers c
      LEFT JOIN clients cl ON cl.id = c.client_id
      LEFT JOIN LATERAL (
        SELECT s.pct_avancement_cumule, s.montant_cumule_ht, s.numero
          FROM situations_travaux s
         WHERE s.chantier_id = c.id
           AND s.deleted_at IS NULL
           AND s.statut <> 'annulee'
         ORDER BY s.numero DESC
         LIMIT 1
      ) derniere ON TRUE
      WHERE c.deleted_at IS NULL
        AND c.statut IN ('en_cours','suspendu','termine')
      ORDER BY c.numero DESC
    `),
  );

  return rows.map((r) => ({
    id: r.id,
    numero: r.numero,
    libelle: r.libelle,
    clientNom: libelleClient({
      type: r.client_type ?? '',
      raisonSociale: r.client_raison_sociale,
      nom: r.client_nom,
      prenom: r.client_prenom,
    }),
    montantPrevisionnelHt: r.montant_previsionnel_ht,
    dernierPctCumule: r.dernier_pct ?? '0',
    dernierMontantCumuleHt: r.dernier_cumule ?? '0',
    prochainNumero: (r.dernier_numero ?? 0) + 1,
  }));
}
