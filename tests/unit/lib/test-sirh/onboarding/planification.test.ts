import { describe, expect, it } from 'vitest';

import { MODELES_PROCESSUS_DEFAUT } from '@/lib/test-sirh/amorcage';
import {
  assigneParDefaut,
  calculerKpiOnboarding,
  dateReferenceSuggeree,
  deplacerDansListe,
  estTacheDeLaSemaine,
  estTacheEnRetard,
  estTacheOuverte,
  filtrerTaches,
  finDeSemaine,
  formatDelai,
  libelleDateReference,
  libelleProcessusParDefaut,
  materialiserTaches,
  ordreSuivant,
  processusTerminable,
  prochaineEcheance,
  progressionTaches,
  renumeroter,
  syntheseProcessus,
  transitionCoche,
  transitionProcessusAutorisee,
  transitionStatut,
  trierModeleTaches,
  trierTachesParEcheance,
  type ModeleTachePlanifiable,
  type TacheSuivi,
} from '@/lib/test-sirh/onboarding/planification';

// Lundi 19 octobre 2026.
const TODAY = '2026-10-19';

describe('materialiserTaches', () => {
  const modele: ModeleTachePlanifiable[] = [
    {
      libelle: 'Point à un mois',
      description: null,
      responsable: 'manager',
      delaiJours: 30,
      ordre: 30,
    },
    { libelle: 'Contrat', description: 'À signer', responsable: 'rh', delaiJours: -5, ordre: 10 },
    { libelle: 'Accueil', description: null, responsable: 'salarie', delaiJours: 0, ordre: 20 },
  ];

  it('calcule les échéances depuis la date de référence et renumérote dans l’ordre', () => {
    const taches = materialiserTaches(modele, '2026-11-02');
    expect(taches.map((t) => [t.libelle, t.echeance, t.ordre])).toEqual([
      ['Contrat', '2026-10-28', 10],
      ['Accueil', '2026-11-02', 20],
      ['Point à un mois', '2026-12-02', 30],
    ]);
    expect(taches[0]).toMatchObject({ description: 'À signer', responsable: 'rh', assigneA: null });
  });

  it('assigne par défaut selon le responsable', () => {
    const taches = materialiserTaches(modele, '2026-11-02', { rh: 'u-rh', salarie: null });
    expect(taches.map((t) => t.assigneA)).toEqual(['u-rh', null, null]);
    expect(assigneParDefaut('manager', { manager: 'u-chef' })).toBe('u-chef');
    expect(assigneParDefaut('it')).toBeNull();
  });

  it('matérialise le modèle d’intégration amorcé à l’activation', () => {
    const integration = MODELES_PROCESSUS_DEFAUT.find((m) => m.typeProcessus === 'onboarding')!;
    const taches = materialiserTaches(
      integration.taches.map((t, i) => ({
        ...t,
        description: t.description ?? null,
        ordre: (i + 1) * 10,
      })),
      '2026-11-02',
    );
    expect(taches).toHaveLength(integration.taches.length);
    expect(taches[0]!.echeance).toBe('2026-10-28'); // J-5 : contrat
    expect(taches.at(-1)!.echeance).toBe('2026-12-02'); // J+30 : point d'étape
  });

  it('trie les tâches de modèle par ordre puis délai, sans muter l’entrée', () => {
    const triees = trierModeleTaches([
      { ordre: 20, delaiJours: 0 },
      { ordre: 10, delaiJours: 5 },
      { ordre: 10, delaiJours: -2 },
    ]);
    expect(triees).toEqual([
      { ordre: 10, delaiJours: -2 },
      { ordre: 10, delaiJours: 5 },
      { ordre: 20, delaiJours: 0 },
    ]);
  });
});

describe('libellés et suggestions', () => {
  it('libellé par défaut « modèle — collaborateur »', () => {
    expect(libelleProcessusParDefaut('Intégration compagnon BTP', 'Jean Dupont')).toBe(
      'Intégration compagnon BTP — Jean Dupont',
    );
    expect(libelleProcessusParDefaut(' Départ ', '  ')).toBe('Départ');
    expect(libelleProcessusParDefaut('x'.repeat(150), 'y'.repeat(150))).toHaveLength(200);
  });

  it('libellé de la date pivot par type', () => {
    expect(libelleDateReference('onboarding')).toBe('Date d’arrivée');
    expect(libelleDateReference('offboarding')).toBe('Date de départ');
    expect(libelleDateReference('mobilite')).toBe('Date de mobilité');
    expect(libelleDateReference('autre')).toBe('Date de référence');
  });

  it('date de référence suggérée selon le type et le collaborateur', () => {
    const employe = { dateArrivee: '2026-11-02', dateDepart: '2027-03-31' };
    expect(dateReferenceSuggeree('onboarding', employe, TODAY)).toBe('2026-11-02');
    expect(dateReferenceSuggeree('offboarding', employe, TODAY)).toBe('2027-03-31');
    expect(dateReferenceSuggeree('mobilite', employe, TODAY)).toBe(TODAY);
    expect(
      dateReferenceSuggeree('onboarding', { dateArrivee: null, dateDepart: null }, TODAY),
    ).toBe(TODAY);
    expect(dateReferenceSuggeree('offboarding', null, TODAY)).toBe(TODAY);
  });

  it('délai relatif lisible', () => {
    expect(formatDelai(0)).toBe('Jour J');
    expect(formatDelai(-5)).toBe('J-5');
    expect(formatDelai(30)).toBe('J+30');
  });

  it('ordre suivant en fin de liste', () => {
    expect(ordreSuivant([])).toBe(10);
    expect(ordreSuivant([10, 40, 20])).toBe(50);
  });
});

