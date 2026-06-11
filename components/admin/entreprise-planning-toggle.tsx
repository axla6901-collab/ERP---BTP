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
 * Toggle d'activation du module Planning (Gantt) pour l'entreprise courante.
 *
 * Optimistic-UI : l'état visuel bascule immédiatement, et roll-back si la server
 * action échoue. Un toast confirme/erreur. La revalidation de la sidebar est
 * faite côté server action (`revalidatePath layout`).
 */
export function EntreprisePlanningToggle({ initialActif, onToggle }: Props) {
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
        toast.success(nouveau ? 'Module Planning activé.' : 'Module Planning désactivé.');
      }
    });
  }

  return (
    <div className="flex items-start gap-3">
      <Switch id="planning-active" checked={actif} onCheckedChange={basculer} disabled={pending} />
      <div className="space-y-1">
        <Label htmlFor="planning-active" className="text-sm font-medium">
          Module Planning (diagramme de Gantt)
        </Label>
        <p className="text-xs text-muted-foreground">
          Active l&apos;onglet « Planning » dans la sidebar et sur chaque fiche chantier. Permet de
          visualiser et piloter les tâches sur une vue calendaire, d&apos;affecter des heures par
          ouvrier et de suivre l&apos;avancement.
        </p>
      </div>
    </div>
  );
}
