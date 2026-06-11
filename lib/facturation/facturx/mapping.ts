/**
 * Mapping métier → objet de données Factur-X EN 16931 (profil node-zugferd).
 *
 * Fonctions PURES (aucun import de node-zugferd, aucune I/O) → testables au
 * Vitest. `render.ts` passe l'objet produit à `invoicer.create(...)`.
 *
 * Décisions de modélisation (cf. plan Factur-X) :
 *  - Lignes « section » : exclues du XML (ce sont des titres, pas des lignes
 *    facturables) ; elles restent dans le PDF visuel.
 *  - Auto-liquidation BTP → catégorie de TVA « AE » (reverse charge), taux 0,
 *    motif d'exonération « Autoliquidation » (art. 283-2 nonies CGI).
 *  - Remise globale → allègement au niveau document (BG-20), ventilé par taux
 *    de TVA pour que `lineTotal − allowance = taxBasis` par tranche.
 *  - Retenue de garantie : ne RÉDUIT PAS la base TVA ni le « montant dû »
 *    (règle BR-CO-16 : duePayable = grandTotal − prepaid). Elle est portée en
 *    texte dans les conditions de paiement + affichée sur le PDF. Limite assumée
 *    pour cette itération (modélisation EN 16931 débattue).
 */

import type { FacturXModel } from './types';

/** Objet de données attendu par node-zugferd (profil EN16931). Typé souplement
 *  car la lib infère une structure massive ; `render.ts` caste à l'appel. */
export type FacturXDocument = Record<string, unknown>;

const round2 = (n: number): number => Math.round((n + Number.EPSILON) * 100) / 100;

/** Code pays ISO 3166-1 alpha-2 depuis un libellé libre (mono-FR en pratique). */
export function paysToCode(pays: string | null | undefined): string {
  const p = (pays ?? '').trim();
  if (/^[A-Z]{2}$/.test(p)) return p;
  const map: Record<string, string> = {
    france: 'FR',
    belgique: 'BE',
    belgium: 'BE',
    luxembourg: 'LU',
    suisse: 'CH',
    allemagne: 'DE',
    espagne: 'ES',
    italie: 'IT',
  };
  return map[p.toLowerCase()] ?? 'FR';
}

/**
 * Unité catalogue (texte libre) → code UN/ECE Rec 20 attendu par EN 16931.
 * Repli sur « C62 » (unité/pièce) pour tout libellé inconnu.
 */
export function uniteToCode(unite: string | null | undefined): string {
  const u = (unite ?? '').trim().toLowerCase().replace(/\.$/, '');
  const map: Record<string, string> = {
    u: 'C62',
    'u.': 'C62',
    unite: 'C62',
    unité: 'C62',
    pce: 'C62',
    pièce: 'C62',
    piece: 'C62',
    ens: 'C62',
    ensemble: 'C62',
    forfait: 'C62',
    ft: 'C62',
    f: 'C62',
    ml: 'MTR',
    m: 'MTR',
    mètre: 'MTR',
    metre: 'MTR',
    m2: 'MTK',
    'm²': 'MTK',
    m3: 'MTQ',
    'm³': 'MTQ',
    kg: 'KGM',
    t: 'TNE',
    tonne: 'TNE',
    h: 'HUR',
    heure: 'HUR',
    hr: 'HUR',
    j: 'DAY',
    jour: 'DAY',
    l: 'LTR',
    litre: 'LTR',
  };
  return map[u] ?? 'C62';
}

/** Catégorie de TVA EN 16931 (BT-151/BT-118). */
export function categorieTva(tauxTva: number, autoLiquidation: boolean): string {
  if (autoLiquidation) return 'AE'; // VAT Reverse Charge
  if (tauxTva > 0) return 'S'; // Standard rate
  return 'Z'; // Zero rated goods
}

/**
 * Liste les champs obligatoires manquants pour produire un Factur-X conforme.
 * Renvoie des libellés lisibles ; vide ⇒ prêt à générer.
 */
