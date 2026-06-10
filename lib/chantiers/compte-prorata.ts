/**
 * Moteur de calcul du **compte prorata** (BTP, norme NF P03-001).
 *
 * Calcul **pur** (sans DB, sans `Date.now()`) : étant donné les participants
 * (lots/intervenants avec leur montant de marché HT et une éventuelle surcharge
 * manuelle de quote-part) et les dépenses communes (chacune avancée par un
 * participant), produit :
 *   - la quote-part (%) de chaque participant,
 *   - la répartition d'un montant entre participants,
 *   - le bilan : montant dû, total avancé, **solde** créditeur/débiteur.
 *
 * Tous les calculs de répartition se font en **entiers** (centimes pour les
 * euros, centièmes de pourcent pour les %) avec la technique du **plus grand
 * reste** : on répartit le reliquat d'arrondi unité par unité aux plus grands
 * restes fractionnaires, ce qui garantit `Σ parts === total` exactement (cf.
 * la ventilation de [[appliquerRemiseGlobale]] dans `lib/remise-globale.ts`).
 *
 * Convention monétaire : EUR implicite, montants NUMERIC en chaîne en
 * entrée/sortie (`.toFixed(2)`).
 */

// ─────────────────────────────────────────────────────────────
// Types d'entrée
// ─────────────────────────────────────────────────────────────

export type ParticipantCalcul = {
  id: string;
  libelle: string;
  /** Montant de marché HT (NUMERIC en chaîne). Base du prorata. */
  montantMarcheHt: string;
  /** Surcharge manuelle de quote-part en % (prioritaire), ou null. */
  quotePartPctManuel: string | null;
  /** Pilote du compte : reçoit le crédit des frais de gestion. */
  estGestionnaire: boolean;
};

export type DepenseCalcul = {
  id: string;
  /** Participant qui a engagé/avancé la dépense. */
  avanceParParticipantId: string;
  montantHt: string;
};

// ─────────────────────────────────────────────────────────────
// Types de sortie
// ─────────────────────────────────────────────────────────────

export type QuotePart = {
  participantId: string;
  /** % final appliqué (somme garantie = "100.00", sauf absence de participant). */
  pourcent: string;
  /** true si issu d'une surcharge manuelle. */
  manuel: boolean;
};

export type RepartitionParticipant = {
  participantId: string;
  /** Part du montant réparti revenant à ce participant (arrondie au centime). */
  montantDu: string;
};

export type SoldeParticipant = {
  participantId: string;
  libelle: string;
  estGestionnaire: boolean;
  /** Quote-part appliquée (%). */
  pourcent: string;
  /** Charge théorique = quote-part × base répartie. */
  montantDu: string;
  /** Total des dépenses que ce participant a avancées. */
  totalAvance: string;
  /** Crédit de frais de gestion (gestionnaire uniquement, sinon "0.00"). */
  creditFraisGestion: string;
  /** (totalAvance + creditFraisGestion) − montantDu. >0 = créditeur, <0 = débiteur. */
  solde: string;
  sens: 'crediteur' | 'debiteur' | 'equilibre';
};

export type BilanCompteProrata = {
  totalDepensesHt: string;
  fraisGestionMontant: string;
  /** Base répartie = dépenses + frais de gestion. */
  baseRepartie: string;
  totalMarcheHt: string;
  quoteParts: QuotePart[];
  soldes: SoldeParticipant[];
  coherence: {
    /** Σ des quote-parts (≈ "100.00"). */
    sommePourcent: string;
    /** Σ des montants dus (= baseRepartie). */
    sommeMontantDu: string;
    /** Σ des soldes (≈ "0.00"). */
    sommeSolde: string;
    /** true si Σ soldes est nulle au centime près. */
    equilibre: boolean;
  };
};

// ─────────────────────────────────────────────────────────────
// Utilitaires internes (entiers)
// ─────────────────────────────────────────────────────────────

function toCents(n: string | number | null | undefined): number {
  const v = typeof n === 'number' ? n : Number(n ?? 0);
  if (!Number.isFinite(v)) return 0;
  return Math.round(v * 100);
}

function fromCents(c: number): string {
  return (c / 100).toFixed(2);
}

/**
 * Répartit un entier `target` entre des poids non négatifs avec la technique
 * du plus grand reste : `floor(poids/Σ × target)` puis distribution du reliquat
 * unité par unité aux plus grands restes fractionnaires (ties → ordre d'entrée).
 * Garantit `Σ résultat === target`. Si tous les poids sont nuls, répartit
 * `target` également (le reliquat allant aux premiers indices).
 */
