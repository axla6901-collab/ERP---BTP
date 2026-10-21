import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { MaterielEmployeListe } from '@/components/test-sirh/materiel/materiel-employe-liste';
import type { MaterielEmployeLigne } from '@/lib/test-sirh/materiel/queries';

afterEach(() => cleanup());

const lignes: MaterielEmployeLigne[] = [
  {
    attributionId: 'a1',
    materielId: 'm1',
    libelle: 'Harnais antichute',
    categorie: 'epi',
    marque: 'Petzl',
    modele: 'Newton',
    numeroSerie: 'PZ-42',
    taille: 'L',
    dateControle: '2026-10-25',
    statutMateriel: 'attribue',
    dateRemise: '2026-01-10',
    dateRetour: null,
    etatRemise: 'Neuf',
    etatRetour: null,
    dechargeSignee: true,
  },
  {
    attributionId: 'a0',
    materielId: 'm0',
    libelle: 'Téléphone',
    categorie: 'telephonie',
    marque: null,
    modele: null,
    numeroSerie: null,
    taille: null,
    dateControle: null,
    statutMateriel: 'en_stock',
    dateRemise: '2025-02-01',
    dateRetour: '2026-01-05',
    etatRemise: null,
    etatRetour: 'Écran fissuré',
    dechargeSignee: false,
  },
];

describe('MaterielEmployeListe', () => {
  it('distingue le matériel en possession et le matériel restitué', () => {
    render(<MaterielEmployeListe lignes={lignes} today="2026-10-19" />);
    expect(screen.getByText('Harnais antichute')).toBeInTheDocument();
    expect(screen.getByText('Petzl Newton · n° PZ-42 · taille L')).toBeInTheDocument();
    expect(screen.getByText('EPI (protection individuelle)')).toBeInTheDocument();
    expect(screen.getByText('En sa possession')).toBeInTheDocument();
    expect(screen.getByText('≤ 30 j')).toBeInTheDocument();
    expect(screen.getByText('05/01/2026')).toBeInTheDocument();
    expect(screen.getByText('Écran fissuré')).toBeInTheDocument();
    expect(screen.getByText('Signée')).toBeInTheDocument();
    expect(screen.getByText('Non signée')).toBeInTheDocument();
  });

  it('affiche l’état vide', () => {
    render(<MaterielEmployeListe lignes={[]} today="2026-10-19" />);
    expect(screen.getByText(/aucun matériel remis/i)).toBeInTheDocument();
  });
});
