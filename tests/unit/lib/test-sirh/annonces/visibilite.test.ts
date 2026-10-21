import { describe, expect, it } from 'vitest';

import {
  adhesionActive,
  annoncesVisibles,
  comparerAnnonces,
  compterParStatut,
  estAnnonceEnLigne,
  estDansAudience,
  filtrerAnnoncesParStatut,
  libelleAudience,
  statutAnnonce,
  trierAnnonces,
  type ProfilAudience,
} from '@/lib/test-sirh/annonces/visibilite';

const TODAY = '2026-10-19';
const SITE_LYON = 'site-lyon';
const SITE_GRENOBLE = 'site-grenoble';
const EQUIPE_GO = 'equipe-gros-oeuvre';

type A = {
  id: string;
  publiee: boolean;
  datePublication: string;
  dateExpiration: string | null;
  siteId: string | null;
  equipeId: string | null;
  epinglee: boolean;
  createdAt?: string;
};

const annonce = (p: Partial<A> & { id: string }): A => ({
  publiee: true,
  datePublication: '2026-10-10',
  dateExpiration: null,
  siteId: null,
  equipeId: null,
  epinglee: false,
  ...p,
});

describe('statut d’une annonce', () => {
  it('brouillon, programmée, en ligne, expirée', () => {
    expect(statutAnnonce(annonce({ id: '1', publiee: false }), TODAY)).toBe('brouillon');
    expect(statutAnnonce(annonce({ id: '2', datePublication: '2026-10-20' }), TODAY)).toBe(
      'programmee',
    );
    expect(statutAnnonce(annonce({ id: '3' }), TODAY)).toBe('en_ligne');
    expect(statutAnnonce(annonce({ id: '4', datePublication: TODAY }), TODAY)).toBe('en_ligne');
    expect(statutAnnonce(annonce({ id: '5', dateExpiration: TODAY }), TODAY)).toBe('en_ligne');
    expect(statutAnnonce(annonce({ id: '6', dateExpiration: '2026-10-18' }), TODAY)).toBe(
      'expiree',
    );
    expect(estAnnonceEnLigne(annonce({ id: '7', publiee: false }), TODAY)).toBe(false);
  });
});

describe('audience', () => {
  const profil: ProfilAudience = { siteId: SITE_LYON, equipeIds: [EQUIPE_GO] };

  it('sans critère : toute l’entreprise, même sans collaborateur lié', () => {
    expect(estDansAudience({ siteId: null, equipeId: null }, null)).toBe(true);
    expect(estDansAudience({ siteId: null, equipeId: null }, profil)).toBe(true);
  });

  it('restreinte à un site ou à une équipe', () => {
    expect(estDansAudience({ siteId: SITE_LYON, equipeId: null }, profil)).toBe(true);
    expect(estDansAudience({ siteId: SITE_GRENOBLE, equipeId: null }, profil)).toBe(false);
    expect(estDansAudience({ siteId: null, equipeId: EQUIPE_GO }, profil)).toBe(true);
    expect(estDansAudience({ siteId: null, equipeId: 'autre' }, profil)).toBe(false);
  });

  it('les deux critères se cumulent', () => {
    expect(estDansAudience({ siteId: SITE_LYON, equipeId: EQUIPE_GO }, profil)).toBe(true);
    expect(estDansAudience({ siteId: SITE_GRENOBLE, equipeId: EQUIPE_GO }, profil)).toBe(false);
    expect(estDansAudience({ siteId: SITE_LYON, equipeId: 'autre' }, profil)).toBe(false);
  });

  it('audience restreinte invisible sans collaborateur lié', () => {
    expect(estDansAudience({ siteId: SITE_LYON, equipeId: null }, null)).toBe(false);
  });

  it('appartenance d’équipe en vigueur (bornes incluses)', () => {
    expect(adhesionActive({ dateDebut: null, dateFin: null }, TODAY)).toBe(true);
    expect(adhesionActive({ dateDebut: TODAY, dateFin: TODAY }, TODAY)).toBe(true);
    expect(adhesionActive({ dateDebut: '2026-10-20', dateFin: null }, TODAY)).toBe(false);
    expect(adhesionActive({ dateDebut: null, dateFin: '2026-10-18' }, TODAY)).toBe(false);
  });

  it('libellé d’audience', () => {
    expect(libelleAudience({ siteNom: null, equipeNom: null })).toBe('Toute l’entreprise');
    expect(libelleAudience({ siteNom: 'Lyon', equipeNom: null })).toBe('Site Lyon');
    expect(libelleAudience({ siteNom: null, equipeNom: 'Gros œuvre' })).toBe('Équipe Gros œuvre');
    expect(libelleAudience({ siteNom: 'Lyon', equipeNom: 'Gros œuvre' })).toBe(
      'Équipe Gros œuvre · Site Lyon',
    );
  });
});

