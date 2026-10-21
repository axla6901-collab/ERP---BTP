import '@testing-library/jest-dom/vitest';

import { cleanup, fireEvent, render, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn(), warning: vi.fn() },
}));

const { pushMock } = vi.hoisted(() => ({ pushMock: vi.fn() }));

vi.mock('next/navigation', () => ({
  useParams: () => ({ entrepriseSlug: 'acme' }),
  useRouter: () => ({ push: pushMock, refresh: vi.fn() }),
}));

// `useGuardedRouter` lève hors d'un <NavigationGuardProvider> : on stubble le module.
vi.mock('@/lib/hooks/navigation-guard', () => ({
  useGuardedRouter: () => ({ back: vi.fn(), push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
  useUnsavedChangesGuard: vi.fn(),
}));

// FournisseurForm importe ImportCatalogueDialog, qui tire des server actions DB.
vi.mock('@/lib/catalogue/import-catalogue-fournisseur', () => ({
  analyserClasseurCatalogue: vi.fn(),
  previewImportCatalogue: vi.fn(),
  executerImportCatalogue: vi.fn(),
}));

import { FournisseurForm } from '@/components/tiers/fournisseur-form';

const onSubmit = vi.fn().mockResolvedValue({ ok: true });

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('FournisseurForm — barre d’actions', () => {
  it('affiche le titre et les actions de base (création : Annuler, Enregistrer)', () => {
    const { getByRole, getByText, queryByRole } = render(
      <FournisseurForm titre="Nouveau fournisseur" onSubmit={onSubmit} successRedirect="/x" />,
    );
    expect(getByText('Nouveau fournisseur')).toBeInTheDocument();
    expect(getByRole('button', { name: /^enregistrer$/i })).toBeInTheDocument();
    expect(getByRole('button', { name: /annuler/i })).toBeInTheDocument();
    // Les contacts se gèrent désormais depuis la fiche (ContactsSection), plus
    // dans la barre d'actions du formulaire.
    expect(queryByRole('button', { name: /créer un contact/i })).not.toBeInTheDocument();
  });

  it('n’affiche pas les actions catalogue en création (pas d’id fournisseur)', () => {
    const { queryByRole } = render(
      <FournisseurForm titre="Nouveau fournisseur" onSubmit={onSubmit} successRedirect="/x" />,
    );
    expect(queryByRole('button', { name: /import catalogue/i })).not.toBeInTheDocument();
    expect(queryByRole('link', { name: /création catalogue/i })).not.toBeInTheDocument();
  });

  it('affiche Import catalogue et Création catalogue sur une fiche existante autorisée', () => {
    const { getByRole } = render(
      <FournisseurForm
        titre="POINT.P"
        fournisseurId="f1"
        fournisseurNom="POINT.P"
        peutImporterCatalogue
        nouvelleGrilleHref="/tiers/fournisseurs/f1/grilles/nouveau"
        onSubmit={onSubmit}
        successRedirect="/x"
      />,
    );
    expect(getByRole('button', { name: /import catalogue/i })).toBeInTheDocument();
    const lien = getByRole('link', { name: /création catalogue/i });
    // Href legacy reçu de la page : préfixé par le slug au rendu (pas de redirection).
    expect(lien).toHaveAttribute('href', '/acme/tiers/fournisseurs/f1/grilles/nouveau');
  });

  it('masque le bouton « Création catalogue » sans href (import non autorisé)', () => {
    const { queryByRole } = render(
      <FournisseurForm
        titre="POINT.P"
        fournisseurId="f1"
        fournisseurNom="POINT.P"
        peutImporterCatalogue={false}
        onSubmit={onSubmit}
        successRedirect="/x"
      />,
    );
    expect(queryByRole('button', { name: /import catalogue/i })).not.toBeInTheDocument();
    expect(queryByRole('link', { name: /création catalogue/i })).not.toBeInTheDocument();
  });

  it('l’action Enregistrer est associée au formulaire via l’attribut form', () => {
    const { getByRole } = render(
      <FournisseurForm titre="Nouveau fournisseur" onSubmit={onSubmit} successRedirect="/x" />,
    );
    expect(getByRole('button', { name: /^enregistrer$/i })).toHaveAttribute(
      'form',
      'fournisseur-form',
    );
  });

  it('n’affiche ni badge ni toggle de statut en création (pas d’onChangerStatut)', () => {
    const { queryByRole, queryByText } = render(
      <FournisseurForm titre="Nouveau fournisseur" onSubmit={onSubmit} successRedirect="/x" />,
    );
    expect(queryByRole('button', { name: /désactiver|activer/i })).not.toBeInTheDocument();
    expect(queryByText('Actif')).not.toBeInTheDocument();
  });

  it('affiche le badge « Actif » et le bouton « Désactiver » sur une fiche active', () => {
    const { getByRole, getByText } = render(
      <FournisseurForm
        titre="POINT.P"
        fournisseurId="f1"
        defaultValues={{ actif: true }}
        onSubmit={onSubmit}
        onChangerStatut={vi.fn().mockResolvedValue({ ok: true })}
        successRedirect="/x"
      />,
    );
    expect(getByText('Actif')).toBeInTheDocument();
    expect(getByRole('button', { name: 'Désactiver' })).toBeInTheDocument();
  });

  it('affiche le badge « Inactif » et le bouton « Activer » sur une fiche inactive', () => {
    const { getByRole, getByText } = render(
      <FournisseurForm
        titre="POINT.P"
        fournisseurId="f1"
        defaultValues={{ actif: false }}
        onSubmit={onSubmit}
        onChangerStatut={vi.fn().mockResolvedValue({ ok: true })}
        successRedirect="/x"
      />,
    );
    expect(getByText('Inactif')).toBeInTheDocument();
    expect(getByRole('button', { name: 'Activer' })).toBeInTheDocument();
  });
});

describe('FournisseurForm — slots du gabarit', () => {
  it('rend le fil d’Ariane, le sous-titre, les badges et le rail', () => {
    const { getByText, getByRole } = render(
      <FournisseurForm
        titre="POINT.P"
        fournisseurId="f1"
        onSubmit={onSubmit}
        successRedirect="/x"
        retourHref="/tiers/fournisseurs"
        sousTitre={<span>POINTP · SIRET 562…</span>}
        badges={<span>Préféré · 12 articles</span>}
        rail={<aside>Synthèse tarifaire</aside>}
      />,
    );
    expect(getByRole('link', { name: /fournisseurs/i })).toHaveAttribute(
      'href',
      '/acme/tiers/fournisseurs',
    );
    expect(getByText('POINTP · SIRET 562…')).toBeInTheDocument();
    expect(getByText('Préféré · 12 articles')).toBeInTheDocument();
    expect(getByText('Synthèse tarifaire')).toBeInTheDocument();
  });

  it('place les champs Email / Téléphone dans la section Coordonnées', () => {
    const { getByText } = render(
      <FournisseurForm titre="Nouveau fournisseur" onSubmit={onSubmit} successRedirect="/x" />,
    );
    expect(getByText('Coordonnées')).toBeInTheDocument();
    expect(getByText('Contact générique')).toBeInTheDocument();
  });
});

describe('FournisseurForm — champs facultatifs', () => {
  it('enregistre un fournisseur sans SIRET, sans e-mail ni code postal', async () => {
    const soumettre = vi.fn().mockResolvedValue({ ok: true });
    const { container } = render(
      <FournisseurForm
        titre="Nouveau fournisseur"
        defaultValues={{ code: 'RECET', nom: 'Fournisseur test' }}
        onSubmit={soumettre}
        successRedirect="/x"
      />,
    );

    fireEvent.submit(container.querySelector('#fournisseur-form')!);

    await waitFor(() => expect(soumettre).toHaveBeenCalledTimes(1));
    expect(soumettre).toHaveBeenCalledWith(
      expect.objectContaining({ code: 'RECET', siret: null, email: null, codePostal: null }),
    );
  });

  it('enregistre un fournisseur étranger avec son code postal local', async () => {
    const soumettre = vi.fn().mockResolvedValue({ ok: true });
    const { container } = render(
      <FournisseurForm
        titre="Nouveau fournisseur"
        defaultValues={{
          code: 'GENEVE',
          nom: 'Fournisseur genevois',
          pays: 'Suisse',
          codePostal: '1200',
          ville: 'Genève',
        }}
        onSubmit={soumettre}
        successRedirect="/x"
      />,
    );

    fireEvent.submit(container.querySelector('#fournisseur-form')!);

    await waitFor(() => expect(soumettre).toHaveBeenCalledTimes(1));
    expect(soumettre).toHaveBeenCalledWith(
      expect.objectContaining({ pays: 'Suisse', codePostal: '1200', ville: 'Genève' }),
    );
  });
});

describe('FournisseurForm — redirection après enregistrement', () => {
  it('préfixe par le slug d’entreprise un successRedirect sans slug', async () => {
    const soumettre = vi.fn().mockResolvedValue({ ok: true });
    const { container } = render(
      <FournisseurForm
        titre="Nouveau fournisseur"
        defaultValues={{ code: 'RECET', nom: 'Fournisseur test' }}
        onSubmit={soumettre}
        successRedirect="/tiers/fournisseurs"
      />,
    );

    fireEvent.submit(container.querySelector('#fournisseur-form')!);

    await waitFor(() => expect(pushMock).toHaveBeenCalledWith('/acme/tiers/fournisseurs'));
  });

  it('ne double pas le préfixe d’un successRedirect déjà préfixé', async () => {
    const soumettre = vi.fn().mockResolvedValue({ ok: true });
    const { container } = render(
      <FournisseurForm
        titre="Nouveau fournisseur"
        defaultValues={{ code: 'RECET', nom: 'Fournisseur test' }}
        onSubmit={soumettre}
        successRedirect="/acme/tiers/fournisseurs"
      />,
    );

    fireEvent.submit(container.querySelector('#fournisseur-form')!);

    await waitFor(() => expect(pushMock).toHaveBeenCalledWith('/acme/tiers/fournisseurs'));
  });
});

describe('FournisseurForm — sections « proposé » (aperçu, non enregistré)', () => {
  it('rend les sections Conditions d’achat et Comptabilité avec leurs badges « proposé »', () => {
    const { getByText, getAllByText } = render(
      <FournisseurForm titre="Nouveau fournisseur" onSubmit={onSubmit} successRedirect="/x" />,
    );
    expect(getByText(/Conditions d.achat/)).toBeInTheDocument();
    expect(getByText('Comptabilité')).toBeInTheDocument();
    // 3 badges « proposé » : N° TVA intracom + Conditions d’achat + Comptabilité.
    expect(getAllByText('proposé')).toHaveLength(3);
  });

  it('affiche le champ N° TVA intracom dérivé du SIRET, en lecture seule', () => {
    const { getByText, getByDisplayValue } = render(
      <FournisseurForm
        titre="POINT.P"
        defaultValues={{ siret: '56210539500012', code: 'POINTP' }}
        onSubmit={onSubmit}
        successRedirect="/x"
      />,
    );
    expect(getByText('N° TVA intracom')).toBeInTheDocument();
    // SIREN 562105395 → clé INSEE (12 + 3·95) mod 97 = 06 → FR06562105395
    // (champ désactivé, non soumis).
    const tva = getByDisplayValue('FR06562105395') as HTMLInputElement;
    expect(tva).toBeDisabled();
    // Compte auxiliaire dérivé du code : 401 + POINTP.
    expect(getByDisplayValue('401POINTP')).toBeDisabled();
  });
});
