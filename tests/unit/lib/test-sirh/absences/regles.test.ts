import { describe, expect, it } from 'vitest';

import {
  bornesDemiJournees,
  calculerDureeDemande,
  couvertureJour,
  datesFeriesApplicables,
  libellePlage,
  periodeBloqueeApplicable,
  plagesSeChevauchent,
  statutInitialDemande,
  transitionAutorisee,
  trouverChevauchement,
  verifierAnnulation,
  verifierDecision,
  type PlageAbsence,
} from '@/lib/test-sirh/absences/regles';

// Octobre 2026 : lundi 12 → vendredi 16, lundi 19 (aujourd'hui des tests).
const plage = (
  dateDebut: string,
  dateFin: string,
  demiJourneeDebut = false,
  demiJourneeFin = false,
): PlageAbsence => ({ dateDebut, dateFin, demiJourneeDebut, demiJourneeFin });

describe('chevauchement à la demi-journée', () => {
  it('construit des bornes comparables (matin = #0, après-midi = #1)', () => {
    expect(bornesDemiJournees(plage('2026-10-12', '2026-10-14'))).toEqual({
      debut: '2026-10-12#0',
      fin: '2026-10-14#1',
    });
    expect(bornesDemiJournees(plage('2026-10-12', '2026-10-14', true, true))).toEqual({
      debut: '2026-10-12#1',
      fin: '2026-10-14#0',
    });
  });

  it('un départ l’après-midi ne chevauche pas une absence finissant à midi le même jour', () => {
    const matin = plage('2026-10-12', '2026-10-14', false, true);
    const apresMidi = plage('2026-10-14', '2026-10-16', true, false);
    expect(plagesSeChevauchent(matin, apresMidi)).toBe(false);
    expect(plagesSeChevauchent(apresMidi, matin)).toBe(false);
  });

  it('détecte le chevauchement d’une journée entière ou d’une demi-journée commune', () => {
    expect(
      plagesSeChevauchent(
        plage('2026-10-12', '2026-10-14'),
        plage('2026-10-14', '2026-10-16', true),
      ),
    ).toBe(true);
    expect(
      plagesSeChevauchent(
        plage('2026-10-12', '2026-10-12', false, true),
        plage('2026-10-12', '2026-10-12'),
      ),
    ).toBe(true);
  });

  it('matin seul et après-midi seul du même jour sont compatibles', () => {
    expect(
      plagesSeChevauchent(
        plage('2026-10-12', '2026-10-12', false, true),
        plage('2026-10-12', '2026-10-12', true, false),
      ),
    ).toBe(false);
  });

  it('ignore les absences refusées / annulées et l’absence elle-même', () => {
    const existantes = [
      { id: 'a', statut: 'refusee' as const, ...plage('2026-10-12', '2026-10-16') },
      { id: 'b', statut: 'annulee' as const, ...plage('2026-10-12', '2026-10-16') },
      { id: 'c', statut: 'approuvee' as const, ...plage('2026-10-15', '2026-10-16') },
      { id: 'd', statut: 'en_attente' as const, ...plage('2026-10-20', '2026-10-21') },
    ];
    expect(trouverChevauchement(plage('2026-10-12', '2026-10-14'), existantes)).toBeNull();
    expect(trouverChevauchement(plage('2026-10-14', '2026-10-15'), existantes)?.id).toBe('c');
    expect(trouverChevauchement(plage('2026-10-21', '2026-10-22'), existantes)?.id).toBe('d');
    expect(trouverChevauchement(plage('2026-10-21', '2026-10-22'), existantes, 'd')).toBeNull();
  });

  it('couverture d’un jour : demi-journées de début et de fin', () => {
    const p = plage('2026-10-12', '2026-10-14', true, true);
    expect(couvertureJour(p, '2026-10-12')).toEqual({ matin: false, apresMidi: true });
    expect(couvertureJour(p, '2026-10-13')).toEqual({ matin: true, apresMidi: true });
    expect(couvertureJour(p, '2026-10-14')).toEqual({ matin: true, apresMidi: false });
    expect(couvertureJour(p, '2026-10-15')).toEqual({ matin: false, apresMidi: false });
  });

  it('libellé lisible de la plage', () => {
    expect(libellePlage(plage('2026-10-12', '2026-10-12'))).toBe('le 12/10/2026');
    expect(libellePlage(plage('2026-10-12', '2026-10-12', false, true))).toBe(
      'le 12/10/2026 (matin)',
    );
    expect(libellePlage(plage('2026-10-12', '2026-10-12', true))).toBe(
      'le 12/10/2026 (après-midi)',
    );
    expect(libellePlage(plage('2026-10-12', '2026-10-16', true, true))).toBe(
      'du 12/10/2026 (après-midi) au 16/10/2026 (midi)',
    );
  });
});

