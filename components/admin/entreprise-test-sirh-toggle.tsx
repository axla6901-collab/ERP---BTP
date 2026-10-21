'use client';

import { useState, useTransition } from 'react';
import { toast } from 'sonner';

import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';

type Props = {
  initialActif: boolean;
  /** Server Action : doit retourner `{ ok, error? }` JSON-sérialisable. */
  onToggle: (actif: boolean) => Promise<{ ok: true } | { ok: false; error: string }>;
};

/**
 * Toggle d'activation du module « Test SIRH » (optimistic-UI + rollback),
 * calqué sur `EntrepriseFlotteToggle`. La première activation amorce les
 * référentiels par défaut côté serveur.
 */
export function EntrepriseTestSirhToggle({ initialActif, onToggle }: Props) {
  const [actif, setActif] = useState(initialActif);
  const [pending, startTransition] = useTransition();

  function basculer(nouveau: boolean) {
    const ancien = actif;
    setActif(nouveau);
    startTransition(async () => {
      const res = await onToggle(nouveau);
      if (!res.ok) {
        setActif(ancien);
        toast.error(res.error);
      } else {
        toast.success(nouveau ? 'Module Test SIRH activé.' : 'Module Test SIRH désactivé.');
      }
    });
  }

  return (
    <div className="flex items-start gap-3">
      <Switch id="test-sirh-active" checked={actif} onCheckedChange={basculer} disabled={pending} />
      <div className="space-y-1">
        <Label htmlFor="test-sirh-active" className="text-sm font-medium">
          Module Test SIRH
        </Label>
        <p className="text-xs text-muted-foreground">
          Active l&apos;onglet « Test SIRH » : organisation, contrats, absences et compteurs, temps
          de travail, paie, notes de frais, recrutement, entretiens, formation, onboarding, matériel
          &amp; EPI, documents et espace salarié. La première activation crée les référentiels par
          défaut (types d&apos;absence, horaires, jours fériés, formations réglementaires BTP…).
        </p>
      </div>
    </div>
  );
}
