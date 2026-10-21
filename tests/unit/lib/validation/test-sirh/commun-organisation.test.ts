import { describe, expect, it } from 'vitest';

import {
  codePostalOptionnel,
  dateOptionnelle,
  decimalOptionnel,
  decimalRequis,
  decisionSchema,
  emailOptionnel,
  entierOptionnel,
  heureOptionnelle,
  heureRequise,
  montantOptionnel,
  texteOptionnel,
  texteRequis,
  uuidOptionnel,
} from '@/lib/validation/test-sirh/commun';
import { siteSchema } from '@/lib/validation/test-sirh/organisation';

const UUID = '3f2b8c1e-6d4a-4e7b-9a1c-2b3c4d5e6f70';

describe('helpers Zod communs', () => {
  it('texte requis / optionnel', () => {
    expect(texteRequis('Nom', 5).safeParse('  Abc ').data).toBe('Abc');
    expect(texteRequis('Nom', 5).safeParse('').success).toBe(false);
    expect(texteRequis('Nom', 5).safeParse('abcdef').success).toBe(false);
    expect(texteOptionnel(10).parse('  ')).toBeNull();
    expect(texteOptionnel(10).parse(null)).toBeNull();
  });

  it('dates, heures et UUID optionnels', () => {
    expect(dateOptionnelle.parse('')).toBeNull();
    expect(dateOptionnelle.parse('2026-10-19')).toBe('2026-10-19');
    expect(dateOptionnelle.safeParse('19/10/2026').success).toBe(false);
    expect(heureRequise.parse('07:30:00')).toBe('07:30');
    expect(heureRequise.safeParse('24:00').success).toBe(false);
    expect(heureOptionnelle.parse('')).toBeNull();
    expect(uuidOptionnel.parse('')).toBeNull();
    expect(uuidOptionnel.parse(UUID)).toBe(UUID);
    expect(uuidOptionnel.safeParse('pas-un-uuid').success).toBe(false);
  });

  it('décimaux, montants et entiers', () => {
    expect(decimalOptionnel('Qté').parse('2,5')).toBe('2.50');
    expect(decimalOptionnel('Qté', { decimales: 1 }).parse('2,55')).toBe('2.5');
    expect(decimalOptionnel('Qté').parse('')).toBeNull();
    expect(decimalOptionnel('Qté', { strictementPositif: true }).safeParse('0').success).toBe(
      false,
    );
    expect(decimalRequis('Durée').safeParse('').success).toBe(false);
    expect(decimalRequis('Durée', { max: 24 }).safeParse('25').success).toBe(false);
    expect(montantOptionnel('Montant').parse('1 234,5')).toBe('1234.50');
    expect(montantOptionnel('Montant').safeParse('-1').success).toBe(false);
    expect(entierOptionnel('Note', { min: 1, max: 5 }).parse('3')).toBe(3);
    expect(entierOptionnel('Note', { min: 1, max: 5 }).safeParse('6').success).toBe(false);
    expect(entierOptionnel('Note').safeParse('2.5').success).toBe(false);
  });

  it('email et code postal optionnels', () => {
    expect(emailOptionnel.parse('')).toBeNull();
    expect(emailOptionnel.parse('rh@exemple.fr')).toBe('rh@exemple.fr');
    expect(emailOptionnel.safeParse('pas-un-email').success).toBe(false);
    expect(codePostalOptionnel.parse('69003')).toBe('69003');
    expect(codePostalOptionnel.safeParse('6900').success).toBe(false);
  });

  it('décision sur une demande', () => {
    expect(
      decisionSchema.safeParse({ id: UUID, decision: 'approuver', commentaire: '' }).success,
    ).toBe(true);
    expect(
      decisionSchema.safeParse({ id: UUID, decision: 'peut-être', commentaire: null }).success,
    ).toBe(false);
  });
});

describe('siteSchema', () => {
  const valide = {
    code: 'LYO',
    nom: 'Agence de Lyon',
    typeSite: 'agence',
    adresseLigne1: '12 rue des Bâtisseurs',
    adresseLigne2: null,
    codePostal: '69003',
    ville: 'Lyon',
    pays: 'France',
    telephone: null,
    actif: true,
    notes: null,
  };

  it('accepte un site complet', () => {
    expect(siteSchema.safeParse(valide).success).toBe(true);
  });

  it('refuse un nom vide, un type inconnu ou un code postal invalide', () => {
    expect(siteSchema.safeParse({ ...valide, nom: '' }).success).toBe(false);
    expect(siteSchema.safeParse({ ...valide, typeSite: 'usine' }).success).toBe(false);
    expect(siteSchema.safeParse({ ...valide, codePostal: 'ABCDE' }).success).toBe(false);
  });
});
