'use client';

import { SendIcon } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useTransition } from 'react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { relancerTier } from '@/lib/referencement/relances';

type Props = {
  tierId: string;
  size?: 'xs' | 'sm';
  variant?: 'outline' | 'secondary' | 'ghost';
  label?: string;
};

/** Bouton de relance individuelle d'un tier (enregistre la trace, sans envoi auto). */
export function RelanceButton({ tierId, size = 'sm', variant = 'outline', label = 'Relancer' }: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function relancer() {
    startTransition(async () => {
      const res = await relancerTier(tierId);
      if (res.ok) {
        toast.success('Relance enregistrée.');
        router.refresh();
      } else {
        toast.error(res.error);
      }
    });
  }

  return (
    <Button
      type="button"
      size={size}
      variant={variant}
      disabled={pending}
      onClick={relancer}
      data-no-row-nav
    >
      <SendIcon className="mr-1 size-3.5" />
      {pending ? 'Relance…' : label}
    </Button>
  );
}
