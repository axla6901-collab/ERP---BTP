import { describe, expect, it } from 'vitest';

import {
  hrefCalendrier,
  hrefCompteurs,
  hrefDemandes,
  lireAnnee,
  lireFiltresCalendrier,
  lireFiltresCompteurs,
  lireFiltresDemandes,
  periodesProposees,
} from '@/lib/test-sirh/absences/filtres';

const UUID = '3f2b8c1e-6d4a-4e7b-9a1c-2b3c4d5e6f70';
const BASE = '/btp-demo/test-sirh/absences';
const TODAY = '2026-10-19';

describe('filtres de la liste des demandes', () => {
  it('valeurs par défaut : en attente, sans employé ni période', () => {
    expect(lireFiltresDemandes({})).toEqual({
      statut: 'en_attente',
      employeId: null,
      du: null,
      au: null,
    });
  });

  it('lit statut, employé et période ; ignore les valeurs invalides', () => {
    expect(
      lireFiltresDemandes({ statut: 'toutes', employe: UUID, du: '2026-10-01', au: '2026-10-31' }),
    ).toEqual({ statut: 'toutes', employeId: UUID, du: '2026-10-01', au: '2026-10-31' });
    expect(
      lireFiltresDemandes({
        statut: 'bidon',
        employe: 'pas-un-uuid',
        du: '2026-02-30',
        au: ['2026-10-31', 'x'],
      }),
    ).toEqual({ statut: 'en_attente', employeId: null, du: null, au: '2026-10-31' });
  });

  it('construit l’URL (statut par défaut omis)', () => {
    expect(hrefDemandes(BASE, { statut: 'en_attente', employeId: null, du: null, au: null })).toBe(
      BASE,
    );
    expect(
      hrefDemandes(BASE, { statut: 'toutes', employeId: UUID, du: '2026-10-01', au: null }),
    ).toBe(`${BASE}?statut=toutes&employe=${UUID}&du=2026-10-01`);
  });
});

describe('filtres du calendrier', () => {
  it('mois courant par défaut, mois valide sinon', () => {
    expect(lireFiltresCalendrier({}, TODAY)).toEqual({
      annee: 2026,
      mois: 10,
      equipeId: null,
      siteId: null,
    });
    expect(lireFiltresCalendrier({ mois: '2027-01', equipe: UUID }, TODAY)).toEqual({
      annee: 2027,
      mois: 1,
      equipeId: UUID,
      siteId: null,
    });
    expect(lireFiltresCalendrier({ mois: '2026-13' }, TODAY)).toMatchObject({
      annee: 2026,
      mois: 10,
    });
  });

  it('construit l’URL du mois filtré', () => {
    expect(
      hrefCalendrier(`${BASE}/calendrier`, { annee: 2026, mois: 3, equipeId: null, siteId: UUID }),
    ).toBe(`${BASE}/calendrier?mois=2026-03&site=${UUID}`);
  });
});

describe('filtres des compteurs', () => {
  it('période de référence BTP (avril → mars) contenant aujourd’hui par défaut', () => {
    expect(lireFiltresCompteurs({}, TODAY)).toEqual({
      periode: { debut: '2026-04-01', fin: '2027-03-31' },
      typeAbsenceId: null,
    });
    expect(lireFiltresCompteurs({ periode: 'toutes', type: UUID }, TODAY)).toEqual({
      periode: null,
      typeAbsenceId: UUID,
    });
    expect(lireFiltresCompteurs({ periode: '2025-06-15' }, TODAY).periode).toEqual({
      debut: '2025-04-01',
      fin: '2026-03-31',
    });
  });

  it('propose les périodes précédente, courante et suivante', () => {
    expect(periodesProposees(TODAY)).toEqual([
      { debut: '2025-04-01', fin: '2026-03-31' },
      { debut: '2026-04-01', fin: '2027-03-31' },
      { debut: '2027-04-01', fin: '2028-03-31' },
    ]);
  });

  it('construit l’URL (toutes les périodes explicite)', () => {
    expect(hrefCompteurs(`${BASE}/compteurs`, { periode: null, typeAbsenceId: null })).toBe(
      `${BASE}/compteurs?periode=toutes`,
    );
    expect(
      hrefCompteurs(`${BASE}/compteurs`, {
        periode: { debut: '2026-04-01', fin: '2027-03-31' },
        typeAbsenceId: UUID,
      }),
    ).toBe(`${BASE}/compteurs?periode=2026-04-01&type=${UUID}`);
  });
});

describe('année des jours fériés', () => {
  it('année valide, sinon année courante', () => {
    expect(lireAnnee({ annee: '2027' }, TODAY)).toBe(2027);
    expect(lireAnnee({ annee: '1999' }, TODAY)).toBe(2026);
    expect(lireAnnee({}, TODAY)).toBe(2026);
  });
});
