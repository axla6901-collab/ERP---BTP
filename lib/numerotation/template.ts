/**
 * Parser et formatteur côté TypeScript pour les templates de numérotation.
 *
 * Sert à :
 *   - prévisualiser dans l'UI admin le prochain numéro qui sera émis,
 *   - valider le template à la saisie (mirror du CHECK Postgres),
 *   - calculer les cadences de reset autorisées pour un template donné
 *     (la cadence ne peut pas être plus fine que le token date le plus fin
 *     du template, sinon collision de numéro imprimé).
 *
 * **Source de vérité** : la fonction Postgres `generate_numero` et le CHECK
 * `chk_modeles_numerotation_cadence_coherente` dans
 * 0048_numerotation_cadence_explicite.sql. Toute modification du jeu de
 * tokens ou des règles de cohérence doit être répercutée des deux côtés.
 * Tests vitest dans tests/unit/numerotation/template.test.ts.
 */

export const TYPES_NUMERO_DOC = [
  'devis',
  'facture',
  'avoir',
  'commande',
  'contrat_st',
  'facture_st',
  'chantier',
] as const;

export type TypeNumeroDoc = (typeof TYPES_NUMERO_DOC)[number];

export const LIBELLES_TYPE_NUMERO: Record<TypeNumeroDoc, string> = {
  devis: 'Devis',
  facture: 'Facture',
  avoir: 'Avoir',
  commande: 'Commande client',
  contrat_st: 'Contrat sous-traitance',
  facture_st: 'Facture sous-traitance',
  chantier: 'Chantier',
};

export const TEMPLATES_PAR_DEFAUT: Record<TypeNumeroDoc, string> = {
  devis: 'D-[@Year]-%06d',
  facture: 'F-[@Year]-%06d',
  avoir: 'AV-[@Year]-%06d',
  commande: 'C-[@Year]-%06d',
  contrat_st: 'ST-[@Year]-%06d',
  facture_st: 'FST-[@Year]-%06d',
  chantier: 'CH-[@Year]-%06d',
};

/** Cadence de reset du compteur — miroir exact des valeurs autorisées en BD. */
export const CADENCES_RESET = ['jour', 'mois', 'annee', 'jamais'] as const;
export type CadenceReset = (typeof CADENCES_RESET)[number];

export const CADENCE_PAR_DEFAUT: CadenceReset = 'annee';

export const LIBELLES_CADENCE: Record<CadenceReset, string> = {
  jour: 'Le compteur repart à 1 chaque jour',
  mois: 'Le compteur repart à 1 chaque mois',
  annee: 'Le compteur repart à 1 chaque année',
  jamais: 'Le compteur ne se réinitialise jamais',
};

export const LIBELLES_CADENCE_COURT: Record<CadenceReset, string> = {
  jour: 'Quotidien',
  mois: 'Mensuel',
  annee: 'Annuel',
  jamais: 'Sans reset',
};

/** Format strict d'un compteur : %0?[1-9]d (largeur 1-9). */
export const REGEX_COMPTEUR = /%0?([1-9])d/;

export type TemplateParse =
  | {
      ok: true;
      compteurToken: string;
      compteurWidth: number;
      /** Cadence la plus fine autorisée par le template — utile comme défaut UI. */
      cadenceMaxAutorisee: CadenceReset;
    }
  | { ok: false; error: string };

/**
 * Valide la structure d'un template (compteur unique, non vide) et calcule la
 * cadence la plus fine autorisée par les tokens date présents.
 *
 * Règles (mirror du CHECK Postgres) :
 *   - exactement 1 occurrence d'un compteur `%0?[1-9]d`,
 *   - longueur non vide après trim.
 */
export function parseTemplate(template: string): TemplateParse {
  const trimmed = template.trim();
  if (trimmed.length === 0) {
    return { ok: false, error: 'Le template ne peut pas être vide.' };
  }

  const matches = trimmed.match(/%0?[1-9]d/g) ?? [];
  if (matches.length === 0) {
    return {
      ok: false,
      error: 'Le template doit contenir un compteur (ex. %03d pour 3 chiffres).',
    };
  }
  if (matches.length > 1) {
    return {
      ok: false,
      error: 'Le template ne doit contenir qu\'un seul compteur (%0Nd).',
    };
  }

  const compteurToken = matches[0]!;
  const widthMatch = compteurToken.match(REGEX_COMPTEUR)!;
  const compteurWidth = Number(widthMatch[1]);

  return {
    ok: true,
    compteurToken,
    compteurWidth,
    cadenceMaxAutorisee: cadenceMaxAutoriseePourTemplate(trimmed),
  };
}

