import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { MonProfilCarte } from '@/components/test-sirh/mon-espace/mes-informations';

afterEach(cleanup);

const TODAY = '2026-10-19';
const PROFIL = {
  employeId: '3f2b8c1e-6d4a-4e7b-9a1c-2b3c4d5e6f70',
  nomComplet: 'Marc Dubois',
  matricule: 'M042',
  dateEntree: '2023-08-15',
  poste: 'Chef d’équipe maçon',
  site: 'Agence de Lyon',
  manager: 'Julie Martin',
  contrat: { typeContrat: 'cdd' as const, dateDebut: '2026-01-05', dateFin: '2026-12-31' },
};

describe('MonProfilCarte', () => {
  it('affiche poste, manager, ancienneté et contrat à terme', () => {
    render(<MonProfilCarte today={TODAY} profil={PROFIL} />);
    expect(screen.getByText('M042')).toBeInTheDocument();
    expect(screen.getByText('Chef d’équipe maçon')).toBeInTheDocument();
    expect(screen.getByText('Julie Martin')).toBeInTheDocument();
    expect(screen.getByText(/3 ans 2 mois \(depuis le 15\/08\/2023\)/)).toBeInTheDocument();
    expect(screen.getByText("CDD jusqu'au 31/12/2026")).toBeInTheDocument();
  });

  it('tiret pour les informations absentes et contrat sans terme', () => {
    render(
      <MonProfilCarte
        today={TODAY}
        profil={{
          ...PROFIL,
          matricule: null,
          manager: null,
          dateEntree: null,
          contrat: { typeContrat: 'cdi', dateDebut: '2020-01-01', dateFin: null },
        }}
      />,
    );
    expect(screen.getAllByText('—').length).toBeGreaterThanOrEqual(3);
    expect(screen.getByText('CDI')).toBeInTheDocument();
  });
});
