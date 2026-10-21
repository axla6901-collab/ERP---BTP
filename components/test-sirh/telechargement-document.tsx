'use client';

import { DownloadIcon } from 'lucide-react';
import { useTransition } from 'react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';

type Props = {
  documentId: string;
  /** Server action : URL présignée après contrôle d'accès. */
  obtenirUrl: (
    id: string,
  ) => Promise<{ ok: true; url: string; titre: string } | { ok: false; error: string }>;
  libelle?: string;
  /** Affiche seulement l'icône (tableaux). */
  compact?: boolean;
};

/** Ouvre un document SIRH dans un nouvel onglet (URL MinIO présignée). */
export function TelechargementDocument({ documentId, obtenirUrl, libelle, compact }: Props) {
  const [isPending, startTransition] = useTransition();

  function ouvrir() {
    startTransition(async () => {
      const r = await obtenirUrl(documentId);
      if (!r.ok) {
        toast.error(r.error);
        return;
      }
      const a = document.createElement('a');
      a.href = r.url;
      a.target = '_blank';
      a.rel = 'noopener noreferrer';
      a.click();
    });
  }

  return (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      onClick={ouvrir}
      disabled={isPending}
      title={libelle ?? 'Télécharger'}
      aria-label={libelle ?? 'Télécharger'}
      className={compact ? 'h-7 w-7 p-0' : undefined}
    >
      <DownloadIcon className="size-4" />
      {!compact && <span className="ml-1">{libelle ?? 'Télécharger'}</span>}
    </Button>
  );
}
