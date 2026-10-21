import { describe, expect, it } from 'vitest';

import {
  agregerKpiNotesFrais,
  arrondir,
  baremeKilometrique,
  categorieParDefaut,
  categoriesPourNature,
  classePuissance,
  detailMontantNoteFrais,
  droitsNoteFrais,
  estTauxElectrique,
  lireFiltresNotesFrais,
  montantForfait,
  montantHt,
  montantIndemniteKm,
  noteFraisModifiable,
  noteFraisSupprimable,
  normaliserMontantsNoteFrais,
  statutApresDecision,
  statutApresEnregistrement,
  statutsDuFiltre,
  tauxKmPremiereTranche,
  transitionFraisAutorisee,
  tvaDepuisTtc,
  urlNotesFrais,
  type ActeurNoteFrais,
} from '@/lib/test-sirh/notes-frais/calculs';

const UUID = '3f2b8c1e-6d4a-4e7b-9a1c-2b3c4d5e6f70';
const UUID_2 = '9b1d4c2e-7a3f-4c8d-8e2b-1f0a9c8d7e6b';

describe('arrondir', () => {
  it('arrondit au centime sans artefact binaire', () => {
    expect(arrondir(1.005)).toBe(1.01);
    expect(arrondir(26.712)).toBe(26.71);
    expect(arrondir(2.675)).toBe(2.68);
    expect(arrondir(-1.005)).toBe(-1.01);
    expect(arrondir(0.7632, 3)).toBe(0.763);
    expect(arrondir(Number.NaN)).toBe(0);
  });
});

describe('barème kilométrique URSSAF 2025', () => {
  it('classe la puissance fiscale', () => {
    expect(classePuissance(1)).toBe('3');
    expect(classePuissance(3)).toBe('3');
    expect(classePuissance(4)).toBe('4');
    expect(classePuissance(6)).toBe('6');
    expect(classePuissance(7)).toBe('7');
    expect(classePuissance(11)).toBe('7');
  });

  it('1re tranche (≤ 5 000 km) : d × coefficient', () => {
    expect(baremeKilometrique(3, 4000)).toBe(2116); // 4000 × 0,529
    expect(baremeKilometrique(4, 5000)).toBe(3030); // 5000 × 0,606
    expect(baremeKilometrique(5, 1000)).toBe(636);
    expect(baremeKilometrique(6, 2000)).toBe(1330);
    expect(baremeKilometrique(9, 3000)).toBe(2091); // ≥ 7 CV : 3000 × 0,697
  });

  it('2e tranche (5 001 à 20 000 km) : d × coefficient + fixe', () => {
    expect(baremeKilometrique(3, 10000)).toBe(4225); // 3160 + 1065
    expect(baremeKilometrique(4, 12000)).toBe(5410); // 4080 + 1330
    expect(baremeKilometrique(5, 15000)).toBe(6750); // 5355 + 1395
    expect(baremeKilometrique(6, 20000)).toBe(8937); // 7480 + 1457
    expect(baremeKilometrique(7, 6000)).toBe(3879); // 2364 + 1515
  });

  it('3e tranche (> 20 000 km) : d × coefficient', () => {
    expect(baremeKilometrique(3, 25000)).toBe(9250);
    expect(baremeKilometrique(5, 30000)).toBe(12810);
    expect(baremeKilometrique(8, 21000)).toBe(9870);
  });

  it('quasi-continuité à 5 000 km entre les tranches 1 et 2 (écart officiel ≤ 2 €)', () => {
    for (const cv of [3, 4, 5, 6, 7]) {
      const t1 = baremeKilometrique(cv, 5000);
      const t2 = baremeKilometrique(cv, 5000.0001);
      expect(Math.abs(t2 - t1)).toBeLessThanOrEqual(2);
    }
  });

  it('véhicule électrique : + 20 %', () => {
    expect(baremeKilometrique(5, 1000, true)).toBe(763.2);
    expect(baremeKilometrique(3, 10000, true)).toBe(5070);
  });

  it('distance nulle, négative ou invalide → 0', () => {
    expect(baremeKilometrique(5, 0)).toBe(0);
    expect(baremeKilometrique(5, -10)).toBe(0);
    expect(baremeKilometrique(5, Number.NaN)).toBe(0);
  });

  it('taux de la 1re tranche (proposé par défaut), majoré si électrique', () => {
    expect(tauxKmPremiereTranche(3)).toBe(0.529);
    expect(tauxKmPremiereTranche(4)).toBe(0.606);
    expect(tauxKmPremiereTranche(5)).toBe(0.636);
    expect(tauxKmPremiereTranche(6)).toBe(0.665);
    expect(tauxKmPremiereTranche(10)).toBe(0.697);
    expect(tauxKmPremiereTranche(5, true)).toBe(0.763);
    expect(tauxKmPremiereTranche(3, true)).toBe(0.635);
  });

  it('déduit la case « électrique » d’un taux enregistré', () => {
    expect(estTauxElectrique(5, 0.763)).toBe(true);
    expect(estTauxElectrique(5, 0.636)).toBe(false);
    expect(estTauxElectrique(null, 0.763)).toBe(false);
    expect(estTauxElectrique(5, null)).toBe(false);
  });

  it('montant d’une note d’IK = distance × taux', () => {
    expect(montantIndemniteKm(42, 0.636)).toBe(26.71);
    expect(montantIndemniteKm(120.5, 0.529)).toBe(63.74);
    expect(montantIndemniteKm(0, 0.6)).toBe(0);
  });
});

