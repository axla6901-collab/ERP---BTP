import { describe, expect, it } from 'vitest';

import {
  genererCsvPaie,
  nombreCsv,
  syntheseParEmploye,
  totauxVariables,
  type EmployeSynthese,
  type VariablePourSynthese,
} from '@/lib/test-sirh/paie/synthese';

const employes: EmployeSynthese[] = [
  { id: 'e1', nom: 'Martin', prenom: 'Paul', matricule: 'M001' },
  { id: 'e2', nom: 'Bernard', prenom: 'Léa', matricule: null },
];

function v(partiel: Partial<VariablePourSynthese>): VariablePourSynthese {
  return {
    employeId: 'e1',
    typeVariable: 'prime',
    libelle: 'Prime',
    codeRubrique: null,
    quantite: null,
    montant: null,
    majorationPct: null,
    ...partiel,
  };
}

const variables: VariablePourSynthese[] = [
  v({ typeVariable: 'absence', libelle: 'Congés payés', quantite: '3.00' }),
  v({ typeVariable: 'absence', libelle: 'Congés payés', quantite: '2.00' }),
  v({ typeVariable: 'absence', libelle: 'Arrêt maladie', quantite: '1.00' }),
  v({ typeVariable: 'heures_supplementaires', quantite: '2.50', majorationPct: 25 }),
  v({ typeVariable: 'heures_supplementaires', quantite: '1.00', majorationPct: 50 }),
  v({ typeVariable: 'heures_supplementaires', quantite: '0.50', majorationPct: null }),
  v({ typeVariable: 'prime', montant: '100.00' }),
  v({ typeVariable: 'indemnite', montant: '50.50' }),
  v({ typeVariable: 'remboursement_frais', montant: '18.50' }),
  v({ typeVariable: 'remboursement_frais', montant: '12.00' }),
  v({ typeVariable: 'retenue', montant: '-40.00' }),
  v({ employeId: 'e2', typeVariable: 'absence', libelle: 'RTT', quantite: '1.00' }),
];

describe('syntheseParEmploye', () => {
  const lignes = syntheseParEmploye(variables, employes);

  it('trie les collaborateurs par nom', () => {
    expect(lignes.map((l) => l.employe.nom)).toEqual(['Bernard', 'Martin']);
  });

  it('cumule absences par type, heures sup. par taux, primes, frais et autres', () => {
    const martin = lignes[1]!;
    expect(martin.absences).toEqual([
      { libelle: 'Arrêt maladie', quantite: 1 },
      { libelle: 'Congés payés', quantite: 5 },
    ]);
    expect(martin.heuresSup25).toBe(2.5);
    expect(martin.heuresSup50).toBe(1);
    expect(martin.heuresSupAutres).toBe(0.5);
    expect(martin.primes).toBe(150.5);
    expect(martin.frais).toBe(30.5);
    expect(martin.nbAutres).toBe(1);
    expect(martin.nbVariables).toBe(11);
    expect(lignes[0]).toMatchObject({
      absences: [{ libelle: 'RTT', quantite: 1 }],
      nbVariables: 1,
    });
  });

  it('tolère un collaborateur inconnu', () => {
    const [l] = syntheseParEmploye([v({ employeId: 'x', montant: '5' })], []);
    expect(l?.employe).toEqual({ id: 'x', nom: '—', prenom: '', matricule: null });
  });
});

describe('totauxVariables', () => {
  it('totalise montants, heures sup. et collaborateurs', () => {
    expect(totauxVariables(variables)).toEqual({
      nbVariables: 12,
      nbEmployes: 2,
      montantTotal: 141,
      heuresSup: 4,
    });
  });
});

describe('export CSV', () => {
  it('formate les nombres à la française', () => {
    expect(nombreCsv('7.5')).toBe('7,50');
    expect(nombreCsv(-40)).toBe('-40,00');
    expect(nombreCsv(null)).toBe('');
  });

  it('produit un CSV trié, séparé par des points-virgules', () => {
    const csv = genererCsvPaie([
      {
        matricule: 'M001',
        nom: 'Martin',
        prenom: 'Paul',
        codeRubrique: 'HS25',
        libelle: 'Heures supplémentaires +25 %',
        quantite: '2.50',
        montant: null,
      },
      {
        matricule: null,
        nom: 'Bernard',
        prenom: 'Léa',
        codeRubrique: null,
        libelle: 'Frais ; repas',
        quantite: null,
        montant: '18.5',
      },
    ]);
    expect(csv.charCodeAt(0)).toBe(0xfeff);
    const lignes = csv.slice(1).split('\r\n');
    expect(lignes[0]).toBe('Matricule;Nom;Prénom;Rubrique;Libellé;Quantité;Montant');
    expect(lignes[1]).toBe(';Bernard;Léa;;"Frais ; repas";;18,50');
    expect(lignes[2]).toBe('M001;Martin;Paul;HS25;Heures supplémentaires +25 %;2,50;');
  });
});
