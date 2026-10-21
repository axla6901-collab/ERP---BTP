import { messageBlocageSuppression } from '@/lib/common/references-suppression';

import { ajouterJours, differenceJours } from '../calendrier';

/**
 * Règles PURES — Test SIRH › Documents RH (GED, Factorial documents/Document +
 * Folder) : statut d'expiration, signature, indicateurs et filtres d'URL.
 */

/**
 * Message de blocage de la suppression d'un dossier qui contient encore des
 * documents (règle générale de suppression référentielle), ou null. Un dossier
 * ne se « désactive » pas : on invite à déplacer ou supprimer ses documents.
 */
export function messageBlocageSuppressionDossier(nbDocuments: number): string | null {
  const message = messageBlocageSuppression('ce dossier', [
    { nombre: nbDocuments, singulier: 'document', pluriel: 'documents' },
  ]);
  return message
    ? message.replace(/Désactivez-le[^.]*\.$/, 'Déplacez ou supprimez ses documents d’abord.')
    : null;
}

/** Seuil d'alerte avant expiration d'un document (jours). */
export const SEUIL_EXPIRATION_JOURS = 30;

export type StatutExpiration = 'sans' | 'valide' | 'bientot' | 'expire';

/**
 * Statut d'expiration d'un document à la date `today` :
 * - `sans`    : pas de date d'expiration ;
 * - `expire`  : date dépassée (strictement antérieure à aujourd'hui) ;
 * - `bientot` : expire dans `seuilJours` jours ou moins (aujourd'hui compris) ;
 * - `valide`  : au-delà.
 */
export function statutExpiration(
  dateExpiration: string | null | undefined,
  today: string,
  seuilJours = SEUIL_EXPIRATION_JOURS,
): StatutExpiration {
  if (!dateExpiration) return 'sans';
  if (dateExpiration < today) return 'expire';
  return differenceJours(today, dateExpiration) <= seuilJours ? 'bientot' : 'valide';
}

/** Expiré ou expirant sous `seuilJours` jours (rail « Expirant ≤ 30 j »). */
export function expirantSous(
  dateExpiration: string | null | undefined,
  today: string,
  seuilJours = SEUIL_EXPIRATION_JOURS,
): boolean {
  const s = statutExpiration(dateExpiration, today, seuilJours);
  return s === 'expire' || s === 'bientot';
}

/** Date limite (incluse) du filtre « expirant sous `seuilJours` jours ». */
export function limiteExpiration(today: string, seuilJours = SEUIL_EXPIRATION_JOURS): string {
  return ajouterJours(today, seuilJours);
}

export type StatutSignature = 'non_requise' | 'a_signer' | 'signe';

export function statutSignature(doc: {
  signatureRequise: boolean;
  signeLe: string | null;
}): StatutSignature {
  if (doc.signeLe) return 'signe';
  return doc.signatureRequise ? 'a_signer' : 'non_requise';
}

/** Message d'erreur si la date d'expiration précède la date du document, sinon null. */
export function controleDatesDocument(
  dateDocument: string | null,
  dateExpiration: string | null,
): string | null {
  if (dateDocument && dateExpiration && dateExpiration < dateDocument) {
    return "La date d'expiration doit être postérieure à la date du document.";
  }
  return null;
}

export type LigneKpiDocument = {
  employeId: string | null;
  dateExpiration: string | null;
  signatureRequise: boolean;
  signeLe: string | null;
};

export type KpiDocuments = {
  total: number;
  /** Documents d'entreprise (non rattachés à un salarié). */
  entreprise: number;
  expires: number;
  /** Expirant dans les 30 jours (hors déjà expirés). */
  bientot: number;
  /** Signature requise, non encore signés. */
  aSigner: number;
};

export function agregerKpiDocuments(
  docs: readonly LigneKpiDocument[],
  today: string,
): KpiDocuments {
  const kpi: KpiDocuments = { total: 0, entreprise: 0, expires: 0, bientot: 0, aSigner: 0 };
  for (const d of docs) {
    kpi.total += 1;
    if (d.employeId === null) kpi.entreprise += 1;
    const exp = statutExpiration(d.dateExpiration, today);
    if (exp === 'expire') kpi.expires += 1;
    if (exp === 'bientot') kpi.bientot += 1;
    if (statutSignature(d) === 'a_signer') kpi.aSigner += 1;
  }
  return kpi;
}

// ─────────────────────────────────────────────────────────────
// Filtres d'URL (`?dossier=<uuid>|sans|expirant&employe=<uuid>|entreprise`)
// ─────────────────────────────────────────────────────────────

export type FiltreDossier =
  | { type: 'tous' }
  | { type: 'dossier'; id: string }
  | { type: 'sans' }
  | { type: 'expirant' };

export type FiltreConcerne =
  | { type: 'tous' }
  | { type: 'employe'; id: string }
  | { type: 'entreprise' };

export type FiltresDocuments = { dossier: FiltreDossier; concerne: FiltreConcerne };

const REGEX_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function lireFiltresDocuments(sp: {
  dossier?: string | undefined;
  employe?: string | undefined;
}): FiltresDocuments {
  let dossier: FiltreDossier = { type: 'tous' };
  if (sp.dossier === 'sans') dossier = { type: 'sans' };
  else if (sp.dossier === 'expirant') dossier = { type: 'expirant' };
  else if (sp.dossier && REGEX_UUID.test(sp.dossier)) dossier = { type: 'dossier', id: sp.dossier };

  let concerne: FiltreConcerne = { type: 'tous' };
  if (sp.employe === 'entreprise') concerne = { type: 'entreprise' };
  else if (sp.employe && REGEX_UUID.test(sp.employe))
    concerne = { type: 'employe', id: sp.employe };

  return { dossier, concerne };
}

/** Valeur d'URL d'un filtre de dossier (`undefined` = tous). */
export function valeurFiltreDossier(f: FiltreDossier): string | undefined {
  if (f.type === 'dossier') return f.id;
  if (f.type === 'sans' || f.type === 'expirant') return f.type;
  return undefined;
}

/** Valeur d'URL d'un filtre « concerné » (`undefined` = tous). */
export function valeurFiltreConcerne(f: FiltreConcerne): string | undefined {
  if (f.type === 'employe') return f.id;
  if (f.type === 'entreprise') return 'entreprise';
  return undefined;
}

/** URL de la GED en conservant l'autre filtre. */
export function urlDocuments(
  base: string,
  filtres: { dossier?: string | undefined; employe?: string | undefined },
): string {
  const params = new URLSearchParams();
  if (filtres.dossier) params.set('dossier', filtres.dossier);
  if (filtres.employe) params.set('employe', filtres.employe);
  const qs = params.toString();
  return qs ? `${base}?${qs}` : base;
}