describe('forfaits et TVA', () => {
  it('forfait = nombre × unitaire', () => {
    expect(montantForfait(5, 7.4)).toBe(37);
    expect(montantForfait(2.5, 10.15)).toBe(25.38);
    expect(montantForfait(0, 10)).toBe(0);
  });

  it('TVA incluse dans un TTC', () => {
    expect(tvaDepuisTtc(120, 20)).toBe(20);
    expect(tvaDepuisTtc(110, 10)).toBe(10);
    expect(tvaDepuisTtc(25.32, 20)).toBe(4.22);
    expect(tvaDepuisTtc(105.5, 5.5)).toBe(5.5);
    expect(tvaDepuisTtc(0, 20)).toBe(0);
    expect(montantHt(120, 20)).toBe(100);
    expect(montantHt(50, null)).toBe(50);
  });

  it('détail du calcul affiché sous le montant', () => {
    const vide = {
      distanceKm: null,
      puissanceFiscale: null,
      tauxKm: null,
      nbForfaits: null,
      montantUnitaire: null,
    };
    expect(
      detailMontantNoteFrais({
        ...vide,
        nature: 'indemnite_km',
        distanceKm: 42.5,
        puissanceFiscale: 5,
        tauxKm: 0.636,
      }),
    ).toBe('42,5 km · 5 CV · 0,636 €/km');
    expect(
      detailMontantNoteFrais({ ...vide, nature: 'forfait', nbForfaits: 5, montantUnitaire: 10.4 }),
    ).toBe('5 × 10,40 €');
    expect(detailMontantNoteFrais({ ...vide, nature: 'depense' })).toBeNull();
  });

  it('catégories proposées selon la nature', () => {
    expect(categoriesPourNature('forfait')).toContain('panier');
    expect(categoriesPourNature('depense')).not.toContain('panier');
    expect(categoriesPourNature('indemnite_km')).toContain('transport');
    expect(categorieParDefaut('indemnite_km')).toBe('transport');
    expect(categorieParDefaut('forfait')).toBe('panier');
  });
});

describe('normaliserMontantsNoteFrais', () => {
  const base = {
    montantTtc: null,
    montantTva: null,
    distanceKm: null,
    puissanceFiscale: null,
    vehiculeElectrique: false,
    tauxKm: null,
    nbForfaits: null,
    montantUnitaire: null,
  };

  it('dépense : garde TTC et TVA, vide les champs IK / forfait', () => {
    expect(
      normaliserMontantsNoteFrais({
        ...base,
        nature: 'depense',
        montantTtc: '25.30',
        montantTva: '4.22',
        distanceKm: '12',
        nbForfaits: '3',
      }),
    ).toEqual({
      montantTtc: '25.30',
      montantTva: '4.22',
      distanceKm: null,
      puissanceFiscale: null,
      tauxKm: null,
      nbForfaits: null,
      montantUnitaire: null,
    });
  });

  it('IK : recalcule le montant et applique le barème si le taux est vide', () => {
    const r = normaliserMontantsNoteFrais({
      ...base,
      nature: 'indemnite_km',
      montantTtc: '9999',
      montantTva: '10',
      distanceKm: '42',
      puissanceFiscale: 5,
    });
    expect(r).toMatchObject({
      montantTtc: '26.71',
      montantTva: null,
      distanceKm: '42.0',
      puissanceFiscale: 5,
      tauxKm: '0.636',
    });
  });

  it('IK : taux électrique par défaut, ou taux saisi', () => {
    expect(
      normaliserMontantsNoteFrais({
        ...base,
        nature: 'indemnite_km',
        distanceKm: '100',
        puissanceFiscale: '5',
        vehiculeElectrique: true,
      }).montantTtc,
    ).toBe('76.30');
    expect(
      normaliserMontantsNoteFrais({
        ...base,
        nature: 'indemnite_km',
        distanceKm: '100',
        puissanceFiscale: 5,
        tauxKm: '0.5',
      }),
    ).toMatchObject({ montantTtc: '50.00', tauxKm: '0.500' });
  });

  it('forfait : recalcule nombre × unitaire', () => {
    expect(
      normaliserMontantsNoteFrais({
        ...base,
        nature: 'forfait',
        montantTtc: '1',
        nbForfaits: '5',
        montantUnitaire: '10.40',
      }),
    ).toMatchObject({
      montantTtc: '52.00',
      nbForfaits: '5.0',
      montantUnitaire: '10.40',
      distanceKm: null,
    });
  });
});

