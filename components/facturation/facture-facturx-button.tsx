'use client';

import { useState } from 'react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';

type ActionResult = { ok: true; data: { url: string } } | { ok: false; error: string };

type Props = {
  factureId: string;
  /** true si un Factur-X a déjà été généré (état initial du bouton). */
  dejaGenere: boolean;
  generer: (factureId: string) => Promise<ActionResult>;
  telecharger: (factureId: string) => Promise<ActionResult>;
};

/**
 * Génération / téléchargement du Factur-X (PDF/A-3 EN 16931) d'une facture.
 * Le PDF est ouvert dans un nouvel onglet via une URL pré-signée MinIO.
 */
export function FactureFacturXButton({ factureId, dejaGenere, generer, telecharger }: Props) {
  const [enCours, setEnCours] = useState<null | 'generer' | 'telecharger'>(null);
  const [genere, setGenere] = useState(dejaGenere);

  function ouvrir(url: string) {
    window.open(url, '_blank', 'noopener,noreferrer');
  }

  async function handleGenerer() {
    setEnCours('generer');
    const res = await generer(factureId);
    setEnCours(null);
    if (!res.ok) {
      toast.error(res.error);
      return;
    }
    setGenere(true);
    toast.success('Factur-X généré');
    ouvrir(res.data.url);
  }

  async function handleTelecharger() {
    setEnCours('telecharger');
    const res = await telecharger(factureId);
    setEnCours(null);
    if (!res.ok) {
      toast.error(res.error);
      return;
    }
    ouvrir(res.data.url);
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      {genere ? (
        <>
          <Button
            type="button"
            variant="outline"
            disabled={enCours !== null}
            onClick={handleTelecharger}
          >
            {enCours === 'telecharger' ? 'Préparation…' : 'Télécharger le Factur-X'}
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={enCours !== null}
            onClick={handleGenerer}
          >
            {enCours === 'generer' ? 'Régénération…' : 'Régénérer'}
          </Button>
        </>
      ) : (
        <Button type="button" disabled={enCours !== null} onClick={handleGenerer}>
          {enCours === 'generer' ? 'Génération…' : 'Générer le Factur-X'}
        </Button>
      )}
    </div>
  );
}
