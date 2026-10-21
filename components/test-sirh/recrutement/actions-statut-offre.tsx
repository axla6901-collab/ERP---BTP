'use client';

import { useTransition } from 'react';
import { toast } from 'sonner';

import { OptionSelect } from '@/components/test-sirh/option-select';
import { Button } from '@/components/ui/button';
import type { ActionResult } from '@/lib/common/action-result';
import {
  libelleTransitionOffre,
  transitionsStatutOffre,
} from '@/lib/test-sirh/recrutement/pipeline';
import { LIBELLES_STATUT_OFFRE, type StatutOffre } from '@/lib/validation/test-sirh/enums';
import type { ChangementStatutOffreInput } from '@/lib/validation/test-sirh/recrutement';

export type ActionChangerStatutOffre = (
  input: ChangementStatutOffreInput,
) => Promise<ActionResult<{ statut: StatutOffre }>>;

/**
 * Transitions de statut d'une offre (publier, suspendre, marquer pourvue,
 * fermer, republier…) : boutons (bandeau de l'offre) ou liste compacte (tableau).
 */
export function ActionsStatutOffre({
  offreId,
  statut,
  onChanger,
  variante = 'boutons',
}: {
  offreId: string;
  statut: StatutOffre;
  onChanger: ActionChangerStatutOffre;
  variante?: 'boutons' | 'liste';
}) {
  const [isPending, startTransition] = useTransition();
  const transitions = transitionsStatutOffre(statut);

  function changer(vers: StatutOffre) {
    startTransition(async () => {
      const r = await onChanger({ id: offreId, statut: vers });
      if (!r.ok) {
        toast.error(r.error);
        return;
      }
      toast.success(`Offre « ${LIBELLES_STATUT_OFFRE[vers]} »`);
    });
  }

  if (variante === 'liste') {
    return (
      <OptionSelect
        options={transitions.map((v) => ({ id: v, label: libelleTransitionOffre(statut, v) }))}
        value={null}
        onChange={(v) => {
          if (v) changer(v as StatutOffre);
        }}
        libelleAucune="Statut…"
        disabled={isPending}
        aria-label="Changer le statut de l’offre"
        className="h-7 w-36 text-xs"
      />
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      {transitions.map((v) => (
        <Button
          key={v}
          type="button"
          size="sm"
          variant={v === 'fermee' ? 'destructive' : v === 'publiee' ? 'default' : 'outline'}
          disabled={isPending}
          onClick={() => changer(v)}
        >
          {libelleTransitionOffre(statut, v)}
        </Button>
      ))}
    </div>
  );
}
