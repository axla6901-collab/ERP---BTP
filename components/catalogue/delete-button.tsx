'use client';

import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { toast } from 'sonner';

import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';

type Props = {
  /** Server Action à appeler pour supprimer (soft delete). */
  action: () => Promise<{ ok: true; data: void } | { ok: false; error: string }>;
  /** Libellé du bouton, ex: « Supprimer la famille ». */
  label?: string;
  /** Texte de confirmation affiché en alerte avant suppression. */
  confirmText?: string;
  /** Où rediriger après succès. Si absent : `router.refresh()`. */
  redirectTo?: string;
};

export function DeleteButton({
  action,
  label = 'Supprimer',
  confirmText = 'Cette action est irréversible (soft delete). Confirmer ?',
  redirectTo,
}: Props) {
  const router = useRouter();
  const [confirm, setConfirm] = useState(false);
  const [isPending, startTransition] = useTransition();

  function handleConfirm() {
    startTransition(async () => {
      const result = await action();
      if (result.ok) {
        toast.success('Suppression effectuée');
        if (redirectTo) {
          router.push(redirectTo);
        } else {
          router.refresh();
        }
      } else {
        toast.error(result.error);
        setConfirm(false);
      }
    });
  }

  if (!confirm) {
    return (
      <Button variant="destructive" onClick={() => setConfirm(true)}>
        {label}
      </Button>
    );
  }

  return (
    <div className="grid gap-2">
      <Alert variant="destructive">
        <AlertTitle>Confirmer la suppression</AlertTitle>
        <AlertDescription>{confirmText}</AlertDescription>
      </Alert>
      <div className="flex justify-end gap-2">
        <Button variant="ghost" onClick={() => setConfirm(false)} disabled={isPending}>
          Annuler
        </Button>
        <Button variant="destructive" onClick={handleConfirm} disabled={isPending}>
          {isPending ? 'Suppression…' : 'Confirmer'}
        </Button>
      </div>
    </div>
  );
}
