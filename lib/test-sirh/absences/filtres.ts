/**
 * Lecture / écriture PURES des filtres d'URL des écrans Absences
 * (`?statut=…&employe=…&du=…&au=…`, `?mois=YYYY-MM`, `?periode=…&type=…`,
 * `?annee=…`). Les valeurs invalides retombent sur les valeurs par défaut.
 * Testé par tests/unit/lib/test-sirh/absences/filtres.test.ts.
 */

import { ajouterJours, estDateIso, periodeReference, type IsoDate } from '../calendrier';

export type ParametresUrl = Record<string, string | string[] | undefined>;

const REGEX_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Première valeur d'un paramètre de recherche (Next peut fournir un tableau). */
export function valeurParam(sp: ParametresUrl, cle: string): string | null {
  const v = sp[cle];
  const brut = Array.isArray(v) ? v[0] : v;
  return brut && brut.trim().length > 0 ? brut.trim() : null;
}

export function uuidParam(sp: ParametresUrl, cle: string): string | null {
  const v = valeurParam(sp, cle);
  return v && REGEX_UUID.test(v) ? v.toLowerCase() : null;
}

export function dateParam(sp: ParametresUrl, cle: string): IsoDate | null {
  const v = valeurParam(sp, cle);
  return estDateIso(v) ? v : null;
}

function construireHref(base: string, params: Record<string, string | null | undefined>): string {
  const q = new URLSearchParams();
  for (const [cle, valeur] of Object.entries(params)) if (valeur) q.set(cle, valeur);
  const chaine = q.toString();
  return chaine ? `${base}?${chaine}` : base;
}

// ─────────────────────────────────────────────────────────────
// Liste des demandes
// ─────────────────────────────────────────────────────────────

export const FILTRES_STATUT_DEMANDE = [
  'en_attente',
  'approuvee',
  'refusee',
  'annulee',
  'toutes',
] as const;
export type FiltreStatutDemande = (typeof FILTRES_STATUT_DEMANDE)[number];

export const LIBELLES_FILTRE_STATUT: Record<FiltreStatutDemande, string> = {
  en_attente: 'En attente',
  approuvee: 'Approuvées',
  refusee: 'Refusées',
  annulee: 'Annulées',
  toutes: 'Toutes',
};

export type FiltresDemandes = {
  statut: FiltreStatutDemande;
  employeId: string | null;
  du: IsoDate | null;
  au: IsoDate | null;
};

/** Filtres de la liste des demandes ; statut « en attente » par défaut. */
export function lireFiltresDemandes(sp: ParametresUrl): FiltresDemandes {
  const statut = valeurParam(sp, 'statut');
  return {
    statut: (FILTRES_STATUT_DEMANDE as readonly string[]).includes(statut ?? '')
      ? (statut as FiltreStatutDemande)
      : 'en_attente',
    employeId: uuidParam(sp, 'employe'),
    du: dateParam(sp, 'du'),
    au: dateParam(sp, 'au'),
  };
}

/** URL de la liste filtrée (le statut par défaut n'apparaît pas dans l'URL). */
export function hrefDemandes(base: string, f: FiltresDemandes): string {
  return construireHref(base, {
    statut: f.statut === 'en_attente' ? null : f.statut,
    employe: f.employeId,
    du: f.du,
    au: f.au,
  });
}

// ─────────────────────────────────────────────────────────────
// Calendrier d'équipe
// ─────────────────────────────────────────────────────────────

export type FiltresCalendrier = {
  annee: number;
  mois: number;
  equipeId: string | null;
  siteId: string | null;
};

/** `?mois=YYYY-MM` (mois courant par défaut) + équipe / site optionnels. */
export function lireFiltresCalendrier(sp: ParametresUrl, today: IsoDate): FiltresCalendrier {
  const brut = valeurParam(sp, 'mois');
  const m = brut ? /^(\d{4})-(\d{2})$/.exec(brut) : null;
  const annee = m ? Number(m[1]) : NaN;
  const mois = m ? Number(m[2]) : NaN;
  const valide = annee >= 2000 && annee <= 2100 && mois >= 1 && mois <= 12;
  return {
    annee: valide ? annee : Number(today.slice(0, 4)),
    mois: valide ? mois : Number(today.slice(5, 7)),
    equipeId: uuidParam(sp, 'equipe'),
    siteId: uuidParam(sp, 'site'),
  };
}

export function hrefCalendrier(base: string, f: FiltresCalendrier): string {
  return construireHref(base, {
    mois: `${f.annee}-${String(f.mois).padStart(2, '0')}`,
    equipe: f.equipeId,
    site: f.siteId,
  });
}

// ─────────────────────────────────────────────────────────────
// Compteurs
// ─────────────────────────────────────────────────────────────

export type PeriodeFiltre = { debut: IsoDate; fin: IsoDate };

export type FiltresCompteurs = {
  /** Période de référence affichée, ou `null` = toutes les périodes. */
  periode: PeriodeFiltre | null;
  typeAbsenceId: string | null;
};

/**
 * `?periode=YYYY-MM-DD` (début de période, BTP avril → mars par défaut :
 * période contenant `today`) ou `?periode=toutes` ; `?type=<uuid>`.
 */
export function lireFiltresCompteurs(sp: ParametresUrl, today: IsoDate): FiltresCompteurs {
  const brut = valeurParam(sp, 'periode');
  let periode: PeriodeFiltre | null;
  if (brut === 'toutes') periode = null;
  else if (estDateIso(brut)) periode = periodeReference(brut);
  else periode = periodeReference(today);
  return { periode, typeAbsenceId: uuidParam(sp, 'type') };
}

/** Périodes proposées en filtre : précédente, courante, suivante. */
export function periodesProposees(today: IsoDate): PeriodeFiltre[] {
  const courante = periodeReference(today);
  const precedente = periodeReference(ajouterJours(courante.debut, -1));
  const suivante = periodeReference(ajouterJours(courante.fin, 1));
  return [precedente, courante, suivante];
}

export function hrefCompteurs(base: string, f: FiltresCompteurs): string {
  return construireHref(base, {
    periode: f.periode ? f.periode.debut : 'toutes',
    type: f.typeAbsenceId,
  });
}

// ─────────────────────────────────────────────────────────────
// Paramètres (jours fériés)
// ─────────────────────────────────────────────────────────────

/** `?annee=YYYY` (2000–2100), année de `today` par défaut. */
export function lireAnnee(sp: ParametresUrl, today: IsoDate): number {
  const n = Number(valeurParam(sp, 'annee'));
  return Number.isInteger(n) && n >= 2000 && n <= 2100 ? n : Number(today.slice(0, 4));
}
