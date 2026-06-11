import { describe, expect, it } from 'vitest';

import type {
  ComposantLigneInput,
  LigneDevisInput,
  PosteInterneFormInput,
} from '@/lib/validation/commercial';

import { calculerMontantLigne, calculerPuDepuisComposants, calculerTotauxDevis } from './calculs';

const UUID_A = '00000000-0000-4000-8000-00000000000a';
const UUID_B = '00000000-0000-4000-8000-00000000000b';

const UUID = '00000000-0000-4000-8000-000000000001';

describe('calculerMontantLigne', () => {
  it('section : tout est null', () => {
    const r = calculerMontantLigne({
      type: 'section',
      designation: 'Gros œuvre',
      articleId: null,
      quantite: null,
      unite: null,
      prixUnitaireHt: null,
      tauxTva: null,
      remisePourcent: null,
      notes: null,
    } as LigneDevisInput);
    expect(r.montantHt).toBeNull();
    expect(r.montantTva).toBeNull();
    expect(r.montantTtc).toBeNull();
  });

  it('article catalogue : qty × pu + TVA', () => {
    const r = calculerMontantLigne({
      type: 'article_catalogue',
      articleId: UUID,
      designation: 'Mur agglo',
      quantite: '12',
      unite: 'm²',
      prixUnitaireHt: '55.75',
      tauxTva: '20.00',
      remisePourcent: '0',
      notes: null,
    } as LigneDevisInput);
    expect(r.montantHt).toBe('669.00');
    expect(r.montantTva).toBe('133.80');
    expect(r.montantTtc).toBe('802.80');
  });

  it('ligne libre avec remise', () => {
    const r = calculerMontantLigne({
      type: 'libre',
      articleId: null,
      designation: 'Forfait',
      quantite: '1',
      unite: 'forf.',
      prixUnitaireHt: '100.00',
      tauxTva: '10.00',
      remisePourcent: '20',
      notes: null,
    } as LigneDevisInput);
    expect(r.montantHt).toBe('80.00');
    expect(r.montantTva).toBe('8.00');
    expect(r.montantTtc).toBe('88.00');
  });
});

describe('calculerPuDepuisComposants', () => {
  it('retourne null si aucun composant', () => {
    expect(calculerPuDepuisComposants([])).toBeNull();
  });

  it('somme Σ (qte_par_unite × pu) sur les composants', () => {
    const composants: ComposantLigneInput[] = [
      {
        type: 'article_catalogue',
        articleId: UUID_A,
        designation: null,
        quantiteParUnite: '12',
        prixUnitaireHt: '2.50',
        tauxTva: null,
        remisePourcent: null,
        notes: null,
      },
      {
        type: 'article_catalogue',
        articleId: UUID_B,
        designation: null,
        quantiteParUnite: '0.8',
        prixUnitaireHt: '35.00',
        tauxTva: null,
        remisePourcent: null,
        notes: null,
      },
    ];
    expect(calculerPuDepuisComposants(composants)).toBe('58.00'); // 30 + 28
  });

  it('ignore les composants avec valeurs non finies', () => {
    const composants: ComposantLigneInput[] = [
      {
        type: 'article_catalogue',
        articleId: UUID_A,
        designation: null,
        quantiteParUnite: 'NaN',
        prixUnitaireHt: '10',
        tauxTva: null,
        remisePourcent: null,
        notes: null,
      },
      {
        type: 'article_catalogue',
        articleId: UUID_B,
        designation: null,
        quantiteParUnite: '2',
        prixUnitaireHt: '5',
        tauxTva: null,
        remisePourcent: null,
        notes: null,
      },
    ];
    expect(calculerPuDepuisComposants(composants)).toBe('10.00');
  });

  it('mixe composants catalogue et libre', () => {
    const composants: ComposantLigneInput[] = [
      {
        type: 'article_catalogue',
        articleId: UUID_A,
        designation: null,
        quantiteParUnite: '2',
        prixUnitaireHt: '10',
        tauxTva: null,
        remisePourcent: null,
        notes: null,
      },
      {
        type: 'libre',
        articleId: null,
        designation: 'Main d’œuvre ponctuelle',
        quantiteParUnite: '1',
        prixUnitaireHt: '40',
        tauxTva: null,
        remisePourcent: null,
        notes: null,
      },
    ];
    expect(calculerPuDepuisComposants(composants)).toBe('60.00'); // 20 + 40
  });
});