describe('tri et fil d’actualité', () => {
  it('épinglées d’abord, puis publication puis création décroissantes', () => {
    const liste = [
      annonce({ id: 'ancienne', datePublication: '2026-09-01' }),
      annonce({ id: 'recente', datePublication: '2026-10-15', createdAt: '2026-10-15T08:00:00Z' }),
      annonce({ id: 'epinglee', datePublication: '2026-08-01', epinglee: true }),
      annonce({
        id: 'recente-2',
        datePublication: '2026-10-15',
        createdAt: '2026-10-15T09:00:00Z',
      }),
    ];
    expect(trierAnnonces(liste).map((a) => a.id)).toEqual([
      'epinglee',
      'recente-2',
      'recente',
      'ancienne',
    ]);
    expect(comparerAnnonces(liste[0]!, liste[0]!)).toBe(0);
  });

  it('ne garde que les annonces en ligne de l’audience, avec limite', () => {
    const profil: ProfilAudience = { siteId: SITE_LYON, equipeIds: [] };
    const liste = [
      annonce({ id: 'tous' }),
      annonce({ id: 'brouillon', publiee: false }),
      annonce({ id: 'expiree', dateExpiration: '2026-10-01' }),
      annonce({ id: 'future', datePublication: '2026-11-01' }),
      annonce({ id: 'lyon', siteId: SITE_LYON, datePublication: '2026-10-18' }),
      annonce({ id: 'grenoble', siteId: SITE_GRENOBLE }),
      annonce({ id: 'equipe', equipeId: EQUIPE_GO }),
      annonce({ id: 'epinglee', epinglee: true, datePublication: '2026-01-05' }),
    ];
    expect(annoncesVisibles(liste, profil, TODAY).map((a) => a.id)).toEqual([
      'epinglee',
      'lyon',
      'tous',
    ]);
    expect(annoncesVisibles(liste, profil, TODAY, 2).map((a) => a.id)).toEqual([
      'epinglee',
      'lyon',
    ]);
    expect(annoncesVisibles(liste, null, TODAY).map((a) => a.id)).toEqual(['epinglee', 'tous']);
  });

  it('filtre et compte par statut (vue gestionnaire)', () => {
    const liste = [
      annonce({ id: 'a' }),
      annonce({ id: 'b', publiee: false }),
      annonce({ id: 'c', datePublication: '2026-12-01' }),
      annonce({ id: 'd', dateExpiration: '2026-10-01' }),
      annonce({ id: 'e' }),
    ];
    expect(filtrerAnnoncesParStatut(liste, 'en_ligne', TODAY).map((a) => a.id)).toEqual(['a', 'e']);
    expect(filtrerAnnoncesParStatut(liste, 'toutes', TODAY)).toHaveLength(5);
    expect(compterParStatut(liste, TODAY)).toEqual({
      en_ligne: 2,
      programmee: 1,
      brouillon: 1,
      expiree: 1,
    });
  });
});