export function champsManquantsFacturX(input: FacturXModel): string[] {
  const manquants: string[] = [];
  const e = input.emetteur;
  if (!e.raisonSociale?.trim()) manquants.push('Émetteur : raison sociale');
  if (!e.siret?.trim()) manquants.push('Émetteur : SIRET');
  if (!e.tvaIntracom?.trim()) manquants.push('Émetteur : n° TVA intracommunautaire');
  if (!e.adresseLigne1?.trim()) manquants.push('Émetteur : adresse');
  if (!e.codePostal?.trim()) manquants.push('Émetteur : code postal');
  if (!e.ville?.trim()) manquants.push('Émetteur : ville');
  if (!e.iban?.trim()) manquants.push('Émetteur : IBAN');

  const a = input.acheteur;
  if (!a.nom?.trim()) manquants.push('Client : nom / raison sociale');
  if (!a.adresseLigne1?.trim()) manquants.push('Client : adresse');
  if (!a.codePostal?.trim()) manquants.push('Client : code postal');
  if (!a.ville?.trim()) manquants.push('Client : ville');
  if (input.autoLiquidation && a.type === 'professionnel' && !a.tvaIntra?.trim()) {
    manquants.push('Client : n° TVA (obligatoire en auto-liquidation)');
  }

  if (input.lignes.filter((l) => !l.estSection).length === 0) {
    manquants.push('Au moins une ligne facturable');
  }
  return manquants;
}

function adressePostale(a: {
  adresseLigne1: string | null;
  adresseLigne2: string | null;
  codePostal: string | null;
  ville: string | null;
  pays: string;
}): Record<string, unknown> {
  const addr: Record<string, unknown> = { countryCode: paysToCode(a.pays) };
  if (a.adresseLigne1) addr.line1 = a.adresseLigne1;
  if (a.adresseLigne2) addr.line2 = a.adresseLigne2;
  if (a.codePostal) addr.postCode = a.codePostal;
  if (a.ville) addr.city = a.ville;
  return addr;
}

/**
 * Construit l'objet de données Factur-X (profil EN 16931) depuis les données
 * métier. Suppose `champsManquantsFacturX(input)` vide (appelé en amont).
 */