describe('calculerMontantLigne avec composants', () => {
  it('le PU dérivé des composants prime sur le PU saisi manuellement', () => {
    const r = calculerMontantLigne({
      type: 'libre',
      articleId: null,
      designation: 'Mur agglo',
      quantite: '10',
      unite: 'm²',
      prixUnitaireHt: '999', // ignoré
      tauxTva: '20.00',
      remisePourcent: '0',
      notes: null,
      composants: [
        {
          type: 'article_catalogue',
          articleId: UUID_A,
          designation: null,
          quantiteParUnite: '12',
          prixUnitaireHt: '2',
          tauxTva: null,
          remisePourcent: null,
          notes: null,
        },
      ],
    } as LigneDevisInput);
    // PU dérivé = 24, qté 10 → HT 240.
    expect(r.montantHt).toBe('240.00');
    expect(r.montantTva).toBe('48.00');
  });
});

describe('calculerTotauxDevis', () => {
  it('ventile correctement par taux de TVA', () => {
    const lignes: LigneDevisInput[] = [
      {
        type: 'article_catalogue',
        articleId: UUID,
        designation: 'Rénovation 10%',
        quantite: '100',
        unite: 'm²',
        prixUnitaireHt: '50',
        tauxTva: '10.00',
        remisePourcent: '0',
        notes: null,
      } as LigneDevisInput,
      {
        type: 'libre',
        articleId: null,
        designation: 'Neuf 20%',
        quantite: '1',
        unite: 'forf.',
        prixUnitaireHt: '1000',
        tauxTva: '20.00',
        remisePourcent: '0',
        notes: null,
      } as LigneDevisInput,
      {
        type: 'section',
        designation: 'Section ignorée',
        articleId: null,
        quantite: null,
        unite: null,
        prixUnitaireHt: null,
        tauxTva: null,
        remisePourcent: null,
        notes: null,
      } as LigneDevisInput,
    ];
    const r = calculerTotauxDevis(lignes);
    expect(r.totalHt).toBe('6000.00');
    expect(r.totalTva).toBe('700.00'); // 500 (10%) + 200 (20%)
    expect(r.totalTtc).toBe('6700.00');
    expect(r.detailsTva['10.00']).toEqual({ base: '5000.00', tva: '500.00' });
    expect(r.detailsTva['20.00']).toEqual({ base: '1000.00', tva: '200.00' });
  });

  it('ventile un poste interne sur les lignes : total HT all-in client', () => {
    const lignes: LigneDevisInput[] = [
      {
        type: 'libre',
        articleId: null,
        designation: 'Article A',
        quantite: '10',
        unite: 'u',
        prixUnitaireHt: '100',
        tauxTva: '20.00',
        remisePourcent: '0',
        notes: null,
      } as LigneDevisInput,
      {
        type: 'libre',
        articleId: null,
        designation: 'Article B',
        quantite: '5',
        unite: 'u',
        prixUnitaireHt: '200',
        tauxTva: '20.00',
        remisePourcent: '0',
        notes: null,
      } as LigneDevisInput,
    ];
    const postes: PosteInterneFormInput[] = [
      {
        portee: 'devis',
        chapitreOrdre: null,
        libelle: 'Frais généraux',
        montantHt: '400',
        notes: null,
        repartitions: [],
      },
    ];
    // Base : 1000 + 1000 = 2000. + 400 (frais) ventilés → 2400 HT client.
    const r = calculerTotauxDevis(lignes, postes);
    expect(r.totalHt).toBe('2400.00');
    expect(r.totalTva).toBe('480.00'); // 20 % sur 2400
    expect(r.totalTtc).toBe('2880.00');
  });

  it('pondération manuelle : seules les lignes pondérées reçoivent l’apport', () => {
    const lignes: LigneDevisInput[] = [
      {
        type: 'libre',
        articleId: null,
        designation: 'A',
        quantite: '1',
        unite: 'u',
        prixUnitaireHt: '100',
        tauxTva: '20.00',
        remisePourcent: '0',
        notes: null,
      } as LigneDevisInput,
      {
        type: 'libre',
        articleId: null,
        designation: 'B',
        quantite: '1',
        unite: 'u',
        prixUnitaireHt: '100',
        tauxTva: '20.00',
        remisePourcent: '0',
        notes: null,
      } as LigneDevisInput,
    ];
    const postes: PosteInterneFormInput[] = [
      {
        portee: 'devis',
        chapitreOrdre: null,
        libelle: 'Marge ciblée',
        montantHt: '100',
        notes: null,
        // Seule la ligne 0 reçoit l'apport
        repartitions: [{ ordreLigne: 0, poids: '1' }],
      },
    ];
    const r = calculerTotauxDevis(lignes, postes);
    // Ligne 0 : 100 + 100 = 200 ; Ligne 1 : 100 inchangé. Total 300.
    expect(r.totalHt).toBe('300.00');
  });

  it('devis vide ou section seule : tous zéros', () => {
    const r = calculerTotauxDevis([
      {
        type: 'section',
        designation: 'X',
        articleId: null,
        quantite: null,
        unite: null,
        prixUnitaireHt: null,
        tauxTva: null,
        remisePourcent: null,
        notes: null,
      } as LigneDevisInput,
    ]);
    expect(r.totalHt).toBe('0.00');
    expect(r.totalTva).toBe('0.00');
    expect(r.totalTtc).toBe('0.00');
    expect(Object.keys(r.detailsTva)).toHaveLength(0);
  });
});