describe('suivi des tâches', () => {
  const t = (statut: TacheSuivi['statut'], echeance: string | null): TacheSuivi => ({
    statut,
    echeance,
  });

  it('statuts ouverts', () => {
    expect(estTacheOuverte('a_faire')).toBe(true);
    expect(estTacheOuverte('en_cours')).toBe(true);
    expect(estTacheOuverte('faite')).toBe(false);
    expect(estTacheOuverte('annulee')).toBe(false);
  });

  it('retard : tâche ouverte dont l’échéance est strictement passée', () => {
    expect(estTacheEnRetard(t('a_faire', '2026-10-18'), TODAY)).toBe(true);
    expect(estTacheEnRetard(t('en_cours', '2026-10-01'), TODAY)).toBe(true);
    expect(estTacheEnRetard(t('a_faire', TODAY), TODAY)).toBe(false);
    expect(estTacheEnRetard(t('faite', '2026-10-01'), TODAY)).toBe(false);
    expect(estTacheEnRetard(t('annulee', '2026-10-01'), TODAY)).toBe(false);
    expect(estTacheEnRetard(t('a_faire', null), TODAY)).toBe(false);
  });

  it('tâches de la semaine : d’aujourd’hui à dimanche, hors retard', () => {
    expect(finDeSemaine(TODAY)).toBe('2026-10-25');
    expect(finDeSemaine('2026-10-25')).toBe('2026-10-25'); // dimanche
    expect(estTacheDeLaSemaine(t('a_faire', TODAY), TODAY)).toBe(true);
    expect(estTacheDeLaSemaine(t('en_cours', '2026-10-25'), TODAY)).toBe(true);
    expect(estTacheDeLaSemaine(t('a_faire', '2026-10-26'), TODAY)).toBe(false);
    expect(estTacheDeLaSemaine(t('a_faire', '2026-10-18'), TODAY)).toBe(false);
    expect(estTacheDeLaSemaine(t('faite', '2026-10-20'), TODAY)).toBe(false);
  });

  it('progression : annulées exclues du total', () => {
    expect(
      progressionTaches([
        { statut: 'faite' },
        { statut: 'a_faire' },
        { statut: 'annulee' },
        { statut: 'en_cours' },
      ]),
    ).toEqual({ faites: 1, total: 3, annulees: 1, pourcent: 33 });
    expect(progressionTaches([])).toEqual({ faites: 0, total: 0, annulees: 0, pourcent: 0 });
  });

  it('prochaine échéance parmi les tâches ouvertes', () => {
    expect(
      prochaineEcheance([
        t('faite', '2026-10-01'),
        t('a_faire', '2026-10-30'),
        t('en_cours', '2026-10-22'),
        t('annulee', '2026-10-20'),
        t('a_faire', null),
      ]),
    ).toBe('2026-10-22');
    expect(prochaineEcheance([t('faite', '2026-10-01')])).toBeNull();
  });

  it('processus terminable quand toutes les tâches (hors annulées) sont faites', () => {
    expect(processusTerminable([{ statut: 'faite' }, { statut: 'annulee' }])).toBe(true);
    expect(processusTerminable([{ statut: 'faite' }, { statut: 'en_cours' }])).toBe(false);
    expect(processusTerminable([{ statut: 'annulee' }])).toBe(false);
    expect(processusTerminable([])).toBe(false);
  });

  it('synthèse d’un processus', () => {
    expect(
      syntheseProcessus(
        [t('faite', '2026-10-10'), t('a_faire', '2026-10-15'), t('a_faire', '2026-10-28')],
        TODAY,
      ),
    ).toEqual({
      faites: 1,
      total: 3,
      annulees: 0,
      pourcent: 33,
      enRetard: 1,
      ouvertes: 2,
      prochaineEcheance: '2026-10-15',
      terminable: false,
    });
  });
});

