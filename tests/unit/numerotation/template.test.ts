import { describe, expect, it } from 'vitest';

import {
  cadenceMaxAutoriseePourTemplate,
  cadencesAutorisees,
  formatNumero,
  isCadenceAutorisee,
  parseTemplate,
  TEMPLATES_PAR_DEFAUT,
  TYPES_NUMERO_DOC,
  validerCadence,
  type CadenceReset,
} from '@/lib/numerotation/template';

describe('parseTemplate', () => {
  it('refuse un template vide', () => {
    expect(parseTemplate('')).toEqual({ ok: false, error: expect.any(String) });
    expect(parseTemplate('   ')).toEqual({ ok: false, error: expect.any(String) });
  });

  it('refuse un template sans compteur', () => {
    const r = parseTemplate('D-[@Year]');
    expect(r.ok).toBe(false);
  });

  it('refuse un template avec plusieurs compteurs', () => {
    const r = parseTemplate('D-%03d-%05d');
    expect(r.ok).toBe(false);
  });

  it('extrait le token compteur et sa largeur', () => {
    const r = parseTemplate('CST[@Year][@Month][@Day]%03d');
    expect(r).toMatchObject({ ok: true, compteurToken: '%03d', compteurWidth: 3 });
  });

  it('accepte le compteur sans zero-padding (%5d)', () => {
    const r = parseTemplate('FAC-[@Year]-%5d');
    expect(r).toMatchObject({ ok: true, compteurToken: '%5d', compteurWidth: 5 });
  });

  it.each<[string, CadenceReset]>([
    ['CST[@Year][@Month][@Day]%03d', 'jour'],
    ['M[@Year][@Month]%04d', 'mois'],
    ['D-[@Year]-%06d', 'annee'],
    ['D-[@Year2]/%06d', 'annee'],
    ['UNIQUE-%09d', 'jamais'],
  ])('expose la cadence la plus fine autorisée pour %s → %s', (template, attendu) => {
    const r = parseTemplate(template);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.cadenceMaxAutorisee).toBe(attendu);
  });
});

describe('cadenceMaxAutoriseePourTemplate', () => {
  it('priorise [@Day] > [@Month] > [@Year]/[@Year2] > jamais', () => {
    expect(cadenceMaxAutoriseePourTemplate('X-[@Day]-%03d')).toBe('jour');
    expect(cadenceMaxAutoriseePourTemplate('X-[@Month]-%03d')).toBe('mois');
    expect(cadenceMaxAutoriseePourTemplate('X-[@Year]-%03d')).toBe('annee');
    expect(cadenceMaxAutoriseePourTemplate('X-[@Year2]-%03d')).toBe('annee');
    expect(cadenceMaxAutoriseePourTemplate('X-%03d')).toBe('jamais');
  });

  it('garde la cadence la plus fine quand plusieurs tokens présents', () => {
    expect(cadenceMaxAutoriseePourTemplate('[@Year][@Month][@Day]%03d')).toBe('jour');
    expect(cadenceMaxAutoriseePourTemplate('[@Year][@Month]%03d')).toBe('mois');
  });
});

describe('isCadenceAutorisee / validerCadence', () => {
  it('autorise toujours « jamais »', () => {
    expect(isCadenceAutorisee('X-%03d', 'jamais')).toBe(true);
    expect(isCadenceAutorisee('X-[@Day]-%03d', 'jamais')).toBe(true);
  });

  it('cadence jour exige [@Day]', () => {
    expect(isCadenceAutorisee('X-[@Day]-%03d', 'jour')).toBe(true);
    expect(isCadenceAutorisee('X-[@Month]-%03d', 'jour')).toBe(false);
    expect(isCadenceAutorisee('X-%03d', 'jour')).toBe(false);
  });

  it('cadence mois exige [@Month] ou [@Day]', () => {
    expect(isCadenceAutorisee('X-[@Month]-%03d', 'mois')).toBe(true);
    expect(isCadenceAutorisee('X-[@Day]-%03d', 'mois')).toBe(true);
    expect(isCadenceAutorisee('X-[@Year]-%03d', 'mois')).toBe(false);
    expect(isCadenceAutorisee('X-%03d', 'mois')).toBe(false);
  });

  it('cadence année exige au moins un token date', () => {
    expect(isCadenceAutorisee('X-[@Year]-%03d', 'annee')).toBe(true);
    expect(isCadenceAutorisee('X-[@Year2]-%03d', 'annee')).toBe(true);
    expect(isCadenceAutorisee('X-[@Month]-%03d', 'annee')).toBe(true);
    expect(isCadenceAutorisee('X-[@Day]-%03d', 'annee')).toBe(true);
    expect(isCadenceAutorisee('X-%03d', 'annee')).toBe(false);
  });

  it('validerCadence renvoie un message explicatif si incohérent', () => {
    const r = validerCadence('X-%03d', 'jour');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain('[@Day]');
  });

  it('cadencesAutorisees renvoie le sous-ensemble valide', () => {
    expect(cadencesAutorisees('X-[@Day]-%03d')).toEqual(['jour', 'mois', 'annee', 'jamais']);
    expect(cadencesAutorisees('X-[@Month]-%03d')).toEqual(['mois', 'annee', 'jamais']);
    expect(cadencesAutorisees('X-[@Year]-%03d')).toEqual(['annee', 'jamais']);
    expect(cadencesAutorisees('X-%03d')).toEqual(['jamais']);
  });
});

describe('formatNumero', () => {
  const date = new Date(2026, 4, 26); // mai = mois 4 (0-indexed) → '05'

  it('reproduit le format historique D-2026-000001', () => {
    expect(formatNumero('D-[@Year]-%06d', 1, date)).toBe('D-2026-000001');
  });

  it("compose CST20260526001 sur l'exemple utilisateur", () => {
    expect(formatNumero('CST[@Year][@Month][@Day]%03d', 1, date)).toBe('CST20260526001');
  });

  it('substitue [@Year2] sur 2 chiffres', () => {
    expect(formatNumero('FAC[@Year2]/%05d', 42, date)).toBe('FAC26/00042');
  });

  it('zero-pad le compteur à la largeur demandée', () => {
    expect(formatNumero('X-%04d', 7, date)).toBe('X-0007');
    expect(formatNumero('X-%01d', 9, date)).toBe('X-9');
  });

  it('substitue plusieurs occurrences du même token', () => {
    expect(formatNumero('[@Year]/[@Year]/%03d', 5, date)).toBe('2026/2026/005');
  });

  it('laisse le template inchangé si parseTemplate échoue', () => {
    expect(formatNumero('invalide', 1, date)).toBe('invalide');
  });

  it('reflète une grande valeur de compteur (overflow de la largeur)', () => {
    expect(formatNumero('Z-%03d', 12345, date)).toBe('Z-12345');
  });
});

describe('TEMPLATES_PAR_DEFAUT', () => {
  it('couvre tous les TYPES_NUMERO_DOC', () => {
    for (const type of TYPES_NUMERO_DOC) {
      expect(TEMPLATES_PAR_DEFAUT[type]).toBeDefined();
      const parsed = parseTemplate(TEMPLATES_PAR_DEFAUT[type]);
      expect(parsed.ok).toBe(true);
    }
  });

  it('tous les défauts autorisent une cadence annuelle (compat ascendante)', () => {
    for (const type of TYPES_NUMERO_DOC) {
      const r = parseTemplate(TEMPLATES_PAR_DEFAUT[type]);
      expect(r.ok).toBe(true);
      if (r.ok) expect(r.cadenceMaxAutorisee).toBe('annee');
    }
  });
});
