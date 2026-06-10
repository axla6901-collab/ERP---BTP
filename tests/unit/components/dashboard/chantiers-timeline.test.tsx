import '@testing-library/jest-dom/vitest';

import { cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

// next/link → simple <a> (on retire `scroll` qui n'est pas un attribut DOM).
vi.mock('next/link', () => ({
  default: ({
    href,
    children,
    scroll: _scroll,
    ...rest
  }: {
    href: string;
    children: React.ReactNode;
    scroll?: boolean;
  } & Record<string, unknown>) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

import { ChantiersTimeline } from '@/components/dashboard/chantiers-timeline';
import { genererFrise } from '@/lib/dashboard/compute';
import type { ChantierTimeline } from '@/lib/dashboard/dashboard';

const frise = genererFrise('2024-02-15', 1, 1);

function chantier(p: Partial<ChantierTimeline> = {}): ChantierTimeline {
  return {
    id: p.id ?? 'ch1',
    numero: p.numero ?? 'CH-001',
    libelle: p.libelle ?? 'Villa Test',
    statut: p.statut ?? 'en_cours',
    clientNom: p.clientNom ?? 'Client X',
    // `in` plutôt que `??` : préserver un `null` explicite (chantier sans dates).
    dateDebut: 'dateDebut' in p ? (p.dateDebut ?? null) : '2024-02-01',
    dateFin: 'dateFin' in p ? (p.dateFin ?? null) : '2024-02-20',
    avancementPourcent: p.avancementPourcent ?? 42,
    nbTaches: p.nbTaches ?? 3,
    enRetard: p.enRetard ?? false,
  };
}

afterEach(cleanup);

describe('ChantiersTimeline', () => {
  it('affiche le titre et le compteur de chantiers', () => {
    const { getByText } = render(
      <ChantiersTimeline
        chantiers={[chantier(), chantier({ id: 'ch2', libelle: 'École' })]}
        frise={frise}
        selectedId="ch1"
        entrepriseSlug="acme"
      />,
    );
    expect(getByText('Mes chantiers actifs')).toBeInTheDocument();
    expect(getByText(/2 chantiers/)).toBeInTheDocument();
  });

  it('rend une barre par chantier avec le lien de sélection ?chantier=', () => {
    const { getByTitle } = render(
      <ChantiersTimeline
        chantiers={[chantier({ id: 'ch1', libelle: 'Villa Test', clientNom: 'Dupont' })]}
        frise={frise}
        selectedId={null}
        entrepriseSlug="acme"
      />,
    );
    const lien = getByTitle('Villa Test — Dupont') as HTMLAnchorElement;
    expect(lien).toBeInTheDocument();
    expect(lien.getAttribute('href')).toBe('/acme/dashboard?chantier=ch1');
  });

  it('affiche « non planifié » pour un chantier sans dates', () => {
    const { getByText } = render(
      <ChantiersTimeline
        chantiers={[chantier({ libelle: 'Sans dates', dateDebut: null, dateFin: null })]}
        frise={frise}
        selectedId={null}
        entrepriseSlug="acme"
      />,
    );
    expect(getByText(/non planifié/)).toBeInTheDocument();
  });

  it('lien « Nouveau chantier » correctement préfixé par le slug', () => {
    const { getByRole } = render(
      <ChantiersTimeline chantiers={[]} frise={frise} selectedId={null} entrepriseSlug="acme" />,
    );
    const lien = getByRole('link', { name: /Nouveau chantier/ }) as HTMLAnchorElement;
    expect(lien.getAttribute('href')).toBe('/acme/chantiers/nouveau');
  });

  it('état vide quand aucun chantier actif', () => {
    const { getByText } = render(
      <ChantiersTimeline chantiers={[]} frise={frise} selectedId={null} entrepriseSlug="acme" />,
    );
    expect(getByText(/Aucun chantier actif/)).toBeInTheDocument();
  });
});
