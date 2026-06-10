import { describe, expect, it } from 'vitest';

import {
  CHAMPS_SENSIBLES_PAR_TABLE,
  MARQUEUR_CAVIARDAGE,
  caviarderChampsSensibles,
} from '@/lib/audit/redaction';

describe('caviarderChampsSensibles', () => {
  it('masque les champs sensibles d\'une ligne employes', () => {
    const before = {
      id: 'e1',
      nom: 'Dupont',
      numeroSecu: '2806990412345',
      iban: 'FR7630006000011234567890189',
      bic: 'BNPAFRPP',
      salaireMensuelBrut: '2500.00',
      tauxHoraireBrut: '18.50',
    };
    const out = caviarderChampsSensibles('employes', before) as Record<string, unknown>;

    expect(out.nom).toBe('Dupont'); // non sensible : intact
    expect(out.numeroSecu).toBe(MARQUEUR_CAVIARDAGE);
    expect(out.iban).toBe(MARQUEUR_CAVIARDAGE);
    expect(out.bic).toBe(MARQUEUR_CAVIARDAGE);
    expect(out.salaireMensuelBrut).toBe(MARQUEUR_CAVIARDAGE);
    expect(out.tauxHoraireBrut).toBe(MARQUEUR_CAVIARDAGE);
  });

  it('masque iban/bic d\'une ligne entreprises', () => {
    const out = caviarderChampsSensibles('entreprises', {
      raisonSociale: 'ACME',
      iban: 'FR76...',
      bic: 'BNPAFRPP',
      siret: '12345678901234',
    }) as Record<string, unknown>;

    expect(out.raisonSociale).toBe('ACME');
    expect(out.siret).toBe('12345678901234'); // SIRET = donnée publique, non masquée
    expect(out.iban).toBe(MARQUEUR_CAVIARDAGE);
    expect(out.bic).toBe(MARQUEUR_CAVIARDAGE);
  });

  it('laisse les valeurs null/undefined intactes (pas de faux positif dans le diff)', () => {
    const before = { numeroSecu: null, iban: undefined, bic: 'BNPAFRPP' };
    const out = caviarderChampsSensibles('employes', before) as Record<string, unknown>;
    expect(out.numeroSecu).toBeNull();
    expect(out.iban).toBeUndefined();
    expect(out.bic).toBe(MARQUEUR_CAVIARDAGE);
  });

  it('renvoie l\'objet d\'origine si aucun champ sensible n\'est présent', () => {
    const payload = { nom: 'Dupont', ville: 'Lyon' };
    expect(caviarderChampsSensibles('employes', payload)).toBe(payload);
  });

  it('ne mute pas l\'objet source', () => {
    const before = { numeroSecu: '2806990412345', nom: 'Dupont' };
    caviarderChampsSensibles('employes', before);
    expect(before.numeroSecu).toBe('2806990412345');
  });

  it('ignore les tables hors périmètre', () => {
    const payload = { iban: 'FR76...', numeroSecu: '123' };
    expect(caviarderChampsSensibles('clients', payload)).toBe(payload);
  });

  it('passe-plat pour les valeurs non-objet (null, primitives, tableaux)', () => {
    expect(caviarderChampsSensibles('employes', null)).toBeNull();
    expect(caviarderChampsSensibles('employes', 'texte')).toBe('texte');
    const arr = [{ iban: 'x' }];
    expect(caviarderChampsSensibles('employes', arr)).toBe(arr);
  });

  it('le registre couvre exactement les colonnes chiffrées attendues', () => {
    expect(CHAMPS_SENSIBLES_PAR_TABLE.employes).toEqual([
      'numeroSecu',
      'iban',
      'bic',
      'salaireMensuelBrut',
      'tauxHoraireBrut',
    ]);
    expect(CHAMPS_SENSIBLES_PAR_TABLE.entreprises).toEqual(['iban', 'bic']);
  });
});
