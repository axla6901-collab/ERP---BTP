import { describe, expect, it } from 'vitest';

import {
  DOSSIERS_DEFAUT,
  FORMATIONS_DEFAUT,
  HORAIRES_DEFAUT,
  MODELES_PROCESSUS_DEFAUT,
  TYPES_ABSENCE_DEFAUT,
  joursFeriesAAmorcer,
} from '@/lib/test-sirh/amorcage';
import {
  CATEGORIES_ABSENCE,
  CATEGORIES_FORMATION,
  RESPONSABLES_TACHE,
  TYPES_PROCESSUS,
  UNITES_DECOMPTE,
} from '@/lib/validation/test-sirh/enums';

const COULEUR = /^#[0-9a-fA-F]{6}$/;

describe('amorçage des référentiels Test SIRH', () => {
  it('types d’absence : codes uniques, couleurs valides, enums connus', () => {
    const codes = TYPES_ABSENCE_DEFAUT.map((t) => t.code);
    expect(new Set(codes).size).toBe(codes.length);
    for (const t of TYPES_ABSENCE_DEFAUT) {
      expect(t.couleur).toMatch(COULEUR);
      expect(CATEGORIES_ABSENCE).toContain(t.categorie);
      expect(UNITES_DECOMPTE).toContain(t.uniteDecompte);
    }
    // Congés payés en jours ouvrables avec compteur, intempéries BTP présentes.
    expect(TYPES_ABSENCE_DEFAUT.find((t) => t.code === 'CP')).toMatchObject({
      uniteDecompte: 'jours_ouvrables',
      avecSolde: true,
    });
    expect(codes).toContain('INT');
  });

  it('horaires : un seul par défaut, heures dans [0, 24]', () => {
    expect(HORAIRES_DEFAUT.filter((h) => h.parDefaut)).toHaveLength(1);
    for (const h of HORAIRES_DEFAUT) {
      for (const v of Object.values(h.heures)) {
        const n = Number(v);
        expect(n).toBeGreaterThanOrEqual(0);
        expect(n).toBeLessThanOrEqual(24);
      }
    }
    const total39 = HORAIRES_DEFAUT.find((h) => h.nom.startsWith('39'));
    const somme = Object.values(total39!.heures).reduce((a, v) => a + Number(v), 0);
    expect(somme).toBe(39);
  });

  it('dossiers GED : noms uniques', () => {
    const noms = DOSSIERS_DEFAUT.map((d) => d.nom);
    expect(new Set(noms).size).toBe(noms.length);
  });

  it('modèles de processus : onboarding + offboarding, tâches valides', () => {
    const types = MODELES_PROCESSUS_DEFAUT.map((m) => m.typeProcessus);
    expect(types).toContain('onboarding');
    expect(types).toContain('offboarding');
    for (const m of MODELES_PROCESSUS_DEFAUT) {
      expect(TYPES_PROCESSUS).toContain(m.typeProcessus);
      expect(m.taches.length).toBeGreaterThan(0);
      for (const t of m.taches) {
        expect(RESPONSABLES_TACHE).toContain(t.responsable);
        expect(t.delaiJours).toBeGreaterThanOrEqual(-365);
        expect(t.delaiJours).toBeLessThanOrEqual(365);
      }
    }
  });

  it('formations : codes uniques, validité dans [1, 240] mois', () => {
    const codes = FORMATIONS_DEFAUT.map((f) => f.code);
    expect(new Set(codes).size).toBe(codes.length);
    for (const f of FORMATIONS_DEFAUT) {
      expect(CATEGORIES_FORMATION).toContain(f.categorie);
      if (f.validiteMois !== null) {
        expect(f.validiteMois).toBeGreaterThanOrEqual(1);
        expect(f.validiteMois).toBeLessThanOrEqual(240);
      }
    }
    expect(FORMATIONS_DEFAUT.find((f) => f.code === 'SST')?.validiteMois).toBe(24);
  });

  it('jours fériés : année courante + suivante (22 dates distinctes)', () => {
    const f = joursFeriesAAmorcer('2026-10-19');
    expect(f).toHaveLength(22);
    expect(new Set(f.map((x) => x.date)).size).toBe(22);
    expect(f[0]?.date).toBe('2026-01-01');
    expect(f.at(-1)?.date).toBe('2027-12-25');
  });
});
