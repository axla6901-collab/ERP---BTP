import { describe, expect, it } from 'vitest';

import {
  calculerRangCascade,
  calculerSyntheseConformite,
  decrireEvenementSousTraitant,
  formaterDateFr,
  MAX_NIVEAUX_CASCADE,
  type DocumentConformite,
  type SyntheseConformiteInput,
} from '@/lib/sous-traitance/fiche-synthese';

const TODAY = '2026-06-15';

/**
 * Construit une entrée de synthèse à partir d'options lisibles. `'absent'` retire
 * la pièce ; une date (ou `null`) renseigne son `dateValidite`. La conformité est
 * désormais **dérivée des pièces** (zone Vigilance) + les qualifications.
 */
function input(
  opts: {
    decennale?: string | null | 'absent';
    urssaf?: string | null | 'absent';
    contrat?: boolean;
    qualifications?: string[];
  } = {},
): SyntheseConformiteInput {
  const {
    decennale = '2027-01-01',
    urssaf = '2026-12-02',
    contrat = true,
    qualifications = ['Qualibat 1234', 'RGE'],
  } = opts;
  const documents: DocumentConformite[] = [];
  if (decennale !== 'absent')
    documents.push({ type: 'assurance_decennale', dateValidite: decennale });
  if (urssaf !== 'absent') documents.push({ type: 'attestation_urssaf', dateValidite: urssaf });
  if (contrat) documents.push({ type: 'contrat_sous_traitance', dateValidite: null });
  return { documents, qualifications };
}

describe('calculerSyntheseConformite', () => {
  it('classe un dossier complet « Conforme · 4/4 »', () => {
    const s = calculerSyntheseConformite(input(), TODAY);
    expect(s.niveau).toBe('conforme');
    expect(s.label).toBe('Conforme');
    expect(s.piliersAJour).toBe(4);
    expect(s.total).toBe(4);
    expect(s.alertes).toEqual([]);
    expect(s.piliers.every((p) => p.statut === 'ok')).toBe(true);
  });

  it('passe en « Vigilance » quand la décennale expire bientôt (< 30 j)', () => {
    const s = calculerSyntheseConformite(input({ decennale: '2026-06-28' }), TODAY);
    expect(s.niveau).toBe('vigilance');
    expect(s.label).toBe('Vigilance');
    expect(s.piliersAJour).toBe(3);
    const dec = s.piliers.find((p) => p.cle === 'decennale')!;
    expect(dec.statut).toBe('attention');
    expect(s.alertes[0]).toContain('Décennale expire le 28/06/2026');
    expect(s.alertes[0]).toContain('dans 13 j');
  });

  it('passe « Non conforme » si la décennale est expirée', () => {
    const s = calculerSyntheseConformite(input({ decennale: '2026-01-01' }), TODAY);
    expect(s.niveau).toBe('non_conforme');
    expect(s.piliers.find((p) => p.cle === 'decennale')!.statut).toBe('manquant');
    expect(s.alertes.some((a) => a.includes('expirée'))).toBe(true);
  });

  it('décennale manquante (pièce absente) ⇒ Non conforme', () => {
    const s = calculerSyntheseConformite(input({ decennale: 'absent' }), TODAY);
    expect(s.niveau).toBe('non_conforme');
    expect(s.piliers.find((p) => p.cle === 'decennale')!.detail).toBe('Pièce absente');
  });

  it('URSSAF qui expire bientôt ⇒ pilier en attention (vigilance)', () => {
    const s = calculerSyntheseConformite(input({ urssaf: '2026-06-28' }), TODAY);
    const urssaf = s.piliers.find((p) => p.cle === 'urssaf')!;
    expect(urssaf.statut).toBe('attention');
    expect(s.niveau).toBe('vigilance');
    expect(s.alertes.some((a) => a.startsWith('Attestation URSSAF expire le'))).toBe(true);
  });

  it('URSSAF expirée ou absente ⇒ pilier manquant (non conforme)', () => {
    const expiree = calculerSyntheseConformite(input({ urssaf: '2026-01-01' }), TODAY);
    expect(expiree.piliers.find((p) => p.cle === 'urssaf')!.statut).toBe('manquant');
    expect(expiree.niveau).toBe('non_conforme');

    const absente = calculerSyntheseConformite(input({ urssaf: 'absent' }), TODAY);
    expect(absente.piliers.find((p) => p.cle === 'urssaf')!.statut).toBe('manquant');
    expect(absente.niveau).toBe('non_conforme');
  });

  it('pièce fournie sans échéance ⇒ pilier à jour', () => {
    const s = calculerSyntheseConformite(input({ decennale: null, urssaf: null }), TODAY);
    expect(s.piliers.find((p) => p.cle === 'decennale')!.statut).toBe('ok');
    expect(s.piliers.find((p) => p.cle === 'urssaf')!.statut).toBe('ok');
    expect(s.niveau).toBe('conforme');
  });

  it('DC4 non fourni (pas de contrat) et 0 qualification ⇒ vigilance (piliers non bloquants)', () => {
    const s = calculerSyntheseConformite(input({ contrat: false, qualifications: [] }), TODAY);
    expect(s.niveau).toBe('vigilance');
    expect(s.piliersAJour).toBe(2);
    expect(s.piliers.find((p) => p.cle === 'dc4')!.statut).toBe('attention');
    expect(s.piliers.find((p) => p.cle === 'qualifications')!.statut).toBe('attention');
  });
});

