import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { ActionsStatutOffre } from '@/components/test-sirh/recrutement/actions-statut-offre';
import {
  EtapeCandidatureBadge,
  StatutOffreBadge,
} from '@/components/test-sirh/recrutement/badges-recrutement';
import { DocumentsCandidat } from '@/components/test-sirh/recrutement/documents-candidat';
import { EntretiensRecrutementAVenir } from '@/components/test-sirh/recrutement/entretiens-a-venir';
import { NoteEtoiles } from '@/components/test-sirh/recrutement/note-etoiles';

const { refresh, toastError } = vi.hoisted(() => ({ refresh: vi.fn(), toastError: vi.fn() }));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: toastError } }));
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), refresh, prefetch: vi.fn() }),
}));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

const OFFRE = '11111111-1111-4111-8111-111111111111';

describe('NoteEtoiles', () => {
  it('lecture seule : libellé accessible de la note', () => {
    render(<NoteEtoiles note={3} />);
    expect(screen.getByRole('img', { name: 'Note : 3 sur 5' })).toBeInTheDocument();
    render(<NoteEtoiles note={null} libelle="Évaluation" />);
    expect(screen.getByRole('img', { name: 'Évaluation : non noté' })).toBeInTheDocument();
  });

  it('interactive : choisir une note, recliquer la note courante la retire', () => {
    const onChange = vi.fn();
    render(<NoteEtoiles note={4} onChange={onChange} />);
    fireEvent.click(screen.getByRole('button', { name: 'Note : 2 sur 5' }));
    expect(onChange).toHaveBeenLastCalledWith(2);
    fireEvent.click(screen.getByRole('button', { name: 'Note : 4 sur 5' }));
    expect(onChange).toHaveBeenLastCalledWith(null);
    expect(screen.getByRole('button', { name: 'Note : 4 sur 5' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    expect(screen.getByRole('button', { name: 'Note : 5 sur 5' })).toHaveAttribute(
      'aria-pressed',
      'false',
    );
  });
});

describe('badges', () => {
  it('libellés FR des statuts d’offre et des étapes', () => {
    render(
      <>
        <StatutOffreBadge statut="pourvue" />
        <EtapeCandidatureBadge etape="entretien_technique" />
      </>,
    );
    expect(screen.getByText('Pourvue')).toBeInTheDocument();
    expect(screen.getByText('Entretien technique')).toBeInTheDocument();
  });
});

describe('ActionsStatutOffre', () => {
  it('propose les transitions autorisées et appelle l’action', async () => {
    const onChanger = vi.fn().mockResolvedValue({ ok: true, data: { statut: 'suspendue' } });
    render(<ActionsStatutOffre offreId={OFFRE} statut="publiee" onChanger={onChanger} />);
    expect(screen.getByRole('button', { name: 'Suspendre' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Marquer pourvue' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Fermer' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Publier' })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Suspendre' }));
    await waitFor(() => expect(onChanger).toHaveBeenCalledWith({ id: OFFRE, statut: 'suspendue' }));
    // La server action revalide la page : pas de second rendu via router.refresh().
    expect(refresh).not.toHaveBeenCalled();
  });

  it('affiche le refus du serveur', async () => {
    const onChanger = vi.fn().mockResolvedValue({ ok: false, error: 'Offre introuvable.' });
    render(<ActionsStatutOffre offreId={OFFRE} statut="brouillon" onChanger={onChanger} />);
    fireEvent.click(screen.getByRole('button', { name: 'Publier' }));
    await waitFor(() => expect(toastError).toHaveBeenCalledWith('Offre introuvable.'));
    expect(refresh).not.toHaveBeenCalled();
  });
});

describe('EntretiensRecrutementAVenir', () => {
  it('liste les entretiens (heure de Paris) avec lien vers le pipeline', () => {
    render(
      <EntretiensRecrutementAVenir
        base="/acme/test-sirh"
        entretiens={[
          {
            candidatureId: 'c1',
            offreId: OFFRE,
            offreTitre: 'Maçon coffreur',
            offreReference: null,
            candidatId: 'k1',
            candidatNom: 'Léa Durand',
            etape: 'entretien_rh',
            dateEntretien: '2026-10-20T12:00:00.000Z',
            date: '2026-10-20',
            heure: '14:00',
          },
        ]}
      />,
    );
    expect(screen.getByRole('link', { name: 'Léa Durand' })).toHaveAttribute(
      'href',
      `/acme/test-sirh/recrutement/offres/${OFFRE}`,
    );
    expect(screen.getByText('Maçon coffreur · Entretien RH')).toBeInTheDocument();
    expect(screen.getByText('mar. 20/10 · 14:00')).toBeInTheDocument();
  });

  it('état vide', () => {
    render(<EntretiensRecrutementAVenir base="/acme/test-sirh" entretiens={[]} />);
    expect(screen.getByText('Aucun entretien de recrutement planifié.')).toBeInTheDocument();
  });
});

describe('DocumentsCandidat', () => {
  const actions = {
    preparerUpload: vi.fn(),
    creerDocument: vi.fn(),
    obtenirUrl: vi.fn().mockResolvedValue({ ok: true, url: 'https://minio/cv', titre: 'CV' }),
    supprimer: vi.fn().mockResolvedValue({ ok: true, data: undefined }),
  };
  const documents = [
    {
      id: 'd1',
      titre: 'CV Léa Durand',
      mimeType: 'application/pdf',
      tailleBytes: 2048,
      createdAt: '2026-10-02T08:00:00.000Z',
    },
  ];

  it('gestion RH : liste, téléchargement, suppression et dépôt', async () => {
    render(
      <DocumentsCandidat
        candidatId="k1"
        documents={documents}
        peutGerer
        peutTelecharger
        actions={actions}
      />,
    );
    expect(screen.getByText('CV Léa Durand')).toBeInTheDocument();
    expect(screen.getByText('2 Ko · ajouté le 02/10/2026')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Télécharger CV Léa Durand' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Joindre un CV/ })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Supprimer' }));
    const boutons = screen.getAllByRole('button', { name: 'Supprimer' });
    fireEvent.click(boutons[boutons.length - 1]!);
    await waitFor(() => expect(actions.supprimer).toHaveBeenCalledWith('d1'));
  });

  it('lecteur : ni dépôt, ni suppression, ni téléchargement', () => {
    render(
      <DocumentsCandidat
        candidatId="k1"
        documents={documents}
        peutGerer={false}
        peutTelecharger={false}
        actions={actions}
      />,
    );
    expect(screen.getByText('CV Léa Durand')).toBeInTheDocument();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it('état vide', () => {
    render(
      <DocumentsCandidat
        candidatId="k1"
        documents={[]}
        peutGerer={false}
        peutTelecharger={false}
        actions={actions}
      />,
    );
    expect(screen.getByText('Aucun CV ni pièce jointe.')).toBeInTheDocument();
  });
});
