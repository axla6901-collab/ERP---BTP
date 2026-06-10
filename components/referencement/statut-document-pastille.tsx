import { Badge, type BadgeTone } from '@/components/ui/badge';
import {
  LIBELLES_STATUT_LIGNE,
  type StatutLigneDocument,
} from '@/lib/referencement/conformite';

const TONE_STATUT_LIGNE: Record<StatutLigneDocument, BadgeTone> = {
  a_jour: 'emerald',
  a_renouveler: 'amber',
  expire: 'rose',
  manquant: 'slate',
  en_attente: 'sky',
  refuse: 'rose',
};

/** Pastille d'état d'un document (à jour / à renouveler / expiré / manquant…). */
export function StatutDocumentPastille({
  statut,
  libelle,
}: {
  statut: StatutLigneDocument;
  /** Préfixe optionnel (nom du document) affiché avant le statut. */
  libelle?: string;
}) {
  return (
    <Badge tone={TONE_STATUT_LIGNE[statut]} shape="pill">
      {libelle ? `${libelle} · ` : ''}
      {LIBELLES_STATUT_LIGNE[statut]}
    </Badge>
  );
}
