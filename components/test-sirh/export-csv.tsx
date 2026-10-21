'use client';

import { DownloadIcon } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { nomFichierCsv } from '@/lib/test-sirh/csv';

/**
 * Téléchargement d'un CSV déjà généré côté serveur (chaîne passée en prop,
 * cf. `genererCsv`) — aucune donnée supplémentaire n'est chargée au clic.
 */
export function ExportCsvSirh({
  contenu,
  nomFichier,
  libelle = 'Exporter CSV',
  disabled,
}: {
  contenu: string;
  /** Base du nom de fichier (slugifiée, extension .csv ajoutée). */
  nomFichier: string;
  libelle?: string;
  disabled?: boolean;
}) {
  function telecharger() {
    const blob = new Blob([contenu], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = nomFichierCsv(nomFichier);
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <Button type="button" variant="outline" size="sm" onClick={telecharger} disabled={disabled}>
      <DownloadIcon className="mr-1 size-4" />
      {libelle}
    </Button>
  );
}