/**
 * Cadence de reset la plus fine que le template peut supporter sans collision
 * de numéro imprimé : déterminée par le token date le plus fin présent.
 *
 *   [@Day]   → 'jour'   (toutes cadences valides)
 *   [@Month] → 'mois'   (mois, annee, jamais valides)
 *   [@Year]/[@Year2] → 'annee' (annee, jamais valides)
 *   aucun token date → 'jamais' (seule 'jamais' valide)
 */
export function cadenceMaxAutoriseePourTemplate(template: string): CadenceReset {
  if (template.includes('[@Day]')) return 'jour';
  if (template.includes('[@Month]')) return 'mois';
  if (template.includes('[@Year]') || template.includes('[@Year2]')) return 'annee';
  return 'jamais';
}

/** Ordre des cadences du plus fin au plus large. */
const ORDRE_CADENCE: Record<CadenceReset, number> = {
  jour: 0,
  mois: 1,
  annee: 2,
  jamais: 3,
};

/**
 * Renvoie `true` si la cadence demandée est cohérente avec le template :
 * elle doit être au moins aussi large que le token date le plus fin du
 * template. Sinon le numéro imprimé serait identique pour deux périodes
 * différentes (collision côté FEC).
 */
export function isCadenceAutorisee(template: string, cadence: CadenceReset): boolean {
  const max = cadenceMaxAutoriseePourTemplate(template);
  return ORDRE_CADENCE[cadence] >= ORDRE_CADENCE[max];
}

/** Liste des cadences valides pour un template — utile pour l'UI (select). */
export function cadencesAutorisees(template: string): CadenceReset[] {
  return CADENCES_RESET.filter((c) => isCadenceAutorisee(template, c));
}

/**
 * Validation explicite avec message d'erreur — utilisée par les server
 * actions et l'UI client. Le CHECK BD assure le même invariant en dernier
 * recours.
 */
export function validerCadence(
  template: string,
  cadence: CadenceReset,
): { ok: true } | { ok: false; error: string } {
  if (isCadenceAutorisee(template, cadence)) return { ok: true };
  const requis: Record<CadenceReset, string> = {
    jour: '[@Day]',
    mois: '[@Month] ou [@Day]',
    annee: '[@Year], [@Year2], [@Month] ou [@Day]',
    jamais: '',
  };
  return {
    ok: false,
    error: `Cadence ${LIBELLES_CADENCE_COURT[cadence].toLowerCase()} impossible : le template doit contenir ${requis[cadence]} pour éviter les collisions de numéro.`,
  };
}

/**
 * Applique les substitutions sur le template avec une date et une valeur de
 * compteur fournies. Utilisé uniquement pour la **prévisualisation UI** ; en
 * production c'est `generate_numero` côté Postgres qui produit le numéro
 * réellement attribué (sous transaction + séquence atomique).
 */
export function formatNumero(
  template: string,
  sequence: number,
  date: Date = new Date(),
): string {
  const parsed = parseTemplate(template);
  if (!parsed.ok) return template;

  const yyyy = String(date.getFullYear()).padStart(4, '0');
  const yy = yyyy.slice(-2);
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const dd = String(date.getDate()).padStart(2, '0');

  const compteurStr = String(sequence).padStart(parsed.compteurWidth, '0');

  return template
    .replace(/\[@Year\]/g, yyyy)
    .replace(/\[@Year2\]/g, yy)
    .replace(/\[@Month\]/g, mm)
    .replace(/\[@Day\]/g, dd)
    .replace(parsed.compteurToken, compteurStr);
}

/**
 * Tokens disponibles présentés dans l'UI admin (info-bulle / aide à la saisie).
 * Le compteur n'a pas d'exemple par défaut car son format est libre (%01d à %09d).
 */
export const TOKENS_AIDE: Array<{ token: string; description: string; exemple: string }> = [
  { token: '[@Year]', description: 'Année sur 4 chiffres', exemple: '2026' },
  { token: '[@Year2]', description: 'Année sur 2 chiffres', exemple: '26' },
  { token: '[@Month]', description: 'Mois sur 2 chiffres', exemple: '05' },
  { token: '[@Day]', description: 'Jour sur 2 chiffres', exemple: '26' },
  { token: '%03d', description: 'Compteur zero-padded — la largeur (1-9) contrôle le nombre de chiffres', exemple: '001' },
];