describe('périodes bloquées', () => {
  const periodes = [
    {
      id: 'p-toutes',
      libelle: 'Fermeture estivale',
      dateDebut: '2026-08-03',
      dateFin: '2026-08-21',
      typeAbsenceId: null,
      equipeId: null,
    },
    {
      id: 'p-cp',
      libelle: 'Rush chantier',
      dateDebut: '2026-10-12',
      dateFin: '2026-10-23',
      typeAbsenceId: 'type-cp',
      equipeId: null,
    },
    {
      id: 'p-equipe',
      libelle: 'Livraison lot 3',
      dateDebut: '2026-11-02',
      dateFin: '2026-11-06',
      typeAbsenceId: null,
      equipeId: 'equipe-a',
    },
  ];

  it('une période « tous types » bloque les types soumis à validation, pas les arrêts', () => {
    const demande = { dateDebut: '2026-08-10', dateFin: '2026-08-12', typeAbsenceId: 'type-rtt' };
    expect(
      periodeBloqueeApplicable({ ...demande, necessiteValidation: true }, [], periodes)?.id,
    ).toBe('p-toutes');
    expect(
      periodeBloqueeApplicable({ ...demande, necessiteValidation: false }, [], periodes),
    ).toBeNull();
  });

  it('une période visant un type ne bloque que ce type', () => {
    const base = { dateDebut: '2026-10-14', dateFin: '2026-10-15', necessiteValidation: true };
    expect(periodeBloqueeApplicable({ ...base, typeAbsenceId: 'type-cp' }, [], periodes)?.id).toBe(
      'p-cp',
    );
    expect(
      periodeBloqueeApplicable({ ...base, typeAbsenceId: 'type-rtt' }, [], periodes),
    ).toBeNull();
  });

  it('une période visant une équipe ne bloque que ses membres', () => {
    const demande = {
      dateDebut: '2026-11-05',
      dateFin: '2026-11-09',
      typeAbsenceId: 'type-cp',
      necessiteValidation: true,
    };
    expect(periodeBloqueeApplicable(demande, ['equipe-a'], periodes)?.id).toBe('p-equipe');
    expect(periodeBloqueeApplicable(demande, ['equipe-b'], periodes)).toBeNull();
  });

  it('aucune période hors dates', () => {
    expect(
      periodeBloqueeApplicable(
        {
          dateDebut: '2026-12-01',
          dateFin: '2026-12-04',
          typeAbsenceId: 'type-cp',
          necessiteValidation: true,
        },
        ['equipe-a'],
        periodes,
      ),
    ).toBeNull();
  });
});

