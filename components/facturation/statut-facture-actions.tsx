'use client';

import { useRouter } from 'next/navigation';
import { useTransition } from 'react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  LIBELLES_STATUT_FACTURE,
  TRANSITIONS_FACTURE,
  type StatutFacture,
} from '@/lib/validation/facturation';

type Props = {
  factureId: string;
  statutCourant: StatutFacture;
  action: (
    factureId: string,
    nouveau: StatutFacture,
  ) => Promise<{ ok: true; data: void } | { ok: false; error: string }>;
};

export function StatutFactureActions({ factureId, statutCourant, action }: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const transitions = TRANSITIONS_FACTURE[statutCourant];

  if (transitions.length === 0) {
    return null;
  }

  function handle(nouveau: StatutFacture) {
    startTransition(async () => {
      const res = await action(factureId, nouveau);
      if (res.ok) {
        toast.success(`Statut → ${LIBELLES_STATUT_FACTURE[nouveau]}`);
        router.refresh();
      } else {
        toast.error(res.error);
      }
    });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Changer le statut</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="flex flex-wrap gap-2">
          {transitions.map((t) => (
            <Button
              key={t}
              type="button"
              variant={t === 'payee' ? 'default' : t === 'annulee' ? 'destructive' : 'outline'}
              size="sm"
              onClick={() => handle(t)}
              disabled={isPending}
            >
              {LIBELLES_STATUT_FACTURE[t]}
            </Button>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
