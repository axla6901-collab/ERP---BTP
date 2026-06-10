import type { SourceContact } from '@/lib/tiers/contacts-annuaire';

export type { SourceContact };

/**
 * Contact d'un tiers, projeté en objet sérialisable pour les Server Components
 * (fiches) et la frame `ContactDialog`. Sous-ensemble commun aux trois tables
 * `fournisseur_contacts` / `sous_traitant_contacts` / `client_contacts`.
 */
export type ContactFiche = {
  id: string;
  nom: string;
  prenom: string | null;
  fonction: string | null;
  email: string | null;
  telephoneMobile: string | null;
  telephoneFixe: string | null;
  notes: string | null;
  principal: boolean;
  actif: boolean;
};
