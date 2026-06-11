'use client';

import { useRouter } from 'next/navigation';
import { useTransition } from 'react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import {
  LIBELLES_STATUT_CHANTIER,
  TRANSITIONS_CHANTIER,
  type StatutChantier,
} from '@/lib/validation/chantiers';

type Props = {
  chantierId: string;
  statutCourant: StatutChantier;
  action: (id: string, nouveau: StatutChantier) => Promise<{ ok: boolean; error?: string }>;
};

export function ChangerStatutChantier({ chantierId, statutCourant, action }: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const transitionsPossibles = TRANSITIONS_CHANTIER[statutCourant];

  if (transitionsPossibles.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">Statut final : aucune transition possible.</p>
    );
  }

  function handle(nouveau: StatutChantier) {
    startTransition(async () => {
      const r = await action(chantierId, nouveau);
      if (r.ok) {
        toast.success(`Statut → ${LIBELLES_STATUT_CHANTIER[nouveau]}`);
        router.refresh();
      } else {
        toast.error(r.error ?? 'Erreur');
      }
    });
  }

  return (
    <div className="flex flex-wrap gap-2">
      {transitionsPossibles.map((t) => (
        <Button
          key={t}
          variant={t === 'termine' ? 'default' : t === 'annule' ? 'destructive' : 'outline'}
          size="sm"
          onClick={() => handle(t)}
          disabled={isPending}
        >
          Passer à « {LIBELLES_STATUT_CHANTIER[t]} »
        </Button>
      ))}
    </div>
  );
}
