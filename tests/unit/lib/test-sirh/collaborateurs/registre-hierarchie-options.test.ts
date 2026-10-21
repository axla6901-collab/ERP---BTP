import { describe, expect, it } from 'vitest';

import type { LigneRegistre } from '@/lib/test-sirh/collaborateurs/contrats';
import { creeUnCycleHierarchique } from '@/lib/test-sirh/collaborateurs/hierarchie';
import { garantirOption, optionsEmployes } from '@/lib/test-sirh/collaborateurs/options';
import { COLONNES_CSV_REGISTRE, numeroterRegistre } from '@/lib/test-sirh/collaborateurs/registre';
import { genererCsv } from '@/lib/test-sirh/csv';

function ligne(partiel: Partial<LigneRegistre>): LigneRegistre {
  return {
    employeId: 'e',
    nom: 'Nom',
    prenoms: 'Prénom',
    nationalite: 'Française',
    dateNaissance: '1990-01-01',
    sexe: 'F',
    emploi: 'Conductrice de travaux',
    qualification: null,
    categorie: 'etam',
    typeContrat: 'cdi',
    tempsPartiel: false,
    mentions: [],
    agenceInterim: null,
    dateEntree: '2020-01-01',
    dateSortie: null,
    ...partiel,
  };
}

describe('registre : numérotation et CSV', () => {
  it('numérote dans l’ordre chronologique des entrées', () => {
    const lignes = numeroterRegistre([
      ligne({ employeId: 'b', nom: 'Bernard', dateEntree: '2022-02-01' }),
      ligne({ employeId: 'a', nom: 'Albert', dateEntree: '2019-09-01' }),
    ]);
    expect(lignes.map((l) => [l.numero, l.employeId])).toEqual([
      [1, 'a'],
      [2, 'b'],
    ]);
  });

  it('génère le CSV (en-têtes, dates FR, libellés, mentions)', () => {
    const [l] = numeroterRegistre([
      ligne({
        nom: 'Durand',
        prenoms: 'Julie',
        typeContrat: 'interim',
        mentions: ['Travailleur temporaire — Adecco', 'Temps partiel'],
        agenceInterim: 'Adecco',
        dateSortie: '2026-12-31',
      }),
    ]);
    const csv = genererCsv(COLONNES_CSV_REGISTRE, [l!], { bom: false });
    const [entetes, corps] = csv.split('\r\n');
    expect(entetes).toBe(
      'N° d’ordre;Nom;Prénoms;Nationalité;Date de naissance;Sexe;Emploi;Qualification;Catégorie;Type de contrat;Mentions;Entreprise de travail temporaire;Date d’entrée;Date de sortie',
    );
    expect(corps).toBe(
      '1;Durand;Julie;Française;01/01/1990;Féminin;Conductrice de travaux;;ETAM;Intérim;Travailleur temporaire — Adecco / Temps partiel;Adecco;01/01/2020;31/12/2026',
    );
  });
});

describe('creeUnCycleHierarchique', () => {
  const managers = new Map<string, string | null>([
    ['a', 'b'],
    ['b', 'c'],
    ['c', null],
    ['x', 'y'],
    ['y', 'x'],
  ]);

  it('détecte une boucle via la chaîne du futur manager', () => {
    expect(creeUnCycleHierarchique('c', 'a', managers)).toBe(true);
    expect(creeUnCycleHierarchique('a', 'a', managers)).toBe(true);
  });

  it('accepte une chaîne sans boucle et l’absence de manager', () => {
    expect(creeUnCycleHierarchique('d', 'a', managers)).toBe(false);
    expect(creeUnCycleHierarchique('a', null, managers)).toBe(false);
  });

  it('ne boucle pas indéfiniment sur une boucle préexistante étrangère', () => {
    expect(creeUnCycleHierarchique('d', 'x', managers)).toBe(false);
  });
});

describe('options des sélecteurs', () => {
  it('ajoute la valeur courante absente de la liste', () => {
    const opts = garantirOption([{ id: 's1', label: 'Lyon' }], 's2', 'Dépôt fermé');
    expect(opts).toEqual([
      { id: 's1', label: 'Lyon' },
      { id: 's2', label: 'Dépôt fermé (inactif)' },
    ]);
    expect(garantirOption([{ id: 's1', label: 'Lyon' }], 's1', 'Lyon')).toHaveLength(1);
    expect(garantirOption([{ id: 's1', label: 'Lyon' }], null, null)).toHaveLength(1);
  });

  it('options d’employés : actifs, valeur courante sortie, exclusion de soi', () => {
    const employes = [
      { id: 'e1', label: 'Dubois Marc', actif: true },
      { id: 'e2', label: 'Martin Léa', actif: false },
      { id: 'e3', label: 'Petit Jean', actif: false },
    ];
    expect(optionsEmployes(employes, { valeurCourante: 'e2', exclure: 'e1' })).toEqual([
      { id: 'e2', label: 'Martin Léa (sorti)' },
    ]);
    expect(optionsEmployes(employes)).toEqual([{ id: 'e1', label: 'Dubois Marc' }]);
  });
});
