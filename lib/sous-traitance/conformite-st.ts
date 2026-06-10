import 'server-only';

import { lireTier } from '@/lib/referencement/registre';

/**
 * Contrôle de conformité documentaire d'un sous-traitant avant activation d'un
 * contrat ST (M8.2). Réutilise le moteur du module Référencement des tiers (pas
 * de modèle documentaire dupliqué) :
 *   - si le ST est relié au registre `tiers` (sous_traitants.tier_id) ET que le
 *     module Référencement est actif → on bloque si un document `est_bloquant`
 *     n'est pas « à jour » (cf. lib/referencement/conformite.ts) ;
 *   - sinon → repli léger sur l'assurance décennale + l'attestation URSSAF déjà
 *     portées par la fiche sous-traitant.
 */

export type SousTraitantConformiteInput = {
  tierId: string | null;
  assuranceDecennaleDateFin: string | null;
  dateAttestationUrssaf: string | null;
};

export type ConformiteVerdict = {
  ok: boolean;
  raison: string | null;
  source: 'referencement' | 'leger';
};

/** Validité usuelle d'une attestation de vigilance URSSAF (~6 mois). */
const JOURS_VALIDITE_URSSAF = 183;

export async function verifierConformiteSousTraitant(
  st: SousTraitantConformiteInput,
  options: { referencementActif: boolean; aujourdhui?: string },
): Promise<ConformiteVerdict> {
  const today = options.aujourdhui ?? new Date().toISOString().slice(0, 10);

  if (options.referencementActif && st.tierId) {
    const detail = await lireTier(st.tierId);
    if (detail) {
      const bloquants = detail.conformite.lignes.filter(
        (l) => l.estBloquant && l.statut !== 'a_jour',
      );
      if (bloquants.length > 0) {
        return {
          ok: false,
          source: 'referencement',
          raison: `Documents obligatoires non à jour : ${bloquants
            .map((l) => l.libelle)
            .join(', ')}.`,
        };
      }
      return { ok: true, source: 'referencement', raison: null };
    }
  }

  // Repli léger : décennale + URSSAF portées par le sous-traitant.
  const pbs: string[] = [];
  if (!st.assuranceDecennaleDateFin) pbs.push('assurance décennale manquante');
  else if (st.assuranceDecennaleDateFin < today) pbs.push('assurance décennale expirée');

  if (!st.dateAttestationUrssaf) pbs.push('attestation URSSAF manquante');
  else {
    const limite = new Date(`${st.dateAttestationUrssaf}T00:00:00Z`);
    limite.setUTCDate(limite.getUTCDate() + JOURS_VALIDITE_URSSAF);
    if (limite.toISOString().slice(0, 10) < today) {
      pbs.push('attestation URSSAF de plus de 6 mois');
    }
  }

  if (pbs.length > 0) {
    return { ok: false, source: 'leger', raison: `Conformité incomplète : ${pbs.join(', ')}.` };
  }
  return { ok: true, source: 'leger', raison: null };
}
