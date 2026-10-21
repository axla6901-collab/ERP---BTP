import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import { JoursFeriesSection } from '@/components/test-sirh/absences/jours-feries-section';
import type { JourFerieLigne } from '@/lib/test-sirh/absences/types';

import type * as ModuleOptionSelect from '@/components/test-sirh/option-select';

import { installerPolyfillsJsdom } from './outils-tests';

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn(), warning: vi.fn() } }));
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn(), prefetch: vi.fn() }),
}));
vi.mock('@/components/test-sirh/option-select', async (importOriginal) => ({
  ...(await importOriginal<typeof ModuleOptionSelect>()),
  OptionSelect: (await import('./outils-tests')).OptionSelectNatif,
}));

import { toast } from 'sonner';

beforeAll(installerPolyfillsJsdom);
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

const BASE = '/btp-demo/test-sirh/absences/parametres';
const SITE = '3f2b8c1e-6d4a-4e7b-9a1c-2b3c4d5e6f70';

const FERIES: JourFerieLigne[] = [
  {
    id: 'f1',
    dateFerie: '2026-12-25',
    libelle: 'Noël',
    siteId: null,
    site: null,
    chome: true,
  },
  {
    id: 'f2',
    dateFerie: '2026-12-26',
    libelle: 'Saint-Étienne',
    siteId: SITE,
    site: 'Agence de Metz',
    chome: true,
  },
  {
    id: 'f3',
    dateFerie: '2026-05-25',
    libelle: 'Lundi de Pentecôte',
    siteId: null,
    site: null,
    chome: false,
  },
];

function creerActions() {
  return {
    enregistrer: vi.fn().mockResolvedValue({ ok: true, data: { id: 'x' } }),
    supprimer: vi.fn().mockResolvedValue({ ok: true, data: undefined }),
    generer: vi.fn().mockResolvedValue({ ok: true, data: { crees: 13, ignores: 0 } }),
  };
}

function rendre(peutGerer = true, actions = creerActions()) {
  render(
    <JoursFeriesSection
      annee={2026}
      feries={FERIES}
      sites={[{ id: SITE, label: 'Agence de Metz' }]}
      baseHref={BASE}
      peutGerer={peutGerer}
      actions={actions}
    />,
  );
  return actions;
}

describe('JoursFeriesSection', () => {
  it('liste les fériés de l’année : date, site, chômé / travaillé ; navigation par année', () => {
    rendre();
    expect(screen.getByText('ven. 25/12')).toBeInTheDocument();
    expect(screen.getByText('Agence de Metz')).toBeInTheDocument();
    expect(screen.getAllByText('Tous les sites')).toHaveLength(2);
    // Badges uniquement (l'en-tête de colonne « Chômé » est un <th>).
    expect(screen.getAllByText('Chômé', { selector: 'span' })).toHaveLength(2);
    expect(screen.getByText('Travaillé')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Année 2025' })).toHaveAttribute(
      'href',
      `${BASE}?annee=2025`,
    );
    expect(screen.getByRole('link', { name: 'Année 2027' })).toHaveAttribute(
      'href',
      `${BASE}?annee=2027`,
    );
  });

  it('lecture seule : pas de génération ni de saisie', () => {
    rendre(false);
    expect(screen.queryByRole('button', { name: /générer/i })).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: /ajouter un jour férié/i }),
    ).not.toBeInTheDocument();
  });

  it('génère l’année avec l’option Alsace-Moselle (aperçu 11 → 13 jours)', async () => {
    const actions = rendre();
    fireEvent.click(screen.getByRole('button', { name: 'Générer l’année 2026' }));
    const apercu = await screen.findByRole('list', { name: 'Aperçu des jours fériés' });
    expect(within(apercu).getAllByRole('listitem')).toHaveLength(11);
    fireEvent.click(screen.getByRole('switch'));
    await waitFor(() => expect(within(apercu).getAllByRole('listitem')).toHaveLength(13));
    fireEvent.click(screen.getByRole('button', { name: 'Générer 13 jours' }));
    await waitFor(() =>
      expect(actions.generer).toHaveBeenCalledWith({
        annee: 2026,
        alsaceMoselle: true,
        siteId: null,
      }),
    );
    expect(toast.success).toHaveBeenCalledWith('13 jours fériés ajoutés');
  });

  it('ajoute un férié propre à un site', async () => {
    const actions = rendre();
    fireEvent.click(screen.getByRole('button', { name: 'Ajouter un jour férié' }));
    fireEvent.change(await screen.findByLabelText('Date'), { target: { value: '2026-06-19' } });
    fireEvent.change(screen.getByLabelText('Libellé'), { target: { value: 'Fête locale' } });
    fireEvent.change(screen.getByRole('combobox', { name: 'Site' }), { target: { value: SITE } });
    fireEvent.click(screen.getByRole('button', { name: 'Ajouter' }));
    await waitFor(() =>
      expect(actions.enregistrer).toHaveBeenCalledWith({
        id: undefined,
        dateFerie: '2026-06-19',
        libelle: 'Fête locale',
        siteId: SITE,
        chome: true,
      }),
    );
  });
});
