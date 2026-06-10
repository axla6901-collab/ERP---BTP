'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useTransition } from 'react';
import { toast } from 'sonner';

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

type ActionResult<T = void> =
  | { ok: true; data: T }
  | { ok: false; error: string; fieldErrors?: Record<string, string[]> };

export type RoleOption = {
  id: string;
  code: string;
  libelle: string;
};

type Props = {
  utilisateurId: string;
  roleIdCourant: string;
  rolesDisponibles: RoleOption[];
  actif: boolean;
  supprime: boolean;
  estSoi: boolean;
  onAssignerRole: (roleId: string) => Promise<ActionResult>;
  onBasculerActif: (actif: boolean) => Promise<ActionResult>;
  onSupprimer: () => Promise<ActionResult>;
  onRestaurer: () => Promise<ActionResult>;
};

export function UtilisateurActions({
  utilisateurId,
  roleIdCourant,
  rolesDisponibles,
  actif,
  supprime,
  estSoi,
  onAssignerRole,
  onBasculerActif,
  onSupprimer,
  onRestaurer,
}: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  function changerRole(roleId: string) {
    if (roleId === roleIdCourant) return;
    startTransition(async () => {
      const res = await onAssignerRole(roleId);
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      toast.success('Rôle modifié');
      router.refresh();
    });
  }

  function basculer() {
    startTransition(async () => {
      const res = await onBasculerActif(!actif);
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      toast.success(actif ? 'Utilisateur désactivé' : 'Utilisateur activé');
      router.refresh();
    });
  }

  function supprimer() {
    if (
      !confirm(
        'Supprimer cet utilisateur ? Soft delete : la ligne est conservée pour traçabilité mais le compte est désactivé.',
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
      toast.success('Utilisateur supprimé');
      router.refresh();
    });
  }

  function restaurer() {
    startTransition(async () => {
      const res = await onRestaurer();
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      toast.success('Utilisateur restauré');
      router.refresh();
    });
  }

  return (
    <div className="flex flex-wrap items-center justify-end gap-2 text-sm">
      {!supprime && (
        <Select
          value={roleIdCourant}
          onValueChange={(v) => v && changerRole(v)}
          disabled={isPending}
        >
          <SelectTrigger className="h-8 w-[180px] text-xs">
            <SelectValue>
              {(value) => {
                const r = rolesDisponibles.find((opt) => opt.id === value);
                return r ? r.libelle : 'Sélectionner…';
              }}
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            {rolesDisponibles.map((r) => (
              <SelectItem key={r.id} value={r.id}>
                <div>
                  <div>{r.libelle}</div>
                  <div className="font-mono text-[10px] uppercase tracking-wide text-muted-foreground">
                    {r.code}
                  </div>
                </div>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}
      <Link
        href={`/administration/utilisateurs/${utilisateurId}`}
        className="text-primary underline underline-offset-4 hover:text-primary/80"
      >
        Modifier
      </Link>
      {!supprime && (
        <button
          type="button"
          onClick={basculer}
          disabled={isPending || estSoi}
          title={estSoi ? 'Tu ne peux pas modifier ton propre statut.' : undefined}
          className="text-primary underline underline-offset-4 hover:text-primary/80 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {actif ? 'Désactiver' : 'Activer'}
        </button>
      )}
      {!supprime && (
        <button
          type="button"
          onClick={supprimer}
          disabled={isPending || estSoi}
          title={estSoi ? 'Tu ne peux pas supprimer ton propre compte.' : undefined}
          className="text-destructive underline underline-offset-4 hover:text-destructive/80 disabled:cursor-not-allowed disabled:opacity-50"
        >
          Supprimer
        </button>
      )}
      {supprime && (
        <button
          type="button"
          onClick={restaurer}
          disabled={isPending}
          className="text-primary underline underline-offset-4 hover:text-primary/80 disabled:opacity-50"
        >
          Restaurer
        </button>
      )}
    </div>
  );
}
