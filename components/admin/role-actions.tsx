'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useTransition } from 'react';
import { toast } from 'sonner';

type ActionResult<T = void> =
  | { ok: true; data: T }
  | { ok: false; error: string; fieldErrors?: Record<string, string[]> };

type Props = {
  roleId: string;
  roleCode: string;
  systeme: boolean;
  actif: boolean;
  onDupliquer: () => Promise<ActionResult<{ id: string }>>;
  onBasculerActif: (actif: boolean) => Promise<ActionResult>;
  onSupprimer: () => Promise<ActionResult>;
};

export function RoleActions({
  roleId,
  roleCode,
  systeme,
  actif,
  onDupliquer,
  onBasculerActif,
  onSupprimer,
}: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const estAdminSysteme = systeme && roleCode === 'admin';

  function dupliquer() {
    startTransition(async () => {
      const res = await onDupliquer();
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      toast.success('Rôle dupliqué');
      router.push(`/administration/roles/${res.data.id}`);
    });
  }

  function basculer() {
    startTransition(async () => {
      const res = await onBasculerActif(!actif);
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      toast.success(actif ? 'Rôle désactivé' : 'Rôle activé');
      router.refresh();
    });
  }

  function supprimer() {
    if (
      !confirm(
        'Supprimer définitivement ce rôle ? Cette action est irréversible. Aucun utilisateur ne doit y être rattaché.',
      )
    ) {
      return;
    }
    startTransition(async () => {
      const res = await onSupprimer();
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      toast.success('Rôle supprimé');
      router.refresh();
    });
  }

  return (
    <div className="flex justify-end gap-3 whitespace-nowrap text-sm">
      <Link
        href={`/administration/roles/${roleId}`}
        className="text-primary underline underline-offset-4 hover:text-primary/80"
      >
        Modifier
      </Link>
      <button
        type="button"
        onClick={dupliquer}
        disabled={isPending}
        className="text-primary underline underline-offset-4 hover:text-primary/80 disabled:opacity-50"
      >
        Dupliquer
      </button>
      {!estAdminSysteme && (
        <button
          type="button"
          onClick={basculer}
          disabled={isPending}
          className="text-primary underline underline-offset-4 hover:text-primary/80 disabled:opacity-50"
        >
          {actif ? 'Désactiver' : 'Activer'}
        </button>
      )}
      {!systeme && (
        <button
          type="button"
          onClick={supprimer}
          disabled={isPending}
          className="text-destructive underline underline-offset-4 hover:text-destructive/80 disabled:opacity-50"
        >
          Supprimer
        </button>
      )}
    </div>
  );
}
