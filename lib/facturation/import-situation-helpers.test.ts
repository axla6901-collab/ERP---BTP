import { describe, expect, it } from 'vitest';

import {
  estLigneTotalOuTva,
  nettoyerNombre,
  normaliserCle,
  normaliserPct,
  ressembleAPosition,
  trouverColonne,
} from './import-situation-helpers';

describe('normaliserCle', () => {
  it('met en minuscules', () => {
    expect(normaliserCle('DESIGNATION')).toBe('designation');
  });

  it('retire les accents', () => {
    expect(normaliserCle('Désignation')).toBe('designation');
    expect(normaliserCle('Quantité')).toBe('quantite');
    expect(normaliserCle('Unité')).toBe('unite');
  });

  it('retire les caractères non alphanumériques', () => {
    expect(normaliserCle('P.U. HT (€)')).toBe('puht');
    expect(normaliserCle('Montant HT - €')).toBe('montantht');
  });

  it('mappe le symbole % vers "pct" pour rester détectable', () => {
    expect(normaliserCle('%')).toBe('pct');
    expect(normaliserCle('% Avancement')).toBe('pctavancement');
    expect(normaliserCle('Avancement %')).toBe('avancementpct');
  });

  it('gère les chaînes vides', () => {
    expect(normaliserCle('')).toBe('');
    expect(normaliserCle('   ')).toBe('');
  });

  it('combine les transformations', () => {
    expect(normaliserCle('Prix Unitaire (€ HT)')).toBe('prixunitaireht');
  });
});

describe('trouverColonne', () => {
  it('retrouve un en-tête exact', () => {
    expect(trouverColonne(['designation', 'quantite'], 'designation')).toBe(0);
    expect(trouverColonne(['designation', 'quantite'], 'quantite')).toBe(1);
  });

  it('retrouve via un alias normalisé', () => {
    // 'libelle' est un alias de designation
    expect(trouverColonne(['Libellé', 'Qté'], 'designation')).toBe(0);
    expect(trouverColonne(['Libellé', 'Qté'], 'quantite')).toBe(1);
  });

  it('retrouve un en-tête avec accents et casse mixte', () => {
    expect(trouverColonne(['Désignation', '% Avancement'], 'pctAvancementCumule')).toBe(1);
  });

  it('retrouve une colonne intitulée juste "%" comme % d’avancement', () => {
    expect(trouverColonne(['Désignation', '%'], 'pctAvancementCumule')).toBe(1);
  });

  it('retrouve une colonne intitulée juste "Q" comme quantité', () => {
    expect(trouverColonne(['Désignation', 'Q'], 'quantite')).toBe(1);
  });

  it('retrouve une colonne de position via ses alias (N°, Repère, Item…)', () => {
    expect(trouverColonne(['N°', 'Désignation'], 'position')).toBe(0);
    expect(trouverColonne(['Repère', 'Désignation'], 'position')).toBe(0);
    expect(trouverColonne(['Item', 'Désignation'], 'position')).toBe(0);
  });

  it('retourne null si la colonne est absente', () => {
    expect(trouverColonne(['Foo', 'Bar'], 'designation')).toBeNull();
  });

  it('retourne le premier index si plusieurs colonnes correspondent', () => {
    // "description" et "designation" sont tous deux des alias de designation
    expect(trouverColonne(['Description', 'Désignation'], 'designation')).toBe(0);
  });

  it('reconnaît tous les alias documentés du prix unitaire', () => {
    expect(trouverColonne(['PU'], 'prixUnitaireHt')).toBe(0);
    expect(trouverColonne(['PU HT'], 'prixUnitaireHt')).toBe(0);
    expect(trouverColonne(['Prix unitaire'], 'prixUnitaireHt')).toBe(0);
    expect(trouverColonne(['UnitPrice'], 'prixUnitaireHt')).toBe(0);
  });
});

