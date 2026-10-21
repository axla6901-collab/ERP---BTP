import { describe, expect, it } from 'vitest';

import {
  agregerKpiMateriel,
  alerteControle,
  changementStatutAutorise,
  controleDatesMateriel,
  controleRestitution,
  lireFiltresMateriel,
  messageBlocageSuppressionMateriel,
  peutAttribuer,
  sousGarantie,
  statutApresAttribution,
  statutApresRestitution,
  statutsSaisissables,
  urlMateriel,
} from '@/lib/test-sirh/materiel/regles';

const TODAY = '2026-10-19';

describe('cycle de vie du matériel', () => {
  it('statuts saisissables : jamais « attribué » à la main', () => {
    expect(statutsSaisissables(null)).toEqual(['en_stock', 'en_reparation', 'perdu', 'reforme']);
    expect(statutsSaisissables('en_stock')).not.toContain('attribue');
    expect(statutsSaisissables('attribue')).toEqual(['attribue']);
    expect(changementStatutAutorise('en_stock', 'reforme')).toBe(true);
    expect(changementStatutAutorise('en_stock', 'attribue')).toBe(false);
    expect(changementStatutAutorise('attribue', 'en_stock')).toBe(false);
    expect(changementStatutAutorise('attribue', 'attribue')).toBe(true);
  });

  it('attribution et restitution', () => {
    expect(peutAttribuer('en_stock')).toBe(true);
    expect(peutAttribuer('attribue')).toBe(false);
    expect(peutAttribuer('en_reparation')).toBe(false);
    expect(peutAttribuer('reforme')).toBe(false);
    expect(statutApresAttribution()).toBe('attribue');
    expect(statutApresRestitution(false)).toBe('en_stock');
    expect(statutApresRestitution(true)).toBe('en_reparation');
  });

  it('contrôle des dates de restitution et de garantie', () => {
    expect(controleRestitution('2026-10-10', '2026-10-09')).toMatch(/postérieure/);
    expect(controleRestitution('2026-10-10', '2026-10-10')).toBeNull();
    expect(controleDatesMateriel('2026-01-10', '2026-01-09')).toMatch(/garantie/);
    expect(controleDatesMateriel(null, '2026-01-09')).toBeNull();
    expect(sousGarantie('2026-10-19', TODAY)).toBe(true);
    expect(sousGarantie('2026-10-18', TODAY)).toBe(false);
    expect(sousGarantie(null, TODAY)).toBe(false);
  });
});

describe('messageBlocageSuppressionMateriel', () => {
  it('refuse la suppression d’un matériel déjà attribué et invite à le réformer', () => {
    expect(messageBlocageSuppressionMateriel(0)).toBeNull();
    expect(messageBlocageSuppressionMateriel(2)).toBe(
      'Suppression impossible : ce matériel est référencé par 2 attributions. Réformez-le plutôt (statut « Réformé ») pour conserver son historique.',
    );
  });
});

describe('alerteControle', () => {
  it('dépassée, proche (≤ 30 j), aucune', () => {
    expect(alerteControle('2026-10-18', TODAY)).toBe('depassee');
    expect(alerteControle('2026-10-19', TODAY)).toBe('proche');
    expect(alerteControle('2026-11-18', TODAY)).toBe('proche');
    expect(alerteControle('2026-11-19', TODAY)).toBe('aucune');
    expect(alerteControle(null, TODAY)).toBe('aucune');
  });

  it('aucune alerte pour un matériel perdu ou réformé', () => {
    expect(alerteControle('2026-01-01', TODAY, 'reforme')).toBe('aucune');
    expect(alerteControle('2026-01-01', TODAY, 'perdu')).toBe('aucune');
    expect(alerteControle('2026-01-01', TODAY, 'attribue')).toBe('depassee');
  });
});

describe('agregerKpiMateriel', () => {
  it('compte par statut, alertes et valeur du parc (hors perdu / réformé)', () => {
    expect(
      agregerKpiMateriel(
        [
          { statut: 'attribue', valeurAchat: 899.9, dateControle: null },
          { statut: 'attribue', valeurAchat: 145.5, dateControle: '2026-10-25' },
          { statut: 'en_stock', valeurAchat: 0.1, dateControle: '2026-09-01' },
          { statut: 'en_stock', valeurAchat: 0.2, dateControle: '2027-09-01' },
          { statut: 'en_reparation', valeurAchat: null, dateControle: null },
          { statut: 'reforme', valeurAchat: 1000, dateControle: '2025-01-01' },
          { statut: 'perdu', valeurAchat: 50, dateControle: null },
        ],
        TODAY,
      ),
    ).toEqual({
      total: 7,
      attribues: 2,
      enStock: 2,
      enReparation: 1,
      alertesControle: 2,
      valeurParc: 1045.7,
    });
  });
});

describe('filtres d’URL de l’inventaire', () => {
  it('lit et construit les filtres', () => {
    expect(lireFiltresMateriel({})).toEqual({ categorie: null, statut: null });
    expect(lireFiltresMateriel({ categorie: 'epi', statut: 'attribue' })).toEqual({
      categorie: 'epi',
      statut: 'attribue',
    });
    expect(lireFiltresMateriel({ categorie: 'voiture', statut: 'vendu' })).toEqual({
      categorie: null,
      statut: null,
    });
    expect(urlMateriel('/a/test-sirh/materiel', {})).toBe('/a/test-sirh/materiel');
    expect(urlMateriel('/a/test-sirh/materiel', { categorie: 'epi', statut: 'en_stock' })).toBe(
      '/a/test-sirh/materiel?categorie=epi&statut=en_stock',
    );
  });
});
