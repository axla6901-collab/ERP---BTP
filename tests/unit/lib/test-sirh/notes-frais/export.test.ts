import { describe, expect, it } from 'vitest';

import { csvNotesFrais } from '@/lib/test-sirh/notes-frais/export';

describe('csvNotesFrais', () => {
  it('exporte les notes au format Excel FR (BOM, « ; », virgule décimale)', () => {
    const csv = csvNotesFrais([
      {
        employeNom: 'Marc Dubois',
        dateDepense: '2026-10-05',
        nature: 'indemnite_km',
        categorie: 'transport',
        libelle: 'Dépôt; chantier "Les Tilleuls"',
        montantTtc: 26.71,
        montantTva: null,
        distanceKm: 42,
        tauxKm: 0.636,
        nbForfaits: null,
        montantUnitaire: null,
        chantierLabel: 'CH-14 · Les Tilleuls',
        statut: 'remboursee',
        dateRemboursement: '2026-10-31',
      },
    ]);
    expect(csv.startsWith('﻿')).toBe(true);
    const [entetes, ligne] = csv.slice(1).split('\r\n');
    expect(entetes).toBe(
      'Collaborateur;Date;Nature;Catégorie;Libellé;Montant TTC;TVA;Distance (km);Taux (€/km);Nb forfaits;Montant unitaire;Chantier;Statut;Remboursée le',
    );
    expect(ligne).toBe(
      'Marc Dubois;05/10/2026;Indemnités kilométriques;Transport (train, avion…);"Dépôt; chantier ""Les Tilleuls""";26,71;;42;0,636;;;CH-14 · Les Tilleuls;Remboursée;31/10/2026',
    );
  });

  it('en-têtes seuls sans note', () => {
    expect(csvNotesFrais([]).split('\r\n')).toHaveLength(1);
  });
});
