'use client';

import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';

type ServerActionResult = { ok: true; data: void } | { ok: false; error: string };

type Props = {
  /** Redirige ici après suppression réussie (liste véhicules). */
  successRedirect: string;
  onDelete: () => Promise<ServerActionResult>;
};

/**
 * Bouton de suppression (zone dangereuse) d'un véhicule. La server action refuse
 * si le véhicule est référencé (échéances, affectations, entretiens…) et renvoie
 * le message de blocage, affiché en toast.
 */
export function DeleteVehiculeButton({ successRedirect, onDelete }: Props) {
  const router = useRouter();
  const [confirme, setConfirme] = useState(false);
  const [isPending, startTransition] = useTransition();

  function handleDelete() {
    startTransition(async () => {
      const r = await onDelete();
      if (r.ok) {
        toast.success('Véhicule supprimé');
        router.push(successRedirect);
        router.refresh();
      } else {
        toast.error(r.error);
        setConfirme(false);
      }
    });
  }

  if (!confirme) {
    return (
      <Button
        variant="outline"
        size="sm"
        className="text-destructive"
        onClick={() => setConfirme(true)}
      >
        Supprimer le véhicule
      </Button>
    );
  }

  return (
    <div className="flex items-center gap-2">
      <span className="text-sm text-muted-foreground">Confirmer la suppression ?</span>
      <Button variant="ghost" size="sm" onClick={() => setConfirme(false)} disabled={isPending}>
        Annuler
      </Button>
      <Button variant="destructive" size="sm" onClick={handleDelete} disabled={isPending}>
        {isPending ? 'Suppression…' : 'Supprimer'}
      </Button>
    </div>
  );
}