describe('calculerRangCascade', () => {
  it('rang 1 sans parent', () => {
    const parents = new Map<string, string | null>([['a', null]]);
    expect(calculerRangCascade('a', parents)).toEqual({ rang: 1, max: 3, depassement: false });
  });

  it('compte les ancêtres de la chaîne', () => {
    // c → b → a (a = tête de cascade)
    const parents = new Map<string, string | null>([
      ['a', null],
      ['b', 'a'],
      ['c', 'b'],
    ]);
    expect(calculerRangCascade('c', parents).rang).toBe(3);
    expect(calculerRangCascade('b', parents).rang).toBe(2);
  });

  it('signale un dépassement au-delà de la limite légale', () => {
    const parents = new Map<string, string | null>([
      ['a', null],
      ['b', 'a'],
      ['c', 'b'],
      ['d', 'c'],
    ]);
    const r = calculerRangCascade('d', parents);
    expect(r.rang).toBe(4);
    expect(r.depassement).toBe(true);
    expect(r.max).toBe(MAX_NIVEAUX_CASCADE);
  });

  it('ne boucle pas sur un cycle', () => {
    const parents = new Map<string, string | null>([
      ['x', 'y'],
      ['y', 'x'],
    ]);
    expect(() => calculerRangCascade('x', parents)).not.toThrow();
  });
});

describe('decrireEvenementSousTraitant', () => {
  it('insert / delete', () => {
    expect(decrireEvenementSousTraitant({ action: 'insert' })).toBe('Sous-traitant créé');
    expect(decrireEvenementSousTraitant({ action: 'delete' })).toBe('Sous-traitant supprimé');
  });

  it('détecte une (dés)activation', () => {
    expect(
      decrireEvenementSousTraitant({
        action: 'update',
        before: { actif: true },
        after: { actif: false },
      }),
    ).toBe('Désactivation');
    expect(
      decrireEvenementSousTraitant({
        action: 'update',
        before: { actif: false },
        after: { actif: true },
      }),
    ).toBe('Réactivation');
  });

  it('décrit un changement de statut d’agrément', () => {
    expect(
      decrireEvenementSousTraitant({
        action: 'update',
        before: { statut: 'a_qualifier' },
        after: { statut: 'agree' },
      }),
    ).toBe("Statut d'agrément → Agréé");
  });

  it('retombe sur « Modification » par défaut', () => {
    expect(
      decrireEvenementSousTraitant({
        action: 'update',
        before: { siret: '1' },
        after: { siret: '2' },
      }),
    ).toBe('Modification');
  });
});

describe('formaterDateFr', () => {
  it('formate une date ISO et gère null', () => {
    expect(formaterDateFr('2026-06-28')).toBe('28/06/2026');
    expect(formaterDateFr(null)).toBe('—');
  });
});
