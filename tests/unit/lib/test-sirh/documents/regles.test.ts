import { describe, expect, it } from 'vitest';

import {
  agregerKpiDocuments,
  controleDatesDocument,
  expirantSous,
  limiteExpiration,
  lireFiltresDocuments,
  messageBlocageSuppressionDossier,
  statutExpiration,
  statutSignature,
  urlDocuments,
  valeurFiltreConcerne,
  valeurFiltreDossier,
} from '@/lib/test-sirh/documents/regles';

const UUID = '3f2b8c1e-6d4a-4e7b-9a1c-2b3c4d5e6f70';
const TODAY = '2026-10-19';

describe('statutExpiration', () => {
  it('sans date, expiré, bientôt, valide', () => {
    expect(statutExpiration(null, TODAY)).toBe('sans');
    expect(statutExpiration('2026-10-18', TODAY)).toBe('expire');
    expect(statutExpiration('2026-10-19', TODAY)).toBe('bientot');
    expect(statutExpiration('2026-11-18', TODAY)).toBe('bientot'); // J+30
    expect(statutExpiration('2026-11-19', TODAY)).toBe('valide'); // J+31
    expect(statutExpiration('2026-10-25', TODAY, 5)).toBe('valide');
  });

  it('expirantSous inclut les documents déjà expirés', () => {
    expect(expirantSous('2025-01-01', TODAY)).toBe(true);
    expect(expirantSous('2026-11-01', TODAY)).toBe(true);
    expect(expirantSous('2027-01-01', TODAY)).toBe(false);
    expect(expirantSous(null, TODAY)).toBe(false);
    expect(limiteExpiration(TODAY)).toBe('2026-11-18');
  });
});

describe('signature et dates', () => {
  it('statutSignature', () => {
    expect(statutSignature({ signatureRequise: false, signeLe: null })).toBe('non_requise');
    expect(statutSignature({ signatureRequise: true, signeLe: null })).toBe('a_signer');
    expect(statutSignature({ signatureRequise: true, signeLe: '2026-10-01T08:00:00.000Z' })).toBe(
      'signe',
    );
  });

  it('controleDatesDocument', () => {
    expect(controleDatesDocument('2026-01-01', '2025-12-31')).toMatch(/postérieure/);
    expect(controleDatesDocument('2026-01-01', '2026-01-01')).toBeNull();
    expect(controleDatesDocument(null, '2020-01-01')).toBeNull();
  });
});

describe('messageBlocageSuppressionDossier', () => {
  it('refuse la suppression d’un dossier non vide, sans proposer de « désactiver »', () => {
    expect(messageBlocageSuppressionDossier(0)).toBeNull();
    const m = messageBlocageSuppressionDossier(3);
    expect(m).toBe(
      'Suppression impossible : ce dossier est référencé par 3 documents. Déplacez ou supprimez ses documents d’abord.',
    );
    expect(messageBlocageSuppressionDossier(1)).toMatch(/par 1 document\./);
  });
});

describe('agregerKpiDocuments', () => {
  it('compte total, entreprise, expirés, bientôt et à signer', () => {
    expect(
      agregerKpiDocuments(
        [
          { employeId: UUID, dateExpiration: '2026-10-01', signatureRequise: false, signeLe: null },
          { employeId: UUID, dateExpiration: '2026-10-30', signatureRequise: true, signeLe: null },
          {
            employeId: null,
            dateExpiration: null,
            signatureRequise: true,
            signeLe: '2026-10-02T10:00:00.000Z',
          },
          { employeId: null, dateExpiration: '2027-06-30', signatureRequise: false, signeLe: null },
        ],
        TODAY,
      ),
    ).toEqual({ total: 4, entreprise: 2, expires: 1, bientot: 1, aSigner: 1 });
  });
});

describe('filtres d’URL de la GED', () => {
  it('lit les filtres de dossier et de collaborateur', () => {
    expect(lireFiltresDocuments({})).toEqual({
      dossier: { type: 'tous' },
      concerne: { type: 'tous' },
    });
    expect(lireFiltresDocuments({ dossier: UUID, employe: 'entreprise' })).toEqual({
      dossier: { type: 'dossier', id: UUID },
      concerne: { type: 'entreprise' },
    });
    expect(lireFiltresDocuments({ dossier: 'expirant', employe: UUID })).toEqual({
      dossier: { type: 'expirant' },
      concerne: { type: 'employe', id: UUID },
    });
    expect(lireFiltresDocuments({ dossier: 'sans', employe: 'pas-un-uuid' }).concerne).toEqual({
      type: 'tous',
    });
    expect(lireFiltresDocuments({ dossier: 'pas-un-uuid' }).dossier).toEqual({ type: 'tous' });
  });

  it('valeurs d’URL et construction', () => {
    expect(valeurFiltreDossier({ type: 'tous' })).toBeUndefined();
    expect(valeurFiltreDossier({ type: 'sans' })).toBe('sans');
    expect(valeurFiltreDossier({ type: 'dossier', id: UUID })).toBe(UUID);
    expect(valeurFiltreConcerne({ type: 'entreprise' })).toBe('entreprise');
    expect(valeurFiltreConcerne({ type: 'tous' })).toBeUndefined();
    expect(urlDocuments('/a/test-sirh/documents', {})).toBe('/a/test-sirh/documents');
    expect(urlDocuments('/a/test-sirh/documents', { dossier: 'expirant', employe: UUID })).toBe(
      `/a/test-sirh/documents?dossier=expirant&employe=${UUID}`,
    );
  });
});
