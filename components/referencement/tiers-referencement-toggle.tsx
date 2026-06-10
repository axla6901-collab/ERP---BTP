'use client';

import { useState, useTransition } from 'react';
import { toast } from 'sonner';

import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';

type Props = {
  initialActif: boolean;
  /** Server Action : doit retourner `{ ok, error? }` JSON-sérialisable. */
  onToggle: (actif: boolean) => Promise<{ ok: true } | { ok: false; error: string }>;
};

/**
 * Toggle d'activation du module « Référencement & Agrément des tiers » pour
 * l'entreprise courante. Optimistic-UI avec rollback en cas d'échec.
 * À la première activation, le référentiel documentaire par défaut est seedé
 * côté server action.
 */
export function TiersReferencementToggle({ initialActif, onToggle }: Props) {
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
          nouveau
            ? 'Module Référencement des tiers activé.'
            : 'Module Référencement des tiers désactivé.',
        );
      }
    });
  }

  return (
    <div className="flex items-start gap-3">
      <Switch
        id="tiers-referencement-active"
        checked={actif}
        onCheckedChange={basculer}
        disabled={pending}
      />
      <div className="space-y-1">
        <Label htmlFor="tiers-referencement-active" className="text-sm font-medium">
          Module Référencement &amp; Agrément des tiers
        </Label>
        <p className="text-xs text-muted-foreground">
          Active l&apos;onglet « Tiers ▸ Référencement » : suivi de la conformité
          documentaire des sous-traitants et fournisseurs (K-bis, attestation de
          vigilance URSSAF, assurances, etc.), statut d&apos;agrément et relances.
          À la première activation, le référentiel des documents requis est
          pré-rempli.
        </p>
      </div>
    </div>
  );
}
