import { describe, expect, it } from 'vitest';

import {
  badgeageSchema,
  heuresSupSchema,
  horaireSchema,
  validationSemaineSchema,
} from '@/lib/validation/test-sirh/temps';

const UUID = '3f2b8c1e-6d4a-4e7b-9a1c-2b3c4d5e6f70';
const UUID2 = '3f2b8c1e-6d4a-4e7b-9a1c-2b3c4d5e6f71';

function chemins(r: { success: boolean; error?: { issues: { path: PropertyKey[] }[] } }) {
  return (r.error?.issues ?? []).map((i) => i.path.join('.'));
}

describe('horaireSchema', () => {
  const valide = {
    nom: '35 h — lundi au vendredi',
    description: '',
    heuresLundi: '7',
    heuresMardi: '7',
    heuresMercredi: '7',
    heuresJeudi: '7',
    heuresVendredi: '7',
    heuresSamedi: '0',
    heuresDimanche: 0,
    parDefaut: true,
    actif: true,
  };

  it('accepte et normalise un horaire', () => {
    const r = horaireSchema.safeParse(valide);
    expect(r.success).toBe(true);
    expect(r.data).toMatchObject({
      heuresLundi: '7.00',
      heuresDimanche: '0.00',
      description: null,
    });
  });

  it('accepte les heures décimales à la française', () => {
    expect(horaireSchema.parse({ ...valide, heuresVendredi: '7,5' }).heuresVendredi).toBe('7.50');
  });

  it('refuse un horaire par défaut inactif', () => {
    const r = horaireSchema.safeParse({ ...valide, actif: false });
    expect(r.success).toBe(false);
    expect(chemins(r)).toContain('actif');
  });

  it('refuse un total hebdomadaire nul, une journée > 24 h ou un nom vide', () => {
    const zero = {
      ...valide,
      heuresLundi: 0,
      heuresMardi: 0,
      heuresMercredi: 0,
      heuresJeudi: 0,
      heuresVendredi: 0,
    };
    expect(chemins(horaireSchema.safeParse(zero))).toContain('heuresLundi');
    expect(horaireSchema.safeParse({ ...valide, heuresMardi: '25' }).success).toBe(false);
    expect(horaireSchema.safeParse({ ...valide, nom: ' ' }).success).toBe(false);
  });
});

describe('badgeageSchema', () => {
  const valide = {
    employeId: UUID,
    dateBadgeage: '2026-10-19',
    heureDebut: '07:30',
    heureFin: '16:00:00',
    pauseMinutes: '60',
    lieu: 'chantier',
    chantierId: UUID2,
    commentaire: null,
  };

  it('accepte un badgeage terminé et normalise les heures', () => {
    const r = badgeageSchema.safeParse(valide);
    expect(r.success).toBe(true);
    expect(r.data).toMatchObject({ heureFin: '16:00', pauseMinutes: 60 });
  });

  it('accepte un badgeage en cours (sans heure de fin) et un poste de nuit', () => {
    expect(badgeageSchema.parse({ ...valide, heureFin: '' }).heureFin).toBeNull();
    expect(
      badgeageSchema.safeParse({
        ...valide,
        heureDebut: '22:00',
        heureFin: '06:00',
        pauseMinutes: 30,
      }).success,
    ).toBe(true);
  });

  it('refuse une fin égale au début ou une pause trop longue', () => {
    expect(chemins(badgeageSchema.safeParse({ ...valide, heureFin: '07:30' }))).toContain(
      'heureFin',
    );
    expect(
      chemins(badgeageSchema.safeParse({ ...valide, heureFin: '08:00', pauseMinutes: 30 })),
    ).toContain('pauseMinutes');
  });

  it('refuse une date impossible, un lieu inconnu ou une pause hors bornes', () => {
    expect(badgeageSchema.safeParse({ ...valide, dateBadgeage: '2026-02-30' }).success).toBe(false);
    expect(badgeageSchema.safeParse({ ...valide, lieu: 'plage' }).success).toBe(false);
    expect(badgeageSchema.safeParse({ ...valide, pauseMinutes: 721, heureFin: null }).success).toBe(
      false,
    );
    expect(badgeageSchema.safeParse({ ...valide, employeId: 'x' }).success).toBe(false);
  });
});

describe('validationSemaineSchema', () => {
  it('exige un lundi', () => {
    expect(
      validationSemaineSchema.safeParse({ employeId: UUID, lundi: '2026-10-19' }).success,
    ).toBe(true);
    expect(
      validationSemaineSchema.safeParse({ employeId: UUID, lundi: '2026-10-20' }).success,
    ).toBe(false);
  });
});

describe('heuresSupSchema', () => {
  const valide = {
    employeId: UUID,
    dateHeures: '2026-10-19',
    dureeHeures: '2,5',
    majorationPct: 25,
    compensation: 'paiement',
    chantierId: '',
    motif: 'Coulage dalle',
  };

  it('accepte une demande et normalise la durée', () => {
    const r = heuresSupSchema.safeParse(valide);
    expect(r.success).toBe(true);
    expect(r.data).toMatchObject({ dureeHeures: '2.50', chantierId: null });
  });

  it('refuse une majoration hors liste, une durée nulle ou > 24 h', () => {
    expect(heuresSupSchema.safeParse({ ...valide, majorationPct: 30 }).success).toBe(false);
    expect(heuresSupSchema.safeParse({ ...valide, dureeHeures: '0' }).success).toBe(false);
    expect(heuresSupSchema.safeParse({ ...valide, dureeHeures: '25' }).success).toBe(false);
    expect(heuresSupSchema.safeParse({ ...valide, compensation: 'cadeau' }).success).toBe(false);
  });
});
