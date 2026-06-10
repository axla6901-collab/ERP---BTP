'use client';

import { useRouter } from 'next/navigation';
import { useTransition } from 'react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { statuerAgrement } from '@/lib/referencement/registre';
import type { ActionAgrement, StatutAgrement } from '@/lib/validation/referencement-tiers';

type Props = { tierId: string; statut: StatutAgrement };

export function AgrementActions({ tierId, statut }: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function executer(action: ActionAgrement, demanderMotif: boolean) {
    let motif: string | null = null;
    if (demanderMotif) {
      motif = window.prompt(action === 'refuser' ? 'Motif du refus :' : 'Motif (optionnel) :');
      if (action === 'refuser' && !motif) return; // motif obligatoire pour un refus
    }
    startTransition(async () => {
      const res = await statuerAgrement(tierId, { action, motif });
      if (res.ok) {
        toast.success('Agrément mis à jour.');
        router.refresh();
      } else {
        toast.error(res.error);
      }
    });
  }

  return (
    <div className="flex flex-wrap gap-2">
      {statut !== 'agree' && (
        <Button size="sm" variant="outline" disabled={pending} onClick={() => executer('agreer', false)}>
          Agréer
        </Button>
      )}
      {statut === 'agree' && (
        <Button
          size="sm"
          variant="outline"
          disabled={pending}
          onClick={() => executer('suspendre', true)}
        >
          Suspendre
        </Button>
      )}
      {statut === 'suspendu' && (
        <Button
          size="sm"
          variant="outline"
          disabled={pending}
          onClick={() => executer('reactiver', false)}
        >
          Réactiver
        </Button>
      )}
      {statut !== 'refuse_manuel' && statut !== 'refuse_auto' && (
        <Button
          size="sm"
          variant="ghost"
          className="text-destructive"
          disabled={pending}
          onClick={() => executer('refuser', true)}
        >
          Refuser l&apos;agrément
        </Button>
      )}
    </div>
  );
}