function repartirEntiers(poids: number[], target: number): number[] {
  const n = poids.length;
  if (n === 0) return [];
  const surs = poids.map((p) => (Number.isFinite(p) && p > 0 ? p : 0));
  const total = surs.reduce((s, p) => s + p, 0);

  // Poids tous nuls → répartition égale.
  const base = total > 0 ? surs : new Array<number>(n).fill(1);
  const baseTotal = total > 0 ? total : n;

  const exacts = base.map((p) => (p / baseTotal) * target);
  const planchers = exacts.map((x) => Math.floor(x));
  let reste = target - planchers.reduce((s, x) => s + x, 0);

  const ordreParReste = exacts
    .map((x, i) => ({ i, frac: x - Math.floor(x) }))
    .sort((a, b) => b.frac - a.frac || a.i - b.i);

  const res = [...planchers];
  let k = 0;
  while (reste > 0 && k < ordreParReste.length) {
    res[ordreParReste[k]!.i]! += 1;
    reste -= 1;
    k += 1;
  }
  // Reste négatif (cas pathologique d'arrondi) : retire aux plus petits restes.
  let j = ordreParReste.length - 1;
  while (reste < 0 && j >= 0) {
    if (res[ordreParReste[j]!.i]! > 0) {
      res[ordreParReste[j]!.i]! -= 1;
      reste += 1;
    }
    j -= 1;
  }
  return res;
}

// ─────────────────────────────────────────────────────────────
// Quote-parts
// ─────────────────────────────────────────────────────────────

/**
 * Quote-parts (%) par participant, sommant à 100,00 % exactement.
 *
 * Règle : les participants ayant `quotePartPctManuel != null` gardent leur %
 * forcé ; le complément (100 − Σ manuels) est réparti entre les **autres**
 * participants au prorata de leur `montantMarcheHt`. Cas gérés :
 *   - Σ manuels ≥ 100 → les manuels sont remis à l'échelle 100, les auto à 0.
 *   - aucun participant auto et Σ manuels < 100 → les manuels sont renormalisés à 100.
 *   - participants auto sans marché → le complément est réparti à parts égales.
 */
export function calculerQuoteParts(participants: ParticipantCalcul[]): QuotePart[] {
  const n = participants.length;
  if (n === 0) return [];

  const TOTAL = 10_000; // centièmes de pourcent (= 100,00 %)
  const estManuel = participants.map((p) => p.quotePartPctManuel != null);
  const manuelH = participants.map((p) =>
    p.quotePartPctManuel != null
      ? Math.max(0, Math.min(10_000, Math.round(Number(p.quotePartPctManuel) * 100)))
      : 0,
  );
  const sumManuelH = manuelH.reduce((s, h, i) => s + (estManuel[i] ? h : 0), 0);
  const idxAuto = participants.map((_, i) => i).filter((i) => !estManuel[i]);

  const hundredths = new Array<number>(n).fill(0);

  if (idxAuto.length === 0) {
    // Tout le monde est manuel : renormaliser les manuels à 100,00 %.
    const poids = participants.map((_, i) => manuelH[i]!);
    const alloc = repartirEntiers(poids, TOTAL);
    for (let i = 0; i < n; i++) hundredths[i] = alloc[i]!;
  } else if (sumManuelH >= TOTAL) {
    // Manuels saturent : remis à l'échelle 100, auto = 0.
    const poids = participants.map((_, i) => (estManuel[i] ? manuelH[i]! : 0));
    const alloc = repartirEntiers(poids, TOTAL);
    for (let i = 0; i < n; i++) hundredths[i] = alloc[i]!;
  } else {
    // Manuels conservés ; le complément va aux auto au prorata du marché.
    for (let i = 0; i < n; i++) if (estManuel[i]) hundredths[i] = manuelH[i]!;
    const complement = TOTAL - sumManuelH;
    const poidsAuto = idxAuto.map((i) => toCents(participants[i]!.montantMarcheHt));
    const allocAuto = repartirEntiers(poidsAuto, complement);
    idxAuto.forEach((i, k) => {
      hundredths[i] = allocAuto[k]!;
    });
  }

  return participants.map((p, i) => ({
    participantId: p.id,
    pourcent: (hundredths[i]! / 100).toFixed(2),
    manuel: estManuel[i]!,
  }));
}

// ─────────────────────────────────────────────────────────────
// Répartition d'un montant
// ─────────────────────────────────────────────────────────────

/**
 * Répartit un montant (chaîne NUMERIC) entre participants selon leurs
 * quote-parts. Distribution du reliquat d'arrondi au centime près →
 * `Σ montantDu === montant` exactement.
 */
export function repartirMontant(
  montant: string,
  quoteParts: QuotePart[],
): RepartitionParticipant[] {
  const cents = toCents(montant);
  const poids = quoteParts.map((q) => Number(q.pourcent));
  const alloc = repartirEntiers(poids, cents);
  return quoteParts.map((q, i) => ({
    participantId: q.participantId,
    montantDu: fromCents(alloc[i]!),
  }));
}

// ─────────────────────────────────────────────────────────────
// Agrégats
// ─────────────────────────────────────────────────────────────