describe('workflow des notes de frais', () => {
  it('transitions autorisées', () => {
    expect(transitionFraisAutorisee('brouillon', 'soumise')).toBe(true);
    expect(transitionFraisAutorisee('soumise', 'approuvee')).toBe(true);
    expect(transitionFraisAutorisee('soumise', 'refusee')).toBe(true);
    expect(transitionFraisAutorisee('soumise', 'brouillon')).toBe(true);
    expect(transitionFraisAutorisee('approuvee', 'remboursee')).toBe(true);
    expect(transitionFraisAutorisee('brouillon', 'approuvee')).toBe(false);
    expect(transitionFraisAutorisee('soumise', 'remboursee')).toBe(false);
    expect(transitionFraisAutorisee('refusee', 'soumise')).toBe(false);
    expect(transitionFraisAutorisee('remboursee', 'approuvee')).toBe(false);
  });

  it('modification, suppression et statut après enregistrement', () => {
    expect(noteFraisModifiable('brouillon')).toBe(true);
    expect(noteFraisModifiable('soumise')).toBe(true);
    expect(noteFraisModifiable('approuvee')).toBe(false);
    expect(noteFraisSupprimable('brouillon')).toBe(true);
    expect(noteFraisSupprimable('soumise')).toBe(false);
    expect(statutApresEnregistrement(null, false)).toBe('brouillon');
    expect(statutApresEnregistrement(null, true)).toBe('soumise');
    expect(statutApresEnregistrement('soumise', false)).toBe('brouillon');
    expect(statutApresEnregistrement('approuvee', true)).toBeNull();
    expect(statutApresEnregistrement('refusee', true)).toBeNull();
    expect(statutApresDecision('approuver')).toBe('approuvee');
    expect(statutApresDecision('refuser')).toBe('refusee');
  });

  describe('droitsNoteFrais', () => {
    const salarie: ActeurNoteFrais = {
      utilisateurId: 'u-salarie',
      employeId: UUID,
      gerer: false,
      valider: false,
      rembourser: false,
      admin: false,
    };
    const chef: ActeurNoteFrais = {
      ...salarie,
      utilisateurId: 'u-chef',
      employeId: UUID_2,
      valider: true,
    };
    const rh: ActeurNoteFrais = {
      utilisateurId: 'u-rh',
      employeId: null,
      gerer: true,
      valider: true,
      rembourser: true,
      admin: false,
    };

    it('le salarié modifie, soumet et supprime son brouillon', () => {
      expect(
        droitsNoteFrais({ statut: 'brouillon', employeId: UUID, createdBy: 'u-salarie' }, salarie),
      ).toEqual({
        modifier: true,
        soumettre: true,
        decider: false,
        rembourser: false,
        supprimer: true,
      });
    });

    it('le salarié ne touche pas à la note d’un collègue', () => {
      const d = droitsNoteFrais(
        { statut: 'brouillon', employeId: UUID_2, createdBy: 'u-autre' },
        salarie,
      );
      expect(d.modifier || d.soumettre || d.supprimer).toBe(false);
    });

    it('un valideur décide d’une note soumise, jamais de la sienne', () => {
      expect(
        droitsNoteFrais({ statut: 'soumise', employeId: UUID, createdBy: 'u-salarie' }, chef)
          .decider,
      ).toBe(true);
      expect(
        droitsNoteFrais({ statut: 'soumise', employeId: UUID_2, createdBy: 'u-chef' }, chef)
          .decider,
      ).toBe(false);
      expect(
        droitsNoteFrais(
          { statut: 'soumise', employeId: UUID_2, createdBy: 'u-chef' },
          { ...chef, admin: true },
        ).decider,
      ).toBe(true);
    });

    it('le remboursement exige une note approuvée et le droit paie/gestion', () => {
      expect(
        droitsNoteFrais({ statut: 'approuvee', employeId: UUID, createdBy: 'u-salarie' }, rh)
          .rembourser,
      ).toBe(true);
      expect(
        droitsNoteFrais({ statut: 'soumise', employeId: UUID, createdBy: 'u-salarie' }, rh)
          .rembourser,
      ).toBe(false);
      expect(
        droitsNoteFrais({ statut: 'approuvee', employeId: UUID, createdBy: 'u-salarie' }, chef)
          .rembourser,
      ).toBe(false);
    });

    it('la RH supprime un brouillon qu’elle n’a pas créé, pas une note soumise', () => {
      expect(
        droitsNoteFrais({ statut: 'brouillon', employeId: UUID, createdBy: 'u-salarie' }, rh)
          .supprimer,
      ).toBe(true);
      expect(
        droitsNoteFrais({ statut: 'soumise', employeId: UUID, createdBy: 'u-rh' }, rh).supprimer,
      ).toBe(false);
    });
  });
});

