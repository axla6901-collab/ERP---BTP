'use server';

import { createHash } from 'node:crypto';

import { and, desc, eq, isNull } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';

import { auditLogIn } from '@/lib/audit/log';
import { requireTenantContextWithMfa } from '@/lib/auth/tenant-guards';
import { withTenant } from '@/lib/db/with-tenant';
import { champsManquantsFacturX } from '@/lib/facturation/facturx/mapping';
import { genererFacturX as rendreFacturX } from '@/lib/facturation/facturx/render';
import type { FacturXModel } from '@/lib/facturation/facturx/types';
import { ROLES_FACTURATION_WRITE } from '@/lib/facturation/permissions';
import { deleteObject, getDownloadUrl, putObject } from '@/lib/storage/s3';
import { clients } from '@/db/schema/commercial';
import { entreprises } from '@/db/schema/entreprises';
import { factureDocuments, factures, lignesFacture } from '@/db/schema/facturation';

type ActionResult<T = void> =
  | { ok: true; data: T }
  | { ok: false; error: string };

const round2 = (n: number): number => Math.round((n + Number.EPSILON) * 100) / 100;
const num = (v: string | number | null | undefined): number => {
  const n = typeof v === 'number' ? v : Number(v ?? 0);
  return Number.isFinite(n) ? n : 0;
};

type DetailsTva = Record<string, { base: string; tva: string }> | null;

/**
 * Assemble le modèle Factur-X à partir des lignes DB (facture + lignes + client
 * + entreprise émettrice). Fonction pure (hors I/O).
 */
function construireModele(
  facture: typeof factures.$inferSelect,
  lignes: (typeof lignesFacture.$inferSelect)[],
  client: typeof clients.$inferSelect,
  emetteur: typeof entreprises.$inferSelect,
): FacturXModel {
  const lignesModele = lignes.map((l) => ({
    estSection: l.type === 'section',
    designation: l.designation,
    articleCode: null,
    quantite: l.quantite != null ? num(l.quantite) : null,
    unite: l.unite,
    prixUnitaireHt: l.prixUnitaireHt != null ? num(l.prixUnitaireHt) : null,
    montantHt: l.montantHt != null ? num(l.montantHt) : null,
    tauxTva: l.tauxTva != null ? num(l.tauxTva) : null,
  }));

  const totalHt = num(facture.totalHt);
  const grossHt = round2(
    lignesModele
      .filter((l) => !l.estSection)
      .reduce((s, l) => s + (l.montantHt ?? 0), 0),
  );
  const remiseGlobaleMontant =
    facture.remiseGlobaleType && grossHt > totalHt ? round2(grossHt - totalHt) : 0;

  // TVA : ventilation stockée (nette) ; repli par regroupement des lignes.
  const details = facture.detailsTva as DetailsTva;
  let tva: FacturXModel['tva'];
  if (details && Object.keys(details).length > 0) {
    tva = Object.entries(details)
      .map(([taux, d]) => ({ taux: num(taux), base: num(d.base), montant: num(d.tva) }))
      .sort((a, b) => b.taux - a.taux);
  } else {
    const parTaux = new Map<number, number>();
    for (const l of lignesModele) {
      if (l.estSection) continue;
      const t = l.tauxTva ?? 0;
      parTaux.set(t, (parTaux.get(t) ?? 0) + (l.montantHt ?? 0));
    }
    tva = [...parTaux.entries()]
      .map(([taux, base]) => ({
        taux,
        base: round2(base),
        montant: facture.autoLiquidation ? 0 : round2((base * taux) / 100),
      }))
      .sort((a, b) => b.taux - a.taux);
  }

  const nomClient =
    client.type === 'professionnel'
      ? (client.raisonSociale ?? '')
      : [client.prenom, client.nom].filter(Boolean).join(' ');

  return {
    numero: facture.numero,
    dateFacture: String(facture.dateFacture),
    dateEcheance: facture.dateEcheance ? String(facture.dateEcheance) : null,
    devise: 'EUR',
    autoLiquidation: facture.autoLiquidation,
    objet: facture.objet,
    conditionsPaiement: facture.conditionsPaiement,
    mentionsLegales: facture.mentionsLegales,
    totalHt,
    totalTva: num(facture.totalTva),
    totalTtc: num(facture.totalTtc),
    remiseGlobaleMontant,
    retenueGarantieMontant: facture.montantRetenue ? num(facture.montantRetenue) : 0,
    lignes: lignesModele,
    tva,
    emetteur: {
      raisonSociale: emetteur.raisonSociale,
      siret: emetteur.siret,
      tvaIntracom: emetteur.tvaIntracom,
      adresseLigne1: emetteur.adresseLigne1,
      adresseLigne2: emetteur.adresseLigne2,
      codePostal: emetteur.codePostal,
      ville: emetteur.ville,
      pays: emetteur.pays,
      iban: emetteur.iban,
      bic: emetteur.bic,
      rcs: emetteur.rcs,
      formeJuridique: emetteur.formeJuridique,
      capitalSocial: emetteur.capitalSocial,
      codeApe: emetteur.codeApe,
    },
    acheteur: {
      type: client.type,
      nom: nomClient,
      siret: client.siret,
      tvaIntra: client.tvaIntra,
      adresseLigne1: client.adresseLigne1,
      adresseLigne2: client.adresseLigne2,
      codePostal: client.codePostal,
      ville: client.ville,
      pays: client.pays,
    },
  };
}