describe('override TVA/remise per composant libre', () => {
  it('un composant libre avec tauxTva override crée un bucket TVA distinct', () => {
    const ligne: LigneDevisInput = {
      type: 'libre',
      articleId: null,
      designation: 'Ligne mixte TVA',
      quantite: '1',
      unite: 'forf.',
      prixUnitaireHt: '0',
      tauxTva: '20.00',
      remisePourcent: '0',
      notes: null,
      composants: [
        // Matériaux : hérite TVA 20% de la ligne → 100€ HT, 20€ TVA
        {
          type: 'libre',
          articleId: null,
          designation: 'Matériaux',
          quantiteParUnite: '1',
          prixUnitaireHt: '100',
          tauxTva: null,
          remisePourcent: null,
          notes: null,
        },
        // Main d'œuvre : override TVA 10% → 200€ HT, 20€ TVA
        {
          type: 'libre',
          articleId: null,
          designation: 'Main d’œuvre',
          quantiteParUnite: '1',
          prixUnitaireHt: '200',
          tauxTva: '10.00',
          remisePourcent: null,
          notes: null,
        },
      ],
    } as LigneDevisInput;

    const r = calculerTotauxDevis([ligne]);
    expect(r.totalHt).toBe('300.00');
    expect(r.totalTva).toBe('40.00'); // 20 (mat 20%) + 20 (MO 10%)
    expect(r.detailsTva['20.00']).toEqual({ base: '100.00', tva: '20.00' });
    expect(r.detailsTva['10.00']).toEqual({ base: '200.00', tva: '20.00' });
  });

  it('un composant libre avec remise override applique sa propre remise', () => {
    const ligne: LigneDevisInput = {
      type: 'libre',
      articleId: null,
      designation: 'Ligne avec remise mixte',
      quantite: '1',
      unite: 'forf.',
      prixUnitaireHt: '0',
      tauxTva: '20.00',
      remisePourcent: '0', // ligne sans remise
      notes: null,
      composants: [
        // Composant sans override : 100€ HT (remise 0% héritée)
        {
          type: 'libre',
          articleId: null,
          designation: 'Sans remise',
          quantiteParUnite: '1',
          prixUnitaireHt: '100',
          tauxTva: null,
          remisePourcent: null,
          notes: null,
        },
        // Composant avec remise 50% override : 200 × 0.5 = 100€ HT
        {
          type: 'libre',
          articleId: null,
          designation: 'Avec remise 50%',
          quantiteParUnite: '1',
          prixUnitaireHt: '200',
          tauxTva: null,
          remisePourcent: '50',
          notes: null,
        },
      ],
    } as LigneDevisInput;

    const r = calculerMontantLigne(ligne);
    expect(r.montantHt).toBe('200.00'); // 100 + 100
    expect(r.montantTva).toBe('40.00'); // 20% sur 200
  });

  it('composant catalogue ignore tauxTva/remisePourcent même définis', () => {
    // Garde-fou : seul le composant libre supporte les overrides.
    const ligne: LigneDevisInput = {
      type: 'libre',
      articleId: null,
      designation: 'Catalogue n’override jamais',
      quantite: '1',
      unite: 'forf.',
      prixUnitaireHt: '0',
      tauxTva: '20.00',
      remisePourcent: '0',
      notes: null,
      composants: [
        // Forcer tauxTva ≠ null sur un catalogue (cas DB/test corrompu) :
        // le calcul doit ignorer et utiliser celui de la ligne.
        {
          type: 'article_catalogue',
          articleId: UUID_A,
          designation: null,
          quantiteParUnite: '1',
          prixUnitaireHt: '100',
          tauxTva: '10.00' as unknown as null, // bypass type pour test défensif
          remisePourcent: '50' as unknown as null,
          notes: null,
        },
      ],
    } as LigneDevisInput;

    const r = calculerTotauxDevis([ligne]);
    expect(r.totalHt).toBe('100.00'); // pas de remise appliquée
    expect(r.totalTva).toBe('20.00'); // 20% de la ligne, pas 10% override
    expect(r.detailsTva['20.00']).toBeDefined();
    expect(r.detailsTva['10.00']).toBeUndefined();
  });

  it('apport poste interne reste au taux de la ligne, hors override composant', () => {
    const ligne: LigneDevisInput = {
      type: 'libre',
      articleId: null,
      designation: 'Ligne avec composant override + poste interne',
      quantite: '1',
      unite: 'forf.',
      prixUnitaireHt: '0',
      tauxTva: '20.00',
      remisePourcent: '0',
      notes: null,
      composants: [
        {
          type: 'libre',
          articleId: null,
          designation: 'Sous-prestation à 10%',
          quantiteParUnite: '1',
          prixUnitaireHt: '500',
          tauxTva: '10.00',
          remisePourcent: null,
          notes: null,
        },
      ],
    } as LigneDevisInput;
    const postes: PosteInterneFormInput[] = [
      {
        portee: 'devis',
        chapitreOrdre: null,
        libelle: 'Frais généraux',
        montantHt: '100',
        notes: null,
        repartitions: [],
      },
    ];

    const r = calculerTotauxDevis([ligne], postes);
    // Composant : 500 HT @ 10% → 50 TVA. Apport 100 HT @ 20% (ligne) → 20 TVA.
    expect(r.totalHt).toBe('600.00');
    expect(r.detailsTva['10.00']).toEqual({ base: '500.00', tva: '50.00' });
    expect(r.detailsTva['20.00']).toEqual({ base: '100.00', tva: '20.00' });
  });
});