describe('nettoyerNombre', () => {
  it('retourne null pour null / undefined / chaîne vide', () => {
    expect(nettoyerNombre(null)).toBeNull();
    expect(nettoyerNombre(undefined)).toBeNull();
    expect(nettoyerNombre('')).toBeNull();
    expect(nettoyerNombre('   ')).toBeNull();
  });

  it('accepte les nombres natifs', () => {
    expect(nettoyerNombre(42)).toBe('42');
    expect(nettoyerNombre(3.14)).toBe('3.14');
    expect(nettoyerNombre(0)).toBe('0');
  });

  it('rejette les nombres non finis', () => {
    expect(nettoyerNombre(NaN)).toBeNull();
    expect(nettoyerNombre(Infinity)).toBeNull();
  });

  it('convertit la virgule décimale française', () => {
    expect(nettoyerNombre('12,50')).toBe('12.5');
    expect(nettoyerNombre('1234,5678')).toBe('1234.5678');
  });

  it('retire les espaces de millier (normaux et insécables)', () => {
    expect(nettoyerNombre('1 234,56')).toBe('1234.56');
    expect(nettoyerNombre('1 234,56')).toBe('1234.56'); // espace insécable
    expect(nettoyerNombre('1 000 000')).toBe('1000000');
  });

  it('retire le symbole pourcent', () => {
    expect(nettoyerNombre('60%')).toBe('60');
    expect(nettoyerNombre('60 %')).toBe('60');
    expect(nettoyerNombre('5,5%')).toBe('5.5');
  });

  it('retourne null si non parsable', () => {
    expect(nettoyerNombre('abc')).toBeNull();
    expect(nettoyerNombre('12abc')).toBeNull();
  });

  it('gère les nombres signés', () => {
    expect(nettoyerNombre('-100')).toBe('-100');
    expect(nettoyerNombre('-12,50')).toBe('-12.5');
  });
});

describe('ressembleAPosition', () => {
  it('vrai pour les positions hiérarchiques BTP', () => {
    expect(ressembleAPosition('2')).toBe(true);
    expect(ressembleAPosition('2.1')).toBe(true);
    expect(ressembleAPosition('2.1.1')).toBe(true);
    expect(ressembleAPosition('3.4.9.12.1.1')).toBe(true);
    expect(ressembleAPosition('2.1.1 ')).toBe(true); // espace final toléré
  });

  it('faux pour les chaînes non hiérarchiques', () => {
    expect(ressembleAPosition('')).toBe(false);
    expect(ressembleAPosition(null)).toBe(false);
    expect(ressembleAPosition(undefined)).toBe(false);
    expect(ressembleAPosition('Fondations')).toBe(false);
    expect(ressembleAPosition('A.1.2')).toBe(false);
    expect(ressembleAPosition('2.1.')).toBe(false);
    expect(ressembleAPosition('.1.2')).toBe(false);
  });

  it('accepte les positions numériques pures (Excel les retourne en number)', () => {
    expect(ressembleAPosition(2)).toBe(true);
    expect(ressembleAPosition(0)).toBe(true);
  });
});

describe('estLigneTotalOuTva', () => {
  it('vrai pour les libellés de sous-totaux et totaux', () => {
    expect(estLigneTotalOuTva('Total FONDATIONS DU COLLECTIF')).toBe(true);
    expect(estLigneTotalOuTva('Total')).toBe(true);
    expect(estLigneTotalOuTva('TOTAL H.T.')).toBe(true);
    expect(estLigneTotalOuTva('Total T.T.C.')).toBe(true);
    expect(estLigneTotalOuTva('Sous-total')).toBe(true);
    expect(estLigneTotalOuTva('Montant HT du Lot N°32 GROS-OEUVRE')).toBe(true);
    expect(estLigneTotalOuTva('Montant TVA (20%)')).toBe(true);
    expect(estLigneTotalOuTva('Montant TTC')).toBe(true);
    expect(estLigneTotalOuTva('TVA 20,00%')).toBe(true);
    expect(estLigneTotalOuTva('TVA 1 (')).toBe(true);
  });

  it('faux pour des libellés d’ouvrages réels (même avec « total » au milieu)', () => {
    expect(estLigneTotalOuTva('Fouilles en trous / puits')).toBe(false);
    expect(estLigneTotalOuTva('Béton pour semelle isolée : XC2 C25/30')).toBe(false);
    expect(estLigneTotalOuTva('')).toBe(false);
  });
});

describe('normaliserPct', () => {
  it('retourne null si entrée null', () => {
    expect(normaliserPct(null)).toBeNull();
  });

  it('multiplie par 100 si la valeur est entre 0 et 1 (fraction Excel)', () => {
    expect(normaliserPct('0.6')).toBe('60');
    expect(normaliserPct('0.05')).toBe('5');
    expect(normaliserPct('1')).toBe('100');
  });

  it('laisse inchangé si > 1 (déjà en pourcent)', () => {
    expect(normaliserPct('60')).toBe('60');
    expect(normaliserPct('100')).toBe('100');
    expect(normaliserPct('5.5')).toBe('5.5');
  });

  it('laisse 0 inchangé', () => {
    expect(normaliserPct('0')).toBe('0');
  });

  it('laisse la chaîne inchangée si non numérique (laisse le caller détecter)', () => {
    expect(normaliserPct('abc')).toBe('abc');
  });
});
