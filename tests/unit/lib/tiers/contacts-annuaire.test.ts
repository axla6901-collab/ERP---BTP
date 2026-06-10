import { describe, expect, it } from 'vitest';

import {
  construireAnnuaireContacts,
  nomAffichageClient,
  type LigneClient,
  type LigneContactTiers,
} from '@/lib/tiers/contacts-annuaire';

function ligneTiers(over: Partial<LigneContactTiers> = {}): LigneContactTiers {
  return {
    id: 'c1',
    nom: 'Durand',
    prenom: 'Paul',
    fonction: 'Commercial',
    email: 'paul@example.com',
    telephoneMobile: '0600000000',
    telephoneFixe: '0100000000',
    principal: false,
    actif: true,
    tiersId: 't1',
    tiersNom: 'BTP Plus',
    ...over,
  };
}

function ligneClient(over: Partial<LigneClient> = {}): LigneClient {
  return {
    id: 'cl1',
    type: 'professionnel',
    raisonSociale: 'SCI Horizon',
    nom: null,
    prenom: null,
    email: 'contact@horizon.fr',
    telephone: '0233334444',
    actif: true,
    ...over,
  };
}

describe('nomAffichageClient', () => {
  it('professionnel → raison sociale', () => {
    expect(
      nomAffichageClient({
        type: 'professionnel',
        raisonSociale: 'SCI Horizon',
        nom: null,
        prenom: null,
      }),
    ).toBe('SCI Horizon');
  });

  it('particulier → nom + prénom', () => {
    expect(
      nomAffichageClient({
        type: 'particulier',
        raisonSociale: null,
        nom: 'Martin',
        prenom: 'Léa',
      }),
    ).toBe('Martin Léa');
  });

  it('particulier sans prénom → nom seul', () => {
    expect(
      nomAffichageClient({ type: 'particulier', raisonSociale: null, nom: 'Martin', prenom: null }),
    ).toBe('Martin');
  });

  it('professionnel sans raison sociale → fallback nom puis « — »', () => {
    expect(
      nomAffichageClient({ type: 'professionnel', raisonSociale: null, nom: 'X', prenom: null }),
    ).toBe('X');
    expect(
      nomAffichageClient({ type: 'professionnel', raisonSociale: null, nom: null, prenom: null }),
    ).toBe('—');
  });
});

describe('construireAnnuaireContacts', () => {
  it('mappe un contact fournisseur (clé, source, href, téléphone mobile prioritaire)', () => {
    const [c] = construireAnnuaireContacts({
      contactsFournisseurs: [ligneTiers({ id: 'fc1', tiersId: 'f9' })],
      contactsSousTraitants: [],
      clients: [],
    });
    expect(c).toMatchObject({
      cle: 'fournisseur:fc1',
      source: 'fournisseur',
      nom: 'Durand',
      prenom: 'Paul',
      telephone: '0600000000',
      tiersNom: 'BTP Plus',
      tiersHref: '/tiers/fournisseurs/f9',
      principal: false,
      actif: true,
    });
  });

  it('téléphone : fixe utilisé quand le mobile est absent', () => {
    const [c] = construireAnnuaireContacts({
      contactsFournisseurs: [ligneTiers({ telephoneMobile: null, telephoneFixe: '0144556677' })],
      contactsSousTraitants: [],
      clients: [],
    });
    expect(c?.telephone).toBe('0144556677');
  });

  it('mappe un contact sous-traitant vers /tiers/sous-traitants/:id', () => {
    const [c] = construireAnnuaireContacts({
      contactsFournisseurs: [],
      contactsSousTraitants: [ligneTiers({ id: 'st1', tiersId: 's5' })],
      clients: [],
    });
    expect(c?.source).toBe('sous_traitant');
    expect(c?.cle).toBe('sous_traitant:st1');
    expect(c?.tiersHref).toBe('/tiers/sous-traitants/s5');
  });

  it('mappe un client : nom = tiersNom, principal false, href commercial', () => {
    const [c] = construireAnnuaireContacts({
      contactsFournisseurs: [],
      contactsSousTraitants: [],
      clients: [ligneClient({ id: 'cl7', raisonSociale: 'SCI Horizon' })],
    });
    expect(c).toMatchObject({
      cle: 'client:cl7',
      source: 'client',
      nom: 'SCI Horizon',
      tiersNom: 'SCI Horizon',
      prenom: null,
      fonction: null,
      principal: false,
      tiersHref: '/commercial/clients/cl7',
    });
  });

  it('fusionne les trois sources et trie par nom (fr, insensible à la casse)', () => {
    const annuaire = construireAnnuaireContacts({
      contactsFournisseurs: [ligneTiers({ id: 'a', nom: 'Zoé', prenom: null })],
      contactsSousTraitants: [ligneTiers({ id: 'b', nom: 'amélie', prenom: null })],
      clients: [
        ligneClient({
          id: 'c',
          type: 'particulier',
          raisonSociale: null,
          nom: 'Bernard',
          prenom: null,
        }),
      ],
    });
    expect(annuaire.map((c) => c.nom)).toEqual(['amélie', 'Bernard', 'Zoé']);
  });
});
