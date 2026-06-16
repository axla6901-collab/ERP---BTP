import { Badge, type BadgeTone } from '@/components/ui/badge';
import { LIBELLES_STATUT_VEHICULE, type StatutVehicule } from '@/lib/validation/flotte';

const TONE: Record<StatutVehicule, BadgeTone> = {
  actif: 'emerald',
  immobilise: 'amber',
  en_reparation: 'amber',
  vendu: 'neutral',
  reforme: 'neutral',
  vole_detruit: 'rose',
};

/** Badge de statut d'un véhicule (présentationnel, réutilisable liste + fiche). */
export function StatutVehiculeBadge({ statut }: { statut: StatutVehicule }) {
  return <Badge tone={TONE[statut]}>{LIBELLES_STATUT_VEHICULE[statut]}</Badge>;
}
