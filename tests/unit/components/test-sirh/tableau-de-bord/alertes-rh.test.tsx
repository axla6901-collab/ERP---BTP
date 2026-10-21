import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import {
  AbsentsDuJourListe,
  EntretiensProEnRetardListe,
  RecyclagesListe,
} from '@/components/test-sirh/tableau-de-bord/alertes-rh';
import type { AbsentDuJour } from '@/lib/test-sirh/absences/types';
import type { SuiviEntretienProLigne } from '@/lib/test-sirh/entretiens/queries';
import type { QualificationLigne } from '@/lib/test-sirh/formation/queries';

afterEach(cleanup);

function absent(i: number, partiel: Partial<AbsentDuJour> = {}): AbsentDuJour {
  return {
    absenceId: `abs-${i}`,
    employeId: `emp-${i}`,
    employe: `Salarié ${i}`,
    typeCode: 'CP',
    typeLibelle: 'Congés payés',
    couleur: '#f59e0b',
    dateDebut: '2026-10-19',
    dateFin: '2026-10-19',
    demiJournee: null,
    ...partiel,
  };
}

describe('AbsentsDuJourListe', () => {
  it('affiche type, demi-journée et date de retour ; tronque avec lien', () => {
    render(
      <AbsentsDuJourListe
        lienCalendrier="/acme/test-sirh/absences/calendrier"
        limite={2}
        absents={[
          absent(1, { demiJournee: 'matin' }),
          absent(2, { dateFin: '2026-10-23' }),
          absent(3),
        ]}
      />,
    );
    expect(screen.getByText('Salarié 1')).toBeInTheDocument();
    expect(screen.getByText('Congés payés · matin')).toBeInTheDocument();
    expect(screen.getByText("Congés payés · jusqu'au 23/10/2026")).toBeInTheDocument();
    expect(screen.queryByText('Salarié 3')).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Voir les 1 autres →' })).toHaveAttribute(
      'href',
      '/acme/test-sirh/absences/calendrier',
    );
  });

  it('état vide', () => {
    render(<AbsentsDuJourListe absents={[]} lienCalendrier="/x" />);
    expect(screen.getByText(/personne n’est absent/i)).toBeInTheDocument();
  });
});

describe('RecyclagesListe et EntretiensProEnRetardListe', () => {
  it('liste les recyclages avec leur statut', () => {
    const q = {
      inscriptionId: 'i1',
      sessionId: 's1',
      employeId: 'e1',
      employeNom: 'Marc Dubois',
      employeTri: 'dubois marc',
      matricule: null,
      formationId: 'f1',
      formationIntitule: 'Sauveteur secouriste du travail (SST)',
      formationCode: 'SST',
      categorie: 'securite',
      dateObtention: '2024-11-10',
      dateValidite: '2026-11-10',
      statut: 'a_recycler',
      joursRestants: 22,
      recyclagePlanifie: null,
      equipeIds: [],
    } as QualificationLigne;
    render(<RecyclagesListe qualifications={[q]} lien="/acme/test-sirh/formation/habilitations" />);
    expect(screen.getByText('Marc Dubois')).toBeInTheDocument();
    expect(
      screen.getByText('Sauveteur secouriste du travail (SST) · échéance 10/11/2026'),
    ).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Voir tout →' })).toBeInTheDocument();
  });

  it('entretiens professionnels : dernier entretien ou mention « aucun »', () => {
    const ligne = {
      employeId: 'e2',
      employeNom: 'Julie Martin',
      employeTri: 'martin julie',
      matricule: null,
      managerId: null,
      managerNom: null,
      dateEntree: '2020-03-02',
      dernierEntretien: null,
      dernierEntretienId: null,
      prochaineEcheance: '2022-03-02',
      joursRestants: -1692,
      statut: 'en_retard',
      dernierBilan: null,
      echeanceBilan: '2026-03-02',
      statutBilan: 'en_retard',
      entretienPlanifie: null,
    } as SuiviEntretienProLigne;
    render(<EntretiensProEnRetardListe lignes={[ligne]} lien="/acme/test-sirh/entretiens/suivi" />);
    expect(screen.getByText('Julie Martin')).toBeInTheDocument();
    expect(screen.getByText(/aucun entretien réalisé · échéance 02\/03\/2022/)).toBeInTheDocument();
    cleanup();
    render(<EntretiensProEnRetardListe lignes={[]} lien="/x" />);
    expect(screen.getByText(/tous les entretiens professionnels sont à jour/i)).toBeInTheDocument();
  });
});