function cleObjet(factureId: string, numero: string): string {
  const safe = numero.replace(/[^A-Za-z0-9._-]/g, '-');
  return `factures/${factureId}/${safe}-facturx-${Date.now()}.pdf`;
}

/**
 * Génère (ou régénère) le Factur-X PDF/A-3 d'une facture, l'archive en MinIO et
 * enregistre une ligne `facture_documents`. Renvoie une URL de téléchargement.
 */
export async function genererFacturX(
  factureId: string,
): Promise<ActionResult<{ url: string }>> {
  const ctx = await requireTenantContextWithMfa(ROLES_FACTURATION_WRITE);

  // 1. Lecture (RLS posée par withTenant).
  const lu = await withTenant(ctx.entreprise.id, async (tx) => {
    const [facture] = await tx
      .select()
      .from(factures)
      .where(and(eq(factures.id, factureId), isNull(factures.deletedAt)))
      .limit(1);
    if (!facture) return null;

    const [client] = await tx
      .select()
      .from(clients)
      .where(eq(clients.id, facture.clientId))
      .limit(1);
    if (!client) return null;

    const [emetteur] = await tx
      .select()
      .from(entreprises)
      .where(eq(entreprises.id, ctx.entreprise.id))
      .limit(1);
    if (!emetteur) return null;

    const lignes = await tx
      .select()
      .from(lignesFacture)
      .where(eq(lignesFacture.factureId, factureId))
      .orderBy(lignesFacture.ordre);

    return { facture, client, emetteur, lignes };
  });

  if (!lu) return { ok: false, error: 'Facture introuvable.' };

  const model = construireModele(lu.facture, lu.lignes, lu.client, lu.emetteur);

  const manquants = champsManquantsFacturX(model);
  if (manquants.length > 0) {
    return {
      ok: false,
      error: `Données incomplètes pour un Factur-X conforme : ${manquants.join(' ; ')}.`,
    };
  }

  // 2. Génération (CPU, hors transaction).
  const { pdf, profil, xmlValide } = await rendreFacturX(model);
  const sha256 = createHash('sha256').update(pdf).digest('hex');
  const key = cleObjet(factureId, model.numero);

  // 3. Stockage S3 d'abord (compensation deleteObject si la DB échoue).
  await putObject(key, Buffer.from(pdf), 'application/pdf');

  try {
    await withTenant(ctx.entreprise.id, async (tx) => {
      // Le nouveau document remplace les précédents (soft-delete).
      await tx
        .update(factureDocuments)
        .set({ deletedAt: new Date() })
        .where(
          and(eq(factureDocuments.factureId, factureId), isNull(factureDocuments.deletedAt)),
        );

      const [inserted] = await tx
        .insert(factureDocuments)
        .values({
          entrepriseId: ctx.entreprise.id,
          factureId,
          profil,
          minioKey: key,
          mimeType: 'application/pdf',
          tailleBytes: pdf.length,
          sha256,
          xmlValide,
          createdBy: ctx.utilisateur.id,
        })
        .returning({ id: factureDocuments.id });
      if (!inserted) throw new Error('INSERT facture_documents silently failed');

      await auditLogIn(tx, {
        action: 'insert',
        tableName: 'facture_documents',
        rowId: inserted.id,
        after: { factureId, profil, minioKey: key, tailleBytes: pdf.length, sha256 },
      });
    });
  } catch (err) {
    try {
      await deleteObject(key);
    } catch {
      /* compensation best-effort */
    }
    throw err;
  }

  revalidatePath(`/${ctx.entreprise.slug}/facturation/factures/${factureId}`);
  revalidatePath(`/${ctx.entreprise.slug}/facturation/factures`);

  const url = await getDownloadUrl(key);
  return { ok: true, data: { url } };
}

/** Renvoie une URL de téléchargement du dernier Factur-X généré pour la facture. */
export async function urlTelechargementFacturX(
  factureId: string,
): Promise<ActionResult<{ url: string }>> {
  const ctx = await requireTenantContextWithMfa();

  const doc = await withTenant(ctx.entreprise.id, async (tx) => {
    const [row] = await tx
      .select({ minioKey: factureDocuments.minioKey })
      .from(factureDocuments)
      .where(
        and(eq(factureDocuments.factureId, factureId), isNull(factureDocuments.deletedAt)),
      )
      .orderBy(desc(factureDocuments.genereAt))
      .limit(1);
    return row ?? null;
  });

  if (!doc) return { ok: false, error: 'Aucun Factur-X généré pour cette facture.' };
  const url = await getDownloadUrl(doc.minioKey);
  return { ok: true, data: { url } };
}

/** Indique si un Factur-X a déjà été généré (pour l'état initial du bouton). */
export async function aFacturXGenere(factureId: string): Promise<boolean> {
  const ctx = await requireTenantContextWithMfa();
  return withTenant(ctx.entreprise.id, async (tx) => {
    const [row] = await tx
      .select({ id: factureDocuments.id })
      .from(factureDocuments)
      .where(
        and(eq(factureDocuments.factureId, factureId), isNull(factureDocuments.deletedAt)),
      )
      .limit(1);
    return Boolean(row);
  });
}
