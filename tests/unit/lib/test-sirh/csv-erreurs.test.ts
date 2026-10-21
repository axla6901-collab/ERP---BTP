import { describe, expect, it } from 'vitest';

import { echapperCellule, genererCsv, nomFichierCsv } from '@/lib/test-sirh/csv';
import { codeErreurPg, contrainteErreurPg, messageErreurContrainte } from '@/lib/test-sirh/erreurs';

describe('csv', () => {
  it('échappe les cellules selon la RFC 4180 (séparateur ;)', () => {
    expect(echapperCellule('simple')).toBe('simple');
    expect(echapperCellule('a;b')).toBe('"a;b"');
    expect(echapperCellule('dit "bonjour"')).toBe('"dit ""bonjour"""');
    expect(echapperCellule(' espace')).toBe('" espace"');
    expect(echapperCellule(12.5)).toBe('12,5');
    expect(echapperCellule(null)).toBe('');
  });

  it('génère entête + lignes en CRLF avec BOM par défaut', () => {
    const csv = genererCsv(
      [
        { entete: 'Nom', valeur: (l: { nom: string; h: number }) => l.nom },
        { entete: 'Heures', valeur: (l) => l.h },
      ],
      [
        { nom: 'Dubois', h: 7.5 },
        { nom: 'Martin', h: 8 },
      ],
    );
    expect(csv.startsWith('﻿')).toBe(true);
    expect(csv.slice(1).split('\r\n')).toEqual(['Nom;Heures', 'Dubois;7,5', 'Martin;8']);
    expect(genererCsv([{ entete: 'A', valeur: () => 1 }], [], { bom: false })).toBe('A');
  });

  it('produit un nom de fichier sûr', () => {
    expect(nomFichierCsv('Registre du personnel — 2026')).toBe('registre-du-personnel-2026.csv');
    expect(nomFichierCsv('***')).toBe('export.csv');
  });
});

describe('erreurs Postgres', () => {
  const pg = (code: string) => ({ code, constraint_name: 'uq_x' });

  it('lit le SQLSTATE directement ou dans la cause (DrizzleQueryError)', () => {
    expect(codeErreurPg(pg('23505'))).toBe('23505');
    expect(codeErreurPg({ message: 'Failed query', cause: pg('23503') })).toBe('23503');
    expect(codeErreurPg(new Error('x'))).toBeNull();
    expect(codeErreurPg(null)).toBeNull();
    expect(contrainteErreurPg({ cause: pg('23505') })).toBe('uq_x');
  });

  it('traduit les violations connues, null sinon', () => {
    expect(messageErreurContrainte(pg('23505'), { unicite: 'Doublon.' })).toBe('Doublon.');
    expect(messageErreurContrainte(pg('23503'))).toMatch(/introuvable/);
    expect(messageErreurContrainte(pg('23514'))).toMatch(/incohérentes/);
    expect(messageErreurContrainte(pg('42P01'))).toBeNull();
    expect(messageErreurContrainte(new Error('boom'))).toBeNull();
  });
});
