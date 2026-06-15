import { describe, expect, it } from 'vitest';

import {
  COLONNES_COPY,
  decoderCsv,
  departementFromInsee,
  normaliserRecherche,
  parseHexasmalCsv,
  versLigneCopy,
  versSeed,
} from '@/lib/geo/codes-postaux-format';

describe('departementFromInsee', () => {
  it('métropole : 2 premiers chiffres', () => {
    expect(departementFromInsee('01001')).toBe('01');
    expect(departementFromInsee('75056')).toBe('75');
    expect(departementFromInsee('69381')).toBe('69');
  });

  it('Corse : conserve 2A / 2B', () => {
    expect(departementFromInsee('2A004')).toBe('2A');
    expect(departementFromInsee('2B033')).toBe('2B');
  });

  it('DOM : 3 premiers caractères', () => {
    expect(departementFromInsee('97411')).toBe('974'); // La Réunion
    expect(departementFromInsee('97209')).toBe('972'); // Martinique
    expect(departementFromInsee('98818')).toBe('988'); // Nouvelle-Calédonie
  });
});

describe('normaliserRecherche', () => {
  it('met en majuscules et retire les accents', () => {
    expect(normaliserRecherche('Saint-Étienne')).toBe('SAINT ETIENNE');
    expect(normaliserRecherche('Nîmes')).toBe('NIMES');
  });

  it('remplace apostrophes et ponctuation par une espace, réduit les espaces', () => {
    expect(normaliserRecherche("L'Abergement-Clémenciat")).toBe('L ABERGEMENT CLEMENCIAT');
    expect(normaliserRecherche('  Aix   en  Provence ')).toBe('AIX EN PROVENCE');
  });

  it('déplie les abréviations La Poste ST/STE et est symétrique', () => {
    expect(normaliserRecherche('ST ETIENNE')).toBe('SAINT ETIENNE');
    expect(normaliserRecherche('Saint-Étienne')).toBe('SAINT ETIENNE');
    expect(normaliserRecherche('STE FOY LES LYON')).toBe('SAINTE FOY LES LYON');
    // « ST » seulement comme token entier : STRASBOURG n'est pas touché.
    expect(normaliserRecherche('Strasbourg')).toBe('STRASBOURG');
  });
});

describe('parseHexasmalCsv', () => {
  const csv = [
    '#Code_commune_INSEE;Nom_de_la_commune;Code_postal;Libellé_d_acheminement;Ligne_5',
    '01001;L ABERGEMENT CLEMENCIAT;01400;L ABERGEMENT CLEMENCIAT;',
    '2A004;AJACCIO;20000;AJACCIO;',
    '13201;MARSEILLE;13001;MARSEILLE 01;LE PANIER',
  ].join('\n');

  it('mappe les colonnes par nom normalisé (tolère # et accents)', () => {
    const lignes = parseHexasmalCsv(csv);
    expect(lignes).toHaveLength(3);
    expect(lignes[0]).toEqual({
      codeCommuneInsee: '01001',
      commune: 'L ABERGEMENT CLEMENCIAT',
      codePostal: '01400',
      libelleAcheminement: 'L ABERGEMENT CLEMENCIAT',
      ligne5: null,
    });
  });

  it('renseigne ligne5 quand présente, sinon null', () => {
    const lignes = parseHexasmalCsv(csv);
    expect(lignes[2]!.ligne5).toBe('LE PANIER');
    expect(lignes[1]!.ligne5).toBeNull();
  });

  it('ignore les lignes sans code postal ou sans code INSEE', () => {
    const avecTrous = [
      '#Code_commune_INSEE;Nom_de_la_commune;Code_postal;Libellé_d_acheminement;Ligne_5',
      ';SANS INSEE;75000;PARIS;',
      '75056;PARIS;;PARIS;',
      '75056;PARIS;75001;PARIS;',
    ].join('\n');
    expect(parseHexasmalCsv(avecTrous)).toHaveLength(1);
  });

  it('détecte le séparateur virgule et les champs entre guillemets', () => {
    const csvVirgule = [
      'code_commune_insee,nom_de_la_commune,code_postal,libelle_d_acheminement,ligne_5',
      '01001,"ABERGEMENT, LE",01400,"ABERGEMENT, LE",',
    ].join('\n');
    const lignes = parseHexasmalCsv(csvVirgule);
    expect(lignes[0]!.commune).toBe('ABERGEMENT, LE');
    expect(lignes[0]!.codePostal).toBe('01400');
  });

  it('lève si une colonne attendue manque', () => {
    expect(() => parseHexasmalCsv('a;b;c\n1;2;3')).toThrow(/colonnes attendues/i);
  });
});

