/**
 * Annuaire consolidé des contacts de tous les tiers — logique **pure**.
 *
 * Ce module ne contient que des types et des transformations sans I/O : il est
 * donc importable côté client (composant table) comme côté serveur (data access
 * dans `./contacts`) et testable sans base de données.
 *
 * Trois sources sont fusionnées en lecture seule :
 *  - `fournisseur_contacts`   (contacts structurés des fournisseurs)
 *  - `sous_traitant_contacts` (contacts structurés des sous-traitants)
 *  - `clients`                (email/téléphone porté par la fiche client —
 *                              le client n'a pas de modèle multi-contacts)
 */

export type SourceContact = 'fournisseur' | 'sous_traitant' | 'client';

export const LIBELLE_SOURCE_CONTACT: Record<SourceContact, string> = {
  fournisseur: 'Fournisseur',
  sous_traitant: 'Sous-traitant',
  client: 'Client',
};

export type ContactUnifie = {
  /** Clé unique stable `${source}:${id}` — sources potentiellement homonymes. */
  cle: string;
  source: SourceContact;
  /** Nom affiché du contact (personne, ou raison sociale/nom pour un client). */
  nom: string;
  prenom: string | null;
  fonction: string | null;
  email: string | null;
  telephone: string | null;
  /** Tiers de rattachement (raison sociale du fournisseur/sous-traitant/client). */
  tiersNom: string;
  /** Lien vers la fiche du tiers (édition). */
  tiersHref: string;
  /** Contact principal du tiers (toujours false côté client). */
  principal: boolean;
  actif: boolean;
};

// ─────────────────────────────────────────────────────────────
// Lignes brutes attendues par le builder (sous-ensemble de colonnes).
// ─────────────────────────────────────────────────────────────

export type LigneContactTiers = {
  id: string;
  nom: string;
  prenom: string | null;
  fonction: string | null;
  email: string | null;
  telephoneMobile: string | null;
  telephoneFixe: string | null;
  principal: boolean;
  actif: boolean;
  tiersId: string;
  tiersNom: string;
};

export type LigneClient = {
  id: string;
  type: 'particulier' | 'professionnel';
  raisonSociale: string | null;
  nom: string | null;
  prenom: string | null;
  email: string | null;
  telephone: string | null;
  actif: boolean;
};

/** Nom d'affichage d'un client : raison sociale (pro) ou nom + prénom (particulier). */
export function nomAffichageClient(
  c: Pick<LigneClient, 'type' | 'raisonSociale' | 'nom' | 'prenom'>,
): string {
  if (c.type === 'professionnel') {
    return c.raisonSociale ?? c.nom ?? '—';
  }
  const complet = [c.nom, c.prenom].filter(Boolean).join(' ').trim();
  return complet || c.raisonSociale || '—';
}

function depuisContactsTiers(
  lignes: LigneContactTiers[],
  source: Exclude<SourceContact, 'client'>,
  hrefBase: string,
): ContactUnifie[] {
  return lignes.map((l) => ({
    cle: `${source}:${l.id}`,
    source,
    nom: l.nom,
    prenom: l.prenom,
    fonction: l.fonction,
    email: l.email,
    telephone: l.telephoneMobile ?? l.telephoneFixe,
    tiersNom: l.tiersNom,
    tiersHref: `${hrefBase}/${l.tiersId}`,
    principal: l.principal,
    actif: l.actif,
  }));
}

/**
 * Fusionne les trois sources en un annuaire unifié, trié par nom (fr).
 * Fonction pure : pas d'I/O, testable sans base.
 */
export function construireAnnuaireContacts(input: {
  contactsFournisseurs: LigneContactTiers[];
  contactsSousTraitants: LigneContactTiers[];
  clients: LigneClient[];
}): ContactUnifie[] {
  const contactsF = depuisContactsTiers(
    input.contactsFournisseurs,
    'fournisseur',
    '/tiers/fournisseurs',
  );
  const contactsST = depuisContactsTiers(
    input.contactsSousTraitants,
    'sous_traitant',
    '/tiers/sous-traitants',
  );
  const contactsClients = input.clients.map<ContactUnifie>((c) => {
    const nom = nomAffichageClient(c);
    return {
      cle: `client:${c.id}`,
      source: 'client',
      nom,
      prenom: null,
      fonction: null,
      email: c.email,
      telephone: c.telephone,
      tiersNom: nom,
      tiersHref: `/commercial/clients/${c.id}`,
      principal: false,
      actif: c.actif,
    };
  });

  return [...contactsF, ...contactsST, ...contactsClients].sort((a, b) =>
    a.nom.localeCompare(b.nom, 'fr', { sensitivity: 'base' }),
  );
}