describe('machine à états des demandes', () => {
  it('transitions autorisées', () => {
    expect(transitionAutorisee('en_attente', 'approuvee')).toBe(true);
    expect(transitionAutorisee('en_attente', 'refusee')).toBe(true);
    expect(transitionAutorisee('en_attente', 'annulee')).toBe(true);
    expect(transitionAutorisee('approuvee', 'annulee')).toBe(true);
    expect(transitionAutorisee('brouillon', 'en_attente')).toBe(true);
    expect(transitionAutorisee('approuvee', 'refusee')).toBe(false);
    expect(transitionAutorisee('refusee', 'annulee')).toBe(false);
    expect(transitionAutorisee('annulee', 'approuvee')).toBe(false);
  });

  it('statut initial : approuvée si type sans validation ou approbation directe RH', () => {
    expect(
      statutInitialDemande({
        necessiteValidation: false,
        approuverDirectement: false,
        estGestionnaire: false,
      }),
    ).toBe('approuvee');
    expect(
      statutInitialDemande({
        necessiteValidation: true,
        approuverDirectement: true,
        estGestionnaire: true,
      }),
    ).toBe('approuvee');
    expect(
      statutInitialDemande({
        necessiteValidation: true,
        approuverDirectement: true,
        estGestionnaire: false,
      }),
    ).toBe('en_attente');
    expect(
      statutInitialDemande({
        necessiteValidation: true,
        approuverDirectement: false,
        estGestionnaire: true,
      }),
    ).toBe('en_attente');
  });

  it('décision : demande en attente, pas sa propre demande sauf gestion RH', () => {
    expect(
      verifierDecision({ statut: 'en_attente', estPropreDemande: false, estGestionnaire: false }),
    ).toEqual({ ok: true });
    expect(
      verifierDecision({ statut: 'en_attente', estPropreDemande: true, estGestionnaire: false }),
    ).toEqual({ ok: false, raison: 'Vous ne pouvez pas valider votre propre demande.' });
    expect(
      verifierDecision({ statut: 'en_attente', estPropreDemande: true, estGestionnaire: true }),
    ).toEqual({ ok: true });
    expect(
      verifierDecision({ statut: 'approuvee', estPropreDemande: false, estGestionnaire: true }),
    ).toEqual({ ok: false, raison: 'Cette demande est déjà approuvée.' });
    expect(
      verifierDecision({ statut: 'refusee', estPropreDemande: false, estGestionnaire: true }),
    ).toEqual({ ok: false, raison: 'Cette demande a déjà été refusée.' });
    expect(
      verifierDecision({ statut: 'annulee', estPropreDemande: false, estGestionnaire: true }),
    ).toEqual({ ok: false, raison: 'Cette demande a été annulée.' });
  });

  it('annulation : demandeur (en attente ou à venir) ou gestion RH', () => {
    const base = { today: '2026-10-19', estGestionnaire: false, estDemandeur: true };
    expect(verifierAnnulation({ ...base, statut: 'en_attente', dateDebut: '2026-10-12' }).ok).toBe(
      true,
    );
    expect(verifierAnnulation({ ...base, statut: 'approuvee', dateDebut: '2026-10-26' }).ok).toBe(
      true,
    );
    const commencee = verifierAnnulation({ ...base, statut: 'approuvee', dateDebut: '2026-10-19' });
    expect(commencee.ok).toBe(false);
    expect(
      verifierAnnulation({
        ...base,
        estGestionnaire: true,
        estDemandeur: false,
        statut: 'approuvee',
        dateDebut: '2026-10-01',
      }).ok,
    ).toBe(true);
    expect(
      verifierAnnulation({
        ...base,
        estDemandeur: false,
        statut: 'en_attente',
        dateDebut: '2026-10-26',
      }),
    ).toEqual({
      ok: false,
      raison: 'Seul le demandeur ou un gestionnaire RH peut annuler cette demande.',
    });
    expect(
      verifierAnnulation({
        ...base,
        estGestionnaire: true,
        statut: 'refusee',
        dateDebut: '2026-10-26',
      }),
    ).toEqual({ ok: false, raison: 'Cette demande ne peut plus être annulée (statut : refusée).' });
  });
});

describe('durée d’une demande', () => {
  it('fériés applicables : globaux + ceux du site de l’employé', () => {
    const feries = [
      { date: '2026-11-11', siteId: null },
      { date: '2026-12-26', siteId: 'site-alsace' },
    ];
    expect(datesFeriesApplicables(feries, null)).toEqual(['2026-11-11']);
    expect(datesFeriesApplicables(feries, 'site-alsace')).toEqual(['2026-11-11', '2026-12-26']);
    expect(datesFeriesApplicables(feries, 'site-lyon')).toEqual(['2026-11-11']);
  });

  it('jours : décompte selon l’unité, fériés exclus, demi-journées', () => {
    const semaine = plage('2026-11-09', '2026-11-13');
    expect(
      calculerDureeDemande({ ...semaine, unite: 'jours_ouvres', feries: ['2026-11-11'] }),
    ).toBe(4);
    expect(calculerDureeDemande({ ...semaine, unite: 'jours_ouvrables', feries: [] })).toBe(6);
    expect(
      calculerDureeDemande({
        ...plage('2026-10-12', '2026-10-14', true, true),
        unite: 'jours_ouvres',
        feries: [],
      }),
    ).toBe(2);
  });

  it('heures : durée saisie (virgule acceptée), null si absente ou nulle', () => {
    const jour = plage('2026-10-12', '2026-10-12');
    expect(calculerDureeDemande({ ...jour, unite: 'heures', feries: [], dureeHeures: '7,5' })).toBe(
      7.5,
    );
    expect(calculerDureeDemande({ ...jour, unite: 'heures', feries: [], dureeHeures: null })).toBe(
      null,
    );
    expect(calculerDureeDemande({ ...jour, unite: 'heures', feries: [], dureeHeures: '0' })).toBe(
      null,
    );
  });
});
