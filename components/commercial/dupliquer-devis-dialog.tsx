'use client';

import { useEffect, useState } from 'react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

export type DupliquerMode = 'meme_client' | 'autre_client';

type Props = {
  open: boolean;
  onClose: () => void;
  /** Server action de duplication. Reçoit le mode choisi. */
  action: (
    mode: DupliquerMode,
  ) => Promise<{ ok: boolean; error?: string; data?: { id: string; numero: string } }>;
  /** L'utilisateur peut-il dupliquer en tant que nouvelle version (même client) ?
   *  Dépend de la permission COMMERCIAL_DEVIS_VERSION. */
  peutVersionner: boolean;
  /** Callback après duplication réussie (typiquement : redirection vers le
   *  nouveau devis). Reçoit l'id du nouveau devis. */
  onSuccess: (nouveauDevisId: string, numero: string) => void;
};

/** Dialog modal de duplication d'un devis. Deux choix mutuellement exclusifs :
 *  - Nouvelle version pour le même client (gated COMMERCIAL_DEVIS_VERSION)
 *  - Duplication pour un autre client (libre, l'utilisateur changera le
 *    client après ouverture du nouveau devis) */
export function DupliquerDevisDialog({ open, onClose, action, peutVersionner, onSuccess }: Props) {
  const [mode, setMode] = useState<DupliquerMode>(peutVersionner ? 'meme_client' : 'autre_client');
  const [submitting, setSubmitting] = useState(false);

  // Reset au ré-ouverture (en cas de toggle de la permission ou changement
  // de devis source pendant que le dialog était fermé).
  useEffect(() => {
    if (open) {
      setMode(peutVersionner ? 'meme_client' : 'autre_client');
    }
  }, [open, peutVersionner]);

  // Touche Échap ferme le dialog (sauf si une requête est en cours).
  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape' && !submitting) onClose();
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, submitting, onClose]);

  if (!open) return null;

  async function handleConfirm() {
    setSubmitting(true);
    try {
      const r = await action(mode);
      if (r.ok && r.data) {
        toast.success(`Devis ${r.data.numero} créé`);
        onSuccess(r.data.id, r.data.numero);
        onClose();
      } else {
        toast.error(r.error ?? 'Duplication impossible.');
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="dupliquer-devis-title"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onClick={() => !submitting && onClose()}
    >
      <div
        className="w-full max-w-md rounded-lg bg-card p-6 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 id="dupliquer-devis-title" className="text-lg font-semibold">
          Dupliquer le devis
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Pour quel usage souhaitez-vous dupliquer ce devis&nbsp;?
        </p>

        <div className="mt-4 space-y-2">
          <label
            className={cn(
              'flex items-start gap-3 rounded-md border p-3 transition-colors',
              peutVersionner && mode === 'meme_client' && 'border-primary bg-primary/5',
              peutVersionner && mode !== 'meme_client' && 'cursor-pointer hover:bg-muted',
              !peutVersionner && 'cursor-not-allowed opacity-60',
            )}
          >
            <input
              type="radio"
              name="dupliquer-mode"
              value="meme_client"
              checked={mode === 'meme_client'}
              disabled={!peutVersionner || submitting}
              onChange={() => setMode('meme_client')}
              className="mt-1 size-4"
            />
            <div className="min-w-0">
              <div className="text-sm font-medium">Nouvelle version pour ce client</div>
              <div className="mt-0.5 text-xs text-muted-foreground">
                Créer une révision du devis (négociation, ajustement) pour le même client.
                {!peutVersionner && (
                  <span className="block text-red-600">
                    Droit manquant : « Gérer les versions d&apos;un devis ».
                  </span>
                )}
              </div>
            </div>
          </label>

          <label
            className={cn(
              'flex cursor-pointer items-start gap-3 rounded-md border p-3 transition-colors hover:bg-muted',
              mode === 'autre_client' && 'border-primary bg-primary/5',
            )}
          >
            <input
              type="radio"
              name="dupliquer-mode"
              value="autre_client"
              checked={mode === 'autre_client'}
              disabled={submitting}
              onChange={() => setMode('autre_client')}
              className="mt-1 size-4"
            />
            <div className="min-w-0">
              <div className="text-sm font-medium">Pour un autre client</div>
              <div className="mt-0.5 text-xs text-muted-foreground">
                Copier la structure du devis ; vous changerez le client à l&apos;ouverture du
                nouveau devis.
              </div>
            </div>
          </label>
        </div>

        <div className="mt-6 flex justify-end gap-2">
          <Button variant="ghost" type="button" onClick={onClose} disabled={submitting}>
            Annuler
          </Button>
          <Button type="button" onClick={handleConfirm} disabled={submitting}>
            {submitting ? 'Duplication…' : 'Dupliquer'}
          </Button>
        </div>
      </div>
    </div>
  );
}
