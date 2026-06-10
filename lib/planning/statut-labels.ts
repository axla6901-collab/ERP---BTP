/**
 * Libellés, couleurs et formatage partagés pour le statut d'un chantier dans le
 * module Planning. Mutualisé entre le tableau « Liste » et la barre projet de la
 * « Vue d'ensemble » (Gantt multi-chantier) pour éviter toute divergence.
 */

import type { Chantier } from '@/db/schema/chantiers';

export type StatutChantier = Chantier['statut'];

export const LIBELLES_STATUT: Record<StatutChantier, string> = {
  prospect: 'Prospect',
  en_cours: 'En cours',
  suspendu: 'Suspendu',
  termine: 'Terminé',
  annule: 'Annulé',
};

/** Classes Tailwind pour la pastille de statut (fond + texte). */
export const COULEURS_STATUT: Record<StatutChantier, string> = {
  prospect: 'bg-muted text-muted-foreground',
  en_cours: 'bg-emerald-100 text-emerald-700',
  suspendu: 'bg-amber-100 text-amber-700',
  termine: 'bg-sky-100 text-sky-700',
  annule: 'bg-rose-100 text-rose-700',
};

/**
 * Couleur de remplissage (hex) de la barre projet sur la frise. Inline car
 * positionnée en absolu — alignée sur la palette des pastilles ci-dessus et
 * cohérente avec la palette des corps de métier (`CATS`).
 */
export const STATUT_FILL: Record<StatutChantier, string> = {
  prospect: '#94a3b8', // slate-400
  en_cours: '#10b981', // emerald-500
  suspendu: '#f59e0b', // amber-500
  termine: '#0ea5e9', // sky-500
  annule: '#f43f5e', // rose-500
};

/** Formate une période prévue « début → fin » avec libellés partiels. */
export function formaterPeriode(debut: string | null, fin: string | null): string {
  if (!debut && !fin) return '—';
  if (debut && fin) return `${debut} → ${fin}`;
  if (debut) return `à partir du ${debut}`;
  return `jusqu'au ${fin}`;
}
