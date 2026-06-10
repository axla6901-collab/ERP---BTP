'use client';

import { useRouter } from 'next/navigation';
import { useTransition } from 'react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';

type Props = {
  devisId: string;
  action: (
    devisId: string,
  ) => Promise<
    { ok: true; data: { id: string; numero: string } } | { ok: false; error: string }
  >;
};

export function CreerDepuisDevisButton({ devisId, action }: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  function handle() {
    startTransition(async () => {
      const r = await action(devisId);
      if (r.ok) {
        toast.success(`Chantier ${r.data.numero} créé.`);
        router.push(`/chantiers/${r.data.id}`);
        router.refresh();
      } else {
        toast.error(r.error);
      }
    });
  }

  return (
    <Button onClick={handle} disabled={isPending}>
      {isPending ? 'Création…' : 'Créer le chantier depuis ce devis'}
    </Button>
  );
}
