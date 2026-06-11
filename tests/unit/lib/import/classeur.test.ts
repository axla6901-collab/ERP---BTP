import { describe, expect, it } from 'vitest';
import * as XLSX from 'xlsx';

import { lireClasseur, lireClasseurBytes, ClasseurFormatError } from '@/lib/import/classeur';

function xlsxBufferBase64(aoa: (string | number | null)[][], nom = 'Feuille'): string {
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(aoa), nom);
  return (XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }) as Buffer).toString('base64');
}

describe('lireClasseur — CSV', () => {
  it('parse un CSV « ; » (Excel FR), garde les valeurs en string, vide → null', async () => {
    const b64 = Buffer.from('Code;Libellé;Prix\nPLQ;Plaque BA13;4,5\n;;', 'utf8').toString(
      'base64',
    );
    const c = await lireClasseur(b64, 'tarif.csv');
    const data = c.feuille(c.sheetNames[0]!);
    expect(data[0]).toEqual(['Code', 'Libellé', 'Prix']);
    expect(data[1]).toEqual(['PLQ', 'Plaque BA13', '4,5']);
    expect(data[2]).toEqual([null, null, null]);
  });

  it('détecte le séparateur « , » quand il domine', async () => {
    const b64 = Buffer.from('a,b,c\n1,2,3', 'utf8').toString('base64');
    const c = await lireClasseur(b64, 'x.csv');
    expect(c.feuille(c.sheetNames[0]!)[1]).toEqual(['1', '2', '3']);
  });

  it('gère les champs entre guillemets (séparateur interne + guillemet échappé)', async () => {
    const b64 = Buffer.from('a;"b;c";d\n"e""f";g;h', 'utf8').toString('base64');
    const data = (await lireClasseur(b64, 'x.csv')).feuille('Feuille1');
    expect(data[0]).toEqual(['a', 'b;c', 'd']);
    expect(data[1]).toEqual(['e"f', 'g', 'h']);
  });

  it('strippe le BOM UTF-8', async () => {
    const buf = Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), Buffer.from('A;B\n1;2', 'utf8')]);
    const c = await lireClasseur(buf.toString('base64'), 'x.csv');
    expect(c.feuille(c.sheetNames[0]!)[0]).toEqual(['A', 'B']);
  });

  it('retombe sur Windows-1252 quand l’UTF-8 échoue (accents Excel FR)', async () => {
    // « Etat;État » encodé en CP1252 (É = 0xC9, invalide en UTF-8).
    const buf = Buffer.from([0x45, 0x74, 0x61, 0x74, 0x3b, 0xc9, 0x74, 0x61, 0x74]);
    const c = await lireClasseur(buf.toString('base64'), 'x.csv');
    expect(c.feuille(c.sheetNames[0]!)[0]).toEqual(['Etat', 'État']);
  });
});

describe('lireClasseur — XLSX', () => {
  it('lit un .xlsx (écrit par xlsx, relu par exceljs) en préservant types et index', async () => {
    const b64 = xlsxBufferBase64(
      [
        ['Code', 'Prix'],
        ['PLQ', 4.5],
      ],
      'Tarif',
    );
    const c = await lireClasseur(b64, 'tarif.xlsx');
    expect(c.sheetNames).toEqual(['Tarif']);
    const data = c.feuille('Tarif');
    expect(data[0]).toEqual(['Code', 'Prix']);
    expect(data[1]).toEqual(['PLQ', 4.5]); // nombre conservé en number, pas en string
  });

  it('préserve les lignes vides en tête (index physique) et l’ordre des feuilles', async () => {
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([['garde']]), 'Garde');
    XLSX.utils.book_append_sheet(
      wb,
      XLSX.utils.aoa_to_sheet([
        [null, null],
        ['EnTete', 'X'],
      ]),
      'Data',
    );
    const b64 = (XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }) as Buffer).toString('base64');
    const c = await lireClasseur(b64, 'f.xlsx');
    expect(c.sheetNames).toEqual(['Garde', 'Data']);
    const data = c.feuille('Data');
    expect(data[0]).toEqual([null, null]); // 1ʳᵉ ligne vide conservée à l’index 0
    expect(data[1]?.[0]).toBe('EnTete'); // en-tête bien à l’index 1
  });

  it('rejette le format .xls avec une ClasseurFormatError', async () => {
    await expect(lireClasseur('', 'vieux.xls')).rejects.toBeInstanceOf(ClasseurFormatError);
  });
});

describe('lireClasseurBytes — détection par octets magiques', () => {
  it('lit un CSV passé en bytes (sans nom de fichier)', async () => {
    const c = await lireClasseurBytes(Buffer.from('A;B\n1;2', 'utf8'));
    expect(c.feuille(c.sheetNames[0]!)).toEqual([
      ['A', 'B'],
      ['1', '2'],
    ]);
  });

  it('lit un .xlsx passé en bytes via la signature ZIP', async () => {
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([['x'], ['1']]), 'F');
    const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }) as Buffer;
    const c = await lireClasseurBytes(buf);
    expect(c.feuille(c.sheetNames[0]!)[0]).toEqual(['x']);
  });

  it('rejette un .xls binaire (signature OLE) avec une ClasseurFormatError', async () => {
    const ole = Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0x00, 0x00, 0x00, 0x00]);
    await expect(lireClasseurBytes(ole)).rejects.toBeInstanceOf(ClasseurFormatError);
  });
});