describe('agregerKpiNotesFrais', () => {
  it('compte à valider, à rembourser, le mois courant et les IK du mois', () => {
    const kpi = agregerKpiNotesFrais(
      [
        {
          statut: 'soumise',
          nature: 'depense',
          dateDepense: '2026-10-02',
          montantTtc: 25.3,
          distanceKm: null,
        },
        {
          statut: 'approuvee',
          nature: 'indemnite_km',
          dateDepense: '2026-10-05',
          montantTtc: 26.71,
          distanceKm: 42,
        },
        {
          statut: 'approuvee',
          nature: 'forfait',
          dateDepense: '2026-09-28',
          montantTtc: 37,
          distanceKm: null,
        },
        {
          statut: 'remboursee',
          nature: 'indemnite_km',
          dateDepense: '2026-10-10',
          montantTtc: 63.6,
          distanceKm: 100,
        },
        {
          statut: 'brouillon',
          nature: 'depense',
          dateDepense: '2026-10-11',
          montantTtc: 999,
          distanceKm: null,
        },
        {
          statut: 'refusee',
          nature: 'indemnite_km',
          dateDepense: '2026-10-12',
          montantTtc: 500,
          distanceKm: 800,
        },
      ],
      '2026-10-19',
    );
    expect(kpi.aValider).toEqual({ nombre: 1, montant: 25.3 });
    expect(kpi.aRembourser).toEqual({ nombre: 2, montant: 63.71 });
    expect(kpi.mois).toEqual({ nombre: 3, montant: 115.61 });
    expect(kpi.ikMois).toEqual({ nombre: 2, montant: 90.31, km: 142 });
  });

  it('valeurs nulles sans note', () => {
    expect(agregerKpiNotesFrais([], '2026-10-19').mois).toEqual({ nombre: 0, montant: 0 });
  });
});

describe('filtres d’URL', () => {
  it('lit statut, employé et mois (valeurs invalides ignorées)', () => {
    expect(lireFiltresNotesFrais({})).toEqual({ statut: 'soumise', employeId: null, mois: null });
    expect(lireFiltresNotesFrais({ statut: 'toutes', employe: UUID, mois: '2026-10' })).toEqual({
      statut: 'toutes',
      employeId: UUID,
      mois: '2026-10',
    });
    expect(lireFiltresNotesFrais({ statut: 'n-importe', employe: 'x', mois: '2026-13' })).toEqual({
      statut: 'soumise',
      employeId: null,
      mois: null,
    });
  });

  it('statuts SQL d’un filtre', () => {
    expect(statutsDuFiltre('toutes')).toBeNull();
    expect(statutsDuFiltre('approuvee')).toEqual(['approuvee']);
  });

  it('construit l’URL en conservant les autres filtres', () => {
    const base = '/acme/test-sirh/notes-frais';
    expect(urlNotesFrais(base, { statut: 'soumise' })).toBe(base);
    expect(urlNotesFrais(base, { statut: 'toutes', employeId: UUID, mois: '2026-10' })).toBe(
      `${base}?statut=toutes&employe=${UUID}&mois=2026-10`,
    );
  });
});
