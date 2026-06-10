import { describe, expect, it } from 'vitest';

import {
  calculerApportLigne,
  calculerVentilation,
  chapitreInvalide,
  type LigneVentilable,
  type PosteInterneVentilable,
} from './ventilation';

function ligne(
  ordre: number,
  type: 'section' | 'libre',
  qte = 0,
  pu = 0,
  remise = 0,
): LigneVentilable {
  return {
    ordre,
    type,
    quantite: type === 'section' ? null : String(qte),
    prixUnitaireHt: type === 'section' ? null : String(pu),
    remisePourcent: type === 'section' ? null : String(remise),
  };
}

describe('calculerVentilation', () => {
  it('ventile uniformément un poste interne sur tous les articles (portée devis)', () => {
    const lignes: LigneVentilable[] = [
      ligne(0, 'section'),
      ligne(1, 'libre', 10, 100), // base 1000
      ligne(2, 'libre', 5, 200), // base 1000
    ];
    const postes: PosteInterneVentilable[] = [
      {
        montantHt: '300',
        portee: 'devis',
        chapitreOrdre: null,
        repartitions: [],
      },
    ];
    const apports = calculerVentilation(lignes, postes);
    expect(apports.get(1)).toBeCloseTo(150);
    expect(apports.get(2)).toBeCloseTo(150);
  });

  it('ventile selon les poids manuels quand des répartitions sont fournies', () => {
    const lignes: LigneVentilable[] = [
      ligne(0, 'section'),
      ligne(1, 'libre', 10, 100),
      ligne(2, 'libre', 5, 200),
      ligne(3, 'libre', 1, 50),
    ];
    const postes: PosteInterneVentilable[] = [
      {
        montantHt: '600',
        portee: 'devis',
        chapitreOrdre: null,
        repartitions: [
          { ordreLigne: 1, poids: '2' },
          { ordreLigne: 2, poids: '1' },
          // ligne 3 absente → poids 0 → ne participe pas
        ],
      },
    ];
    const apports = calculerVentilation(lignes, postes);
    expect(apports.get(1)).toBeCloseTo(400); // 600 × 2/3
    expect(apports.get(2)).toBeCloseTo(200); // 600 × 1/3
    expect(apports.get(3)).toBeUndefined();
  });

  it('limite la ventilation à un chapitre (entre 2 sections)', () => {
    const lignes: LigneVentilable[] = [
      ligne(0, 'section'), // CHAP A
      ligne(1, 'libre', 1, 100),
      ligne(2, 'libre', 1, 100),
      ligne(3, 'section'), // CHAP B
      ligne(4, 'libre', 1, 100),
    ];
    const postes: PosteInterneVentilable[] = [
      {
        montantHt: '200',
        portee: 'chapitre',
        chapitreOrdre: 0,
        repartitions: [],
      },
    ];
    const apports = calculerVentilation(lignes, postes);
    expect(apports.get(1)).toBeCloseTo(100);
    expect(apports.get(2)).toBeCloseTo(100);
    expect(apports.get(4)).toBeUndefined(); // hors chapitre A
  });

  it('cumule plusieurs postes internes sur la même ligne', () => {
    const lignes: LigneVentilable[] = [ligne(0, 'libre', 1, 100), ligne(1, 'libre', 1, 100)];
    const postes: PosteInterneVentilable[] = [
      { montantHt: '100', portee: 'devis', chapitreOrdre: null, repartitions: [] },
      { montantHt: '50', portee: 'devis', chapitreOrdre: null, repartitions: [] },
    ];
    const apports = calculerVentilation(lignes, postes);
    expect(apports.get(0)).toBeCloseTo(75); // (100 + 50) / 2
    expect(apports.get(1)).toBeCloseTo(75);
  });

  it('ignore un poste interne dont le scope est vide', () => {
    const lignes: LigneVentilable[] = [ligne(0, 'libre', 1, 100)];
    const postes: PosteInterneVentilable[] = [
      {
        montantHt: '500',
        portee: 'chapitre',
        chapitreOrdre: 99, // n’existe pas
        repartitions: [],
      },
    ];
    const apports = calculerVentilation(lignes, postes);
    expect(apports.size).toBe(0);
  });

  it('ignore un poste interne dont la somme des poids est nulle', () => {
    const lignes: LigneVentilable[] = [ligne(0, 'libre', 1, 100), ligne(1, 'libre', 1, 100)];
    const postes: PosteInterneVentilable[] = [
      {
        montantHt: '200',
        portee: 'devis',
        chapitreOrdre: null,
        repartitions: [
          { ordreLigne: 0, poids: '0' },
          { ordreLigne: 1, poids: '0' },
        ],
      },
    ];
    const apports = calculerVentilation(lignes, postes);
    expect(apports.size).toBe(0);
  });
});

describe('calculerApportLigne', () => {
  it('combine PU nu + apport pour donner le PU effectif', () => {
    const l = ligne(0, 'libre', 10, 100); // base 1000
    const res = calculerApportLigne(l, 200);
    expect(res.apportHt).toBe(200);
    expect(res.prixUnitaireEffectifHt).toBeCloseTo(120); // 100 + 200/10
    expect(res.montantEffectifHt).toBeCloseTo(1200);
  });

  it('applique la remise après ventilation', () => {
    const l = ligne(0, 'libre', 10, 100, 10);
    const res = calculerApportLigne(l, 200);
    expect(res.prixUnitaireEffectifHt).toBeCloseTo(120);
    expect(res.montantEffectifHt).toBeCloseTo(1200 * 0.9);
  });

  it('renvoie zéro pour une section', () => {
    const res = calculerApportLigne(ligne(0, 'section'), 100);
    expect(res.apportHt).toBe(0);
    expect(res.montantEffectifHt).toBe(0);
  });
});

describe('chapitreInvalide', () => {
  it('vrai si l’ordre ne pointe pas sur une section existante', () => {
    const lignes = [ligne(0, 'section'), ligne(1, 'libre', 1, 1)];
    expect(chapitreInvalide(lignes, 99)).toBe(true);
    expect(chapitreInvalide(lignes, 1)).toBe(true); // pas une section
    expect(chapitreInvalide(lignes, 0)).toBe(false);
  });
});