describe('versSeed', () => {
  it('dérive département, recherche dépliée et applique les coordonnées', () => {
    const seed = versSeed(
      {
        codeCommuneInsee: '42218',
        commune: 'ST ETIENNE',
        codePostal: '42000',
        libelleAcheminement: 'ST ETIENNE',
        ligne5: null,
      },
      { latitude: 45.4397, longitude: 4.3872 },
    );
    expect(seed.departement).toBe('42');
    expect(seed.recherche).toBe('SAINT ETIENNE'); // abréviation dépliée
    expect(seed.latitude).toBe(45.4397);
    expect(seed.longitude).toBe(4.3872);
  });

  it('coordonnées null sans enrichissement, libellé replié sur la commune', () => {
    const seed = versSeed({
      codeCommuneInsee: '2A004',
      commune: 'AJACCIO',
      codePostal: '20000',
      libelleAcheminement: '',
      ligne5: null,
    });
    expect(seed.latitude).toBeNull();
    expect(seed.longitude).toBeNull();
    expect(seed.libelleAcheminement).toBe('AJACCIO');
    expect(seed.departement).toBe('2A');
  });
});

describe('versLigneCopy', () => {
  it('produit une ligne TSV avec \\N pour les valeurs nulles, ordre des colonnes figé', () => {
    const ligne = versLigneCopy(
      versSeed({
        codeCommuneInsee: '01001',
        commune: 'L ABERGEMENT CLEMENCIAT',
        codePostal: '01400',
        libelleAcheminement: 'L ABERGEMENT CLEMENCIAT',
        ligne5: null,
      }),
    );
    const champs = ligne.split('\t');
    expect(champs).toHaveLength(COLONNES_COPY.length);
    expect(champs[0]).toBe('01400'); // code_postal
    expect(champs[4]).toBe('\\N'); // ligne_5 nul
    expect(champs[6]).toBe('\\N'); // latitude nulle
    expect(champs[7]).toBe('\\N'); // longitude nulle
  });
});

describe('decoderCsv', () => {
  it('décode un en-tête Latin‑1 (« Libellé », octet 0xE9) sans corruption', () => {
    // "Libellé_d_acheminement" en Latin‑1 : le é vaut l'octet unique 0xE9.
    const octets = Uint8Array.from([
      ...'Libell'.split('').map((c) => c.charCodeAt(0)),
      0xe9,
      ...'_d_acheminement'.split('').map((c) => c.charCodeAt(0)),
    ]);
    expect(decoderCsv(octets)).toBe('Libellé_d_acheminement');
  });

  it('conserve un contenu UTF‑8 valide et retire le BOM', () => {
    const utf8 = new TextEncoder().encode('﻿code_postal;ville\n75001;PARIS');
    expect(decoderCsv(utf8)).toBe('code_postal;ville\n75001;PARIS');
  });

  it('parse correctement un CSV La Poste réel décodé depuis du Latin‑1', () => {
    const ligne = 'LÉZIGNAN'; // accent en data (rare) pour vérifier le bout-en-bout
    const enLatin1 = Uint8Array.from(
      `#Code_commune_INSEE;Nom_de_la_commune;Libellé_d_acheminement;Code_postal;Ligne_5\n11203;${ligne};${ligne};11200;`
        .split('')
        .map((c) => c.charCodeAt(0)),
    );
    const lignes = parseHexasmalCsv(decoderCsv(enLatin1));
    expect(lignes).toHaveLength(1);
    expect(lignes[0]!.codePostal).toBe('11200');
    expect(lignes[0]!.libelleAcheminement).toBe('LÉZIGNAN');
  });
});
