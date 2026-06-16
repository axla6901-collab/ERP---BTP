'use client';

import { useState, useTransition } from 'react';
import { toast } from 'sonner';

import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';

type Props = {
  initialActif: boolean;
  /** Server Action côté serveur : doit retourner `{ ok, error? }` JSON-sérialisable. */
  onToggle: (actif: boolean) => Promise<{ ok: true } | { ok: false; error: string }>;
};

/**
 * Toggle d'activation du module Flotte automobile pour l'entreprise courante.
 *
 * Optimistic-UI : l'état visuel bascule immédiatement, et roll-back si la server
 * action échoue. La revalidation de la sidebar est faite côté server action
 * (`revalidatePath layout`).
 */
export function EntrepriseFlotteToggle({ initialActif, onToggle }: Props) {
  const [actif, setActif] = useState(initialActif);
  const [pending, startTransition] = useTransition();

  function basculer(nouveau: boolean) {
    const ancien = actif;
    setActif(nouveau); // optimistic
    startTransition(async () => {
      const res = await onToggle(nouveau);
      if (!res.ok) {
        setActif(ancien); // rollback
        toast.error(res.error);
      } else {
        toast.success(nouveau ? 'Module Flotte activé.' : 'Module Flotte désactivé.');
      }
    });
  }

  return (
    <div className="flex items-start gap-3">
      <Switch id="flotte-active" checked={actif} onCheckedChange={basculer} disabled={pending} />
      <div className="space-y-1">
        <Label htmlFor="flotte-active" className="text-sm font-medium">
          Module Flotte automobile
        </Label>
        <p className="text-xs text-muted-foreground">
          Active l&apos;onglet « Flotte » dans la sidebar : parc de véhicules, échéances
          réglementaires (contrôle technique, assurance, carte grise, Crit&apos;Air) avec rappels,
          affectations conducteur/chantier, entretiens, sinistres et documents.
        </p>
      </div>
    </div>
  );
}
