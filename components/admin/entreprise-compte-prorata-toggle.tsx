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
 * Toggle d'activation du module Compte prorata (NF P03-001) pour l'entreprise
 * courante.
 *
 * Optimistic-UI : l'état visuel bascule immédiatement, et roll-back si la server
 * action échoue. Un toast confirme/erreur. La revalidation de la sidebar est
 * faite côté server action (`revalidatePath layout`).
 */
export function EntrepriseCompteProrataToggle({ initialActif, onToggle }: Props) {
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
        toast.success(
          nouveau ? 'Module Compte prorata activé.' : 'Module Compte prorata désactivé.',
        );
      }
    });
  }

  return (
    <div className="flex items-start gap-3">
      <Switch
        id="compte-prorata-active"
        checked={actif}
        onCheckedChange={basculer}
        disabled={pending}
      />
      <div className="space-y-1">
        <Label htmlFor="compte-prorata-active" className="text-sm font-medium">
          Module Compte prorata (NF P03-001)
        </Label>
        <p className="text-xs text-muted-foreground">
          Active l&apos;onglet « Compte prorata » sur chaque fiche chantier et l&apos;entrée dédiée
          dans la barre latérale. Permet de répartir les dépenses communes d&apos;un chantier entre
          intervenants au prorata de leur marché et de suivre avances, soldes et arrêté de compte.
        </p>
      </div>
    </div>
  );
}