describe('transitions', () => {
  it('cocher / décocher', () => {
    expect(transitionCoche(true, TODAY)).toEqual({ statut: 'faite', dateRealisation: TODAY });
    expect(transitionCoche(false, TODAY)).toEqual({ statut: 'a_faire', dateRealisation: null });
  });

  it('changement de statut : date de réalisation réservée à « faite »', () => {
    expect(transitionStatut('faite', TODAY)).toEqual({ statut: 'faite', dateRealisation: TODAY });
    expect(transitionStatut('faite', TODAY, '2026-10-02')).toEqual({
      statut: 'faite',
      dateRealisation: '2026-10-02',
    });
    expect(transitionStatut('en_cours', TODAY, '2026-10-02')).toEqual({
      statut: 'en_cours',
      dateRealisation: null,
    });
    expect(transitionStatut('annulee', TODAY)).toEqual({
      statut: 'annulee',
      dateRealisation: null,
    });
  });

  it('transitions de processus autorisées', () => {
    expect(transitionProcessusAutorisee('en_cours', 'termine')).toBe(true);
    expect(transitionProcessusAutorisee('en_cours', 'annule')).toBe(true);
    expect(transitionProcessusAutorisee('termine', 'en_cours')).toBe(true);
    expect(transitionProcessusAutorisee('annule', 'en_cours')).toBe(true);
    expect(transitionProcessusAutorisee('termine', 'annule')).toBe(false);
    expect(transitionProcessusAutorisee('en_cours', 'en_cours')).toBe(false);
  });
});

describe('filtres, tri et indicateurs', () => {
  const taches = [
    { id: 'a', statut: 'a_faire' as const, echeance: '2026-10-10', ordre: 10 },
    { id: 'b', statut: 'en_cours' as const, echeance: '2026-10-21', ordre: 20 },
    { id: 'c', statut: 'faite' as const, echeance: '2026-10-05', ordre: 30 },
    { id: 'd', statut: 'a_faire' as const, echeance: null, ordre: 5 },
    { id: 'e', statut: 'annulee' as const, echeance: '2026-10-20', ordre: 40 },
  ];
  const ids = (l: Array<{ id: string }>) => l.map((t) => t.id);

  it('filtre par statut', () => {
    expect(ids(filtrerTaches(taches, { statut: 'ouvertes', echeance: 'toutes' }, TODAY))).toEqual([
      'a',
      'b',
      'd',
    ]);
    expect(ids(filtrerTaches(taches, { statut: 'faite', echeance: 'toutes' }, TODAY))).toEqual([
      'c',
    ]);
    expect(filtrerTaches(taches, { statut: 'toutes', echeance: 'toutes' }, TODAY)).toHaveLength(5);
  });

  it('filtre par échéance', () => {
    expect(ids(filtrerTaches(taches, { statut: 'toutes', echeance: 'en_retard' }, TODAY))).toEqual([
      'a',
    ]);
    expect(ids(filtrerTaches(taches, { statut: 'toutes', echeance: 'semaine' }, TODAY))).toEqual([
      'b',
    ]);
  });

  it('tri par échéance (sans échéance en dernier), puis par ordre', () => {
    expect(ids(trierTachesParEcheance(taches))).toEqual(['c', 'a', 'e', 'b', 'd']);
    expect(
      ids(
        trierTachesParEcheance([
          { id: 'x', statut: 'a_faire' as const, echeance: '2026-10-20', ordre: 20 },
          { id: 'y', statut: 'a_faire' as const, echeance: '2026-10-20', ordre: 10 },
        ]),
      ),
    ).toEqual(['y', 'x']);
  });

  it('KPI onboarding', () => {
    expect(
      calculerKpiOnboarding(
        [
          { typeProcessus: 'onboarding', statut: 'en_cours' },
          { typeProcessus: 'onboarding', statut: 'en_cours' },
          { typeProcessus: 'offboarding', statut: 'en_cours' },
          { typeProcessus: 'mobilite', statut: 'en_cours' },
          { typeProcessus: 'onboarding', statut: 'termine' },
        ],
        taches,
        TODAY,
      ),
    ).toEqual({
      processusEnCours: 4,
      onboardingsEnCours: 2,
      offboardingsEnCours: 1,
      tachesEnRetard: 1,
      tachesSemaine: 1,
    });
  });
});

describe('réordonnancement', () => {
  const liste = [{ id: 'a' }, { id: 'b' }, { id: 'c' }];

  it('monte / descend d’un cran', () => {
    expect(deplacerDansListe(liste, 'b', 'haut')?.map((e) => e.id)).toEqual(['b', 'a', 'c']);
    expect(deplacerDansListe(liste, 'b', 'bas')?.map((e) => e.id)).toEqual(['a', 'c', 'b']);
    expect(liste.map((e) => e.id)).toEqual(['a', 'b', 'c']); // entrée non mutée
  });

  it('refuse les déplacements impossibles', () => {
    expect(deplacerDansListe(liste, 'a', 'haut')).toBeNull();
    expect(deplacerDansListe(liste, 'c', 'bas')).toBeNull();
    expect(deplacerDansListe(liste, 'z', 'haut')).toBeNull();
  });

  it('renumérote 10, 20, 30', () => {
    expect(renumeroter(liste)).toEqual([
      { id: 'a', ordre: 10 },
      { id: 'b', ordre: 20 },
      { id: 'c', ordre: 30 },
    ]);
  });
});
