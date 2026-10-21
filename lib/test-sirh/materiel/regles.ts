import { messageBlocageSuppression } from '@/lib/common/references-suppression';
import {
  CATEGORIES_MATERIEL,
  STATUTS_MATERIEL,
  type CategorieMateriel,
  type StatutMateriel,
} from '@/lib/validation/test-sirh/enums';

import { differenceJours } from '../calendrier';

/**
 * Règles PURES — Test SIRH › Matériel & EPI (Factorial it_management, étendu
 * aux EPI / outillage / vêtements) : cycle de vie (attribution, restitution),
 * alertes de contrôle périodique / péremption, indicateurs et filtres d'URL.
 */

/** Seuil d'alerte avant un contrôle périodique ou une péremption (jours). */
export const SEUIL_CONTROLE_JOURS = 30;

/** Statuts hors parc : ni alerte de contrôle ni valeur comptée. */
export const STATUTS_HORS_PARC: readonly StatutMateriel[] = ['perdu', 'reforme'];

/**
 * Statuts proposés dans la fiche matériel. `attribue` n'est JAMAIS saisi à la
 * main : il découle d'une attribution (et un matériel attribué doit être
 * restitué avant tout autre changement de statut).
 */
export function statutsSaisissables(
  statutActuel: StatutMateriel | null,
): readonly StatutMateriel[] {
  if (statutActuel === 'attribue') return ['attribue'];
  return STATUTS_MATERIEL.filter((s) => s !== 'attribue');
}

/** Le changement de statut demandé dans la fiche est-il permis ? */
export function changementStatutAutorise(
  statutActuel: StatutMateriel | null,
  statutDemande: StatutMateriel,
): boolean {
  return statutsSaisissables(statutActuel).includes(statutDemande);
}

/** Seul un matériel en stock peut être remis à un collaborateur. */
export function peutAttribuer(statut: StatutMateriel): boolean {
  return statut === 'en_stock';
}

export function statutApresAttribution(): StatutMateriel {
  return 'attribue';
}

/** Après restitution : retour en stock, ou en réparation si un défaut est signalé. */
export function statutApresRestitution(signalerReparation: boolean): StatutMateriel {
  return signalerReparation ? 'en_reparation' : 'en_stock';
}

/** Message d'erreur si la date de retour précède la date de remise, sinon null. */
export function controleRestitution(dateRemise: string, dateRetour: string): string | null {
  if (dateRetour < dateRemise) {
    return 'La date de retour doit être postérieure ou égale à la date de remise.';
  }
  return null;
}

export type AlerteControle = 'aucune' | 'proche' | 'depassee';

/**
 * Alerte sur la date de prochain contrôle / péremption (EPI antichute,
 * extincteur, harnais…) : `depassee` si la date est passée, `proche` dans les
 * `seuilJours` jours, `aucune` sinon ou pour un matériel perdu / réformé.
 */
export function alerteControle(
  dateControle: string | null | undefined,
  today: string,
  statut: StatutMateriel | null = null,
  seuilJours = SEUIL_CONTROLE_JOURS,
): AlerteControle {
  if (!dateControle) return 'aucune';
  if (statut !== null && STATUTS_HORS_PARC.includes(statut)) return 'aucune';
  if (dateControle < today) return 'depassee';
  return differenceJours(today, dateControle) <= seuilJours ? 'proche' : 'aucune';
}

/** La garantie court-elle encore à `today` ? */
export function sousGarantie(dateFinGarantie: string | null | undefined, today: string): boolean {
  return Boolean(dateFinGarantie && dateFinGarantie >= today);
}

/**
 * Message de blocage de la suppression d'un matériel qui a un historique
 * d'attribution (règle générale de suppression référentielle), ou null : on
 * invite à le réformer pour conserver la traçabilité des remises (EPI).
 */
export function messageBlocageSuppressionMateriel(nbAttributions: number): string | null {
  const message = messageBlocageSuppression('ce matériel', [
    { nombre: nbAttributions, singulier: 'attribution', pluriel: 'attributions' },
  ]);
  return message
    ? message.replace(
        /Désactivez-le[^.]*\.$/,
        'Réformez-le plutôt (statut « Réformé ») pour conserver son historique.',
      )
    : null;
}

/** Message d'erreur si la fin de garantie précède l'achat, sinon null. */
export function controleDatesMateriel(
  dateAchat: string | null,
  dateFinGarantie: string | null,
): string | null {
  if (dateAchat && dateFinGarantie && dateFinGarantie < dateAchat) {
    return "La fin de garantie doit être postérieure à la date d'achat.";
  }
  return null;
}

export type LigneKpiMateriel = {
  statut: StatutMateriel;
  valeurAchat: number | null;
  dateControle: string | null;
};

export type KpiMateriel = {
  total: number;
  attribues: number;
  enStock: number;
  enReparation: number;
  /** Contrôles / péremptions dépassés ou à moins de 30 jours. */
  alertesControle: number;
  /** Σ valeurs d'achat du parc (hors perdu / réformé). */
  valeurParc: number;
};

export function agregerKpiMateriel(
  materiels: readonly LigneKpiMateriel[],
  today: string,
): KpiMateriel {
  const kpi: KpiMateriel = {
    total: 0,
    attribues: 0,
    enStock: 0,
    enReparation: 0,
    alertesControle: 0,
    valeurParc: 0,
  };
  let valeurCentimes = 0;
  for (const m of materiels) {
    kpi.total += 1;
    if (m.statut === 'attribue') kpi.attribues += 1;
    if (m.statut === 'en_stock') kpi.enStock += 1;
    if (m.statut === 'en_reparation') kpi.enReparation += 1;
    if (alerteControle(m.dateControle, today, m.statut) !== 'aucune') kpi.alertesControle += 1;
    if (!STATUTS_HORS_PARC.includes(m.statut) && m.valeurAchat !== null) {
      valeurCentimes += Math.round(m.valeurAchat * 100);
    }
  }
  kpi.valeurParc = valeurCentimes / 100;
  return kpi;
}

// ─────────────────────────────────────────────────────────────
// Filtres d'URL (`?categorie=…&statut=…`)
// ─────────────────────────────────────────────────────────────

export type FiltresMateriel = {
  categorie: CategorieMateriel | null;
  statut: StatutMateriel | null;
};

export function lireFiltresMateriel(sp: {
  categorie?: string | undefined;
  statut?: string | undefined;
}): FiltresMateriel {
  const categorie = (CATEGORIES_MATERIEL as readonly string[]).includes(sp.categorie ?? '')
    ? (sp.categorie as CategorieMateriel)
    : null;
  const statut = (STATUTS_MATERIEL as readonly string[]).includes(sp.statut ?? '')
    ? (sp.statut as StatutMateriel)
    : null;
  return { categorie, statut };
}

/** URL de l'inventaire en conservant l'autre filtre. */
export function urlMateriel(base: string, filtres: Partial<FiltresMateriel>): string {
  const params = new URLSearchParams();
  if (filtres.categorie) params.set('categorie', filtres.categorie);
  if (filtres.statut) params.set('statut', filtres.statut);
  const qs = params.toString();
  return qs ? `${base}?${qs}` : base;
}