/** Total des dépenses communes (Σ montantHt). */
export function totalDepenses(depenses: DepenseCalcul[]): string {
  const cents = depenses.reduce((s, d) => s + toCents(d.montantHt), 0);
  return fromCents(cents);
}

/** Total des montants de marché des participants. */
export function totalMarche(participants: ParticipantCalcul[]): string {
  const cents = participants.reduce((s, p) => s + toCents(p.montantMarcheHt), 0);
  return fromCents(cents);
}

/** Frais de gestion = total dépenses × pct (ou "0.00" si pct null/0). */
export function calculerFraisGestion(
  totalDepensesHt: string,
  fraisGestionPct: string | null,
): string {
  if (fraisGestionPct == null || fraisGestionPct === '') return '0.00';
  const pct = Number(fraisGestionPct);
  if (!Number.isFinite(pct) || pct <= 0) return '0.00';
  const cents = Math.round(toCents(totalDepensesHt) * (pct / 100));
  return fromCents(cents);
}

// ─────────────────────────────────────────────────────────────
// Bilan / soldes
// ─────────────────────────────────────────────────────────────

/**
 * Bilan complet du compte prorata.
 *
 * Pour chaque participant : sa quote-part (%), son montant dû (part de la base
 * répartie = dépenses + frais de gestion), le total qu'il a avancé, et son
 * solde. Les frais de gestion sont **crédités au gestionnaire** (compensation
 * du pilote), de sorte que `Σ soldes === 0` au centime près.
 */
export function calculerBilan(
  participants: ParticipantCalcul[],
  depenses: DepenseCalcul[],
  fraisGestionPct: string | null,
): BilanCompteProrata {
  const totDep = totalDepenses(depenses);
  const frais = calculerFraisGestion(totDep, fraisGestionPct);
  const baseRepartieCents = toCents(totDep) + toCents(frais);
  const baseRepartie = fromCents(baseRepartieCents);
  const totMarche = totalMarche(participants);

  const quoteParts = calculerQuoteParts(participants);
  const repartition = repartirMontant(baseRepartie, quoteParts);
  const duParId = new Map(repartition.map((r) => [r.participantId, r.montantDu]));
  const pctParId = new Map(quoteParts.map((q) => [q.participantId, q.pourcent]));

  // Avances : Σ dépenses par participant.
  const avanceCentsParId = new Map<string, number>();
  for (const d of depenses) {
    avanceCentsParId.set(
      d.avanceParParticipantId,
      (avanceCentsParId.get(d.avanceParParticipantId) ?? 0) + toCents(d.montantHt),
    );
  }

  const fraisCents = toCents(frais);

  const soldes: SoldeParticipant[] = participants.map((p) => {
    const montantDu = duParId.get(p.id) ?? '0.00';
    const avanceCents = avanceCentsParId.get(p.id) ?? 0;
    const creditCents = p.estGestionnaire ? fraisCents : 0;
    const soldeCents = avanceCents + creditCents - toCents(montantDu);
    return {
      participantId: p.id,
      libelle: p.libelle,
      estGestionnaire: p.estGestionnaire,
      pourcent: pctParId.get(p.id) ?? '0.00',
      montantDu,
      totalAvance: fromCents(avanceCents),
      creditFraisGestion: fromCents(creditCents),
      solde: fromCents(soldeCents),
      sens: soldeCents > 0 ? 'crediteur' : soldeCents < 0 ? 'debiteur' : 'equilibre',
    };
  });

  const sommePourcentH = quoteParts.reduce((s, q) => s + Math.round(Number(q.pourcent) * 100), 0);
  const sommeMontantDuCents = soldes.reduce((s, x) => s + toCents(x.montantDu), 0);
  const sommeSoldeCents = soldes.reduce((s, x) => s + toCents(x.solde), 0);

  return {
    totalDepensesHt: totDep,
    fraisGestionMontant: frais,
    baseRepartie,
    totalMarcheHt: totMarche,
    quoteParts,
    soldes,
    coherence: {
      sommePourcent: (sommePourcentH / 100).toFixed(2),
      sommeMontantDu: fromCents(sommeMontantDuCents),
      sommeSolde: fromCents(sommeSoldeCents),
      equilibre: Math.abs(sommeSoldeCents) === 0,
    },
  };
}

/**
 * Synthèse d'arrêté de compte = bilan + métadonnées de clôture. Pur : la date
 * et le numéro sont fournis (pas de `Date.now()` interne).
 */
export function genererArrete(
  participants: ParticipantCalcul[],
  depenses: DepenseCalcul[],
  fraisGestionPct: string | null,
  meta: { numero: number; dateArrete: string },
): { numero: number; dateArrete: string } & BilanCompteProrata {
  return {
    numero: meta.numero,
    dateArrete: meta.dateArrete,
    ...calculerBilan(participants, depenses, fraisGestionPct),
  };
}