export function construireDocumentFacturX(input: FacturXModel): FacturXDocument {
  const devise = input.devise || 'EUR';
  const { autoLiquidation } = input;

  // Sections (titres) exclues du XML : seules les lignes facturables y figurent.
  const facturable = input.lignes.filter((l) => !l.estSection);

  // ── Lignes ────────────────────────────────────────────────────
  const line = facturable.map((l, i) => {
    const tauxTva = l.tauxTva ?? 0;
    return {
      identifier: String(i + 1),
      tradeProduct: {
        name: l.designation,
        ...(l.articleCode ? { sellerAssignedID: l.articleCode } : {}),
      },
      tradeAgreement: {
        netTradePrice: { chargeAmount: round2(l.prixUnitaireHt ?? 0) },
      },
      tradeDelivery: {
        billedQuantity: {
          amount: l.quantite ?? 0,
          unitMeasureCode: uniteToCode(l.unite),
        },
        unitMeasureCode: uniteToCode(l.unite),
      },
      tradeSettlement: {
        tradeTax: {
          typeCode: 'VAT',
          categoryCode: categorieTva(tauxTva, autoLiquidation),
          rateApplicablePercent: autoLiquidation ? 0 : round2(tauxTva),
        },
        monetarySummation: { lineTotalAmount: round2(l.montantHt ?? 0) },
      },
    };
  });

  // ── Ventilation TVA (BG-23) ───────────────────────────────────
  const vatBreakdown = input.tva.map((t) => {
    const cat = categorieTva(t.taux, autoLiquidation);
    return {
      calculatedAmount: autoLiquidation ? 0 : round2(t.montant),
      typeCode: 'VAT',
      basisAmount: round2(t.base),
      categoryCode: cat,
      rateApplicablePercent: autoLiquidation ? 0 : round2(t.taux),
      ...(cat === 'AE'
        ? { exemptionReasonText: 'Autoliquidation (art. 283-2 nonies du CGI)' }
        : {}),
    };
  });

  // ── Remise globale → allègements document (BG-20), ventilés ───
  // Base brute par taux = Σ montant HT des lignes du taux ; la remise par taux
  // est la différence avec la base nette (input.tva = net). Garantit
  // lineTotal − allowance = taxBasis tranche par tranche.
  const grossByRate = new Map<number, number>();
  for (const l of facturable) {
    const taux = l.tauxTva ?? 0;
    grossByRate.set(taux, (grossByRate.get(taux) ?? 0) + (l.montantHt ?? 0));
  }
  const lineTotalAmount = round2(facturable.reduce((s, l) => s + (l.montantHt ?? 0), 0));

  const allowances: Array<Record<string, unknown>> = [];
  if (input.remiseGlobaleMontant > 0) {
    for (const t of input.tva) {
      const gross = grossByRate.get(t.taux) ?? t.base;
      const remiseRate = round2(gross - t.base);
      if (remiseRate <= 0) continue;
      allowances.push({
        chargeIndicator: false,
        actualAmount: remiseRate,
        reason: 'Remise globale',
        categoryTradeTax: {
          categoryCode: categorieTva(t.taux, autoLiquidation),
          vatRate: autoLiquidation ? 0 : round2(t.taux),
        },
      });
    }
  }
  const allowanceTotalAmount = round2(
    allowances.reduce((s, a) => s + (a.actualAmount as number), 0),
  );

  // ── Conditions de paiement (+ note retenue de garantie) ───────
  const termesParts: string[] = [];
  if (input.conditionsPaiement) termesParts.push(input.conditionsPaiement);
  if (input.retenueGarantieMontant > 0) {
    const netAPayer = round2(input.totalTtc - input.retenueGarantieMontant);
    termesParts.push(
      `Retenue de garantie : ${input.retenueGarantieMontant.toFixed(2)} ${devise} ` +
        `retenue jusqu'à réception. Net à payer à ce jour : ${netAPayer.toFixed(2)} ${devise}.`,
    );
  }
  const paymentTerms: Record<string, unknown> = {};
  if (termesParts.length > 0) paymentTerms.description = termesParts.join(' — ');
  if (input.dateEcheance) paymentTerms.dueDate = new Date(input.dateEcheance);

  // ── Moyen de paiement (virement) ──────────────────────────────
  const paymentInstruction: Record<string, unknown> | null = input.emetteur.iban
    ? {
        typeCode: '30', // Credit transfer
        transfers: [{ paymentAccountIdentifier: input.emetteur.iban }],
        ...(input.emetteur.bic
          ? { sellerBankInformation: { serviceProviderIdentifier: input.emetteur.bic } }
          : {}),
      }
    : null;

  // ── Notes (mentions + auto-liquidation) ───────────────────────
  const includedNote: Array<Record<string, unknown>> = [];
  if (autoLiquidation) {
    includedNote.push({
      content: 'Autoliquidation de la TVA par le preneur — art. 283-2 nonies du CGI.',
    });
  }
  if (input.mentionsLegales) includedNote.push({ content: input.mentionsLegales });

  // ── Émetteur ──────────────────────────────────────────────────
  const seller: Record<string, unknown> = {
    name: input.emetteur.raisonSociale,
    postalAddress: adressePostale(input.emetteur),
  };
  if (input.emetteur.siret) {
    seller.organization = {
      registrationIdentifier: {
        value: input.emetteur.siret,
        schemeIdentifier: '0009', // SIRET (ISO 6523)
      },
    };
  }
  if (input.emetteur.tvaIntracom) {
    seller.taxRegistration = { vatIdentifier: input.emetteur.tvaIntracom };
  }

  // ── Acheteur ──────────────────────────────────────────────────
  const buyer: Record<string, unknown> = {
    name: input.acheteur.nom,
    postalAddress: adressePostale(input.acheteur),
  };
  if (input.acheteur.type === 'professionnel' && input.acheteur.tvaIntra) {
    buyer.taxRegistration = { vatIdentifier: input.acheteur.tvaIntra };
  }
  if (input.acheteur.type === 'professionnel' && input.acheteur.siret) {
    buyer.organization = {
      registrationIdentifier: { value: input.acheteur.siret, schemeIdentifier: '0009' },
    };
  }

  const monetarySummation: Record<string, unknown> = {
    lineTotalAmount,
    taxBasisTotalAmount: round2(input.totalHt),
    taxTotal: { amount: round2(input.totalTva), currencyCode: devise },
    grandTotalAmount: round2(input.totalTtc),
    duePayableAmount: round2(input.totalTtc),
  };
  if (allowanceTotalAmount > 0) monetarySummation.allowanceTotalAmount = allowanceTotalAmount;

  const tradeSettlement: Record<string, unknown> = {
    currencyCode: devise,
    vatBreakdown,
    monetarySummation,
  };
  if (paymentInstruction) tradeSettlement.paymentInstruction = paymentInstruction;
  if (allowances.length > 0) tradeSettlement.allowances = allowances;
  if (Object.keys(paymentTerms).length > 0) tradeSettlement.paymentTerms = paymentTerms;

  return {
    number: input.numero,
    typeCode: '380', // Commercial invoice
    issueDate: new Date(input.dateFacture),
    ...(includedNote.length > 0 ? { includedNote } : {}),
    transaction: {
      line,
      tradeAgreement: { seller, buyer },
      tradeSettlement,
    },
  };
}
