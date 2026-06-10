'use client';

import { ChevronDownIcon, ChevronRightIcon, SaveIcon, Undo2Icon } from 'lucide-react';
import { Fragment, useEffect, useMemo, useState, useTransition } from 'react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import type { MatriceBatch } from '@/lib/validation/admin';

export type RoleLigne = {
  id: string;
  code: string;
  libelle: string;
  systeme: boolean;
  actif: boolean;
};

export type PermissionLigne = {
  id: string;
  code: string;
  libelle: string;
  description: string | null;
};

export type GroupePermissions = {
  module: string;
  sousGroupes: Array<{
    sousModule: string | null;
    permissions: PermissionLigne[];
  }>;
};

type ServerActionResult = {
  ok: boolean;
  error?: string;
  data?: { applied: number };
};

type Props = {
  roles: RoleLigne[];
  groupes: GroupePermissions[];
  /** Couples roleId::permissionId initialement accordés. */
  accordeesInitiales: Set<string>;
  onEnregistrer: (changements: MatriceBatch) => Promise<ServerActionResult>;
};

function cle(roleId: string, permId: string): string {
  return `${roleId}::${permId}`;
}

export function MatricePermissions({
  roles,
  groupes,
  accordeesInitiales,
  onEnregistrer,
}: Props) {
  /** roleId::permissionId → granted (état souhaité, différent de l'initial) */
  const [changements, setChangements] = useState<Map<string, boolean>>(new Map());
  const [modulesReplies, setModulesReplies] = useState<Set<string>>(
    () => new Set(groupes.map((g) => g.module)),
  );
  const [sousModulesReplies, setSousModulesReplies] = useState<Set<string>>(
    () =>
      new Set(
        groupes.flatMap((g) =>
          g.sousGroupes
            .filter((sg) => sg.sousModule)
            .map((sg) => `${g.module}::${sg.sousModule}`),
        ),
      ),
  );
  const [isPending, startTransition] = useTransition();

  function toggleModule(module: string) {
    setModulesReplies((prev) => {
      const next = new Set(prev);
      if (next.has(module)) next.delete(module);
      else next.add(module);
      return next;
    });
  }

  function toggleSousModule(cle: string) {
    setSousModulesReplies((prev) => {
      const next = new Set(prev);
      if (next.has(cle)) next.delete(cle);
      else next.add(cle);
      return next;
    });
  }

  const adminRoleId = useMemo(() => roles.find((r) => r.code === 'admin')?.id, [roles]);
  const dirty = changements.size > 0;

  // Avertissement avant fermeture/navigation si modifications non enregistrées
  useEffect(() => {
    if (!dirty) return;
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [dirty]);

  function etatCourant(roleId: string, permId: string): boolean {
    const k = cle(roleId, permId);
    if (changements.has(k)) return changements.get(k)!;
    return accordeesInitiales.has(k);
  }

  function toggle(roleId: string, permId: string) {
    if (roleId === adminRoleId) return;
    const k = cle(roleId, permId);
    const nouvelEtat = !etatCourant(roleId, permId);
    const etatInitial = accordeesInitiales.has(k);
    const next = new Map(changements);
    if (nouvelEtat === etatInitial) {
      next.delete(k);
    } else {
      next.set(k, nouvelEtat);
    }
    setChangements(next);
  }

  function annuler() {
    setChangements(new Map());
  }

  function enregistrer() {
    const batch: MatriceBatch = Array.from(changements.entries()).map(([k, granted]) => {
      const [roleId, permissionId] = k.split('::');
      return { roleId: roleId!, permissionId: permissionId!, granted };
    });
    startTransition(async () => {
      const res = await onEnregistrer(batch);
      if (!res.ok) {
        toast.error(res.error ?? 'Enregistrement impossible.');
        return;
      }
      toast.success(
        `${res.data?.applied ?? batch.length} modification${(res.data?.applied ?? batch.length) > 1 ? 's' : ''} enregistrée${(res.data?.applied ?? batch.length) > 1 ? 's' : ''}.`,
      );
      setChangements(new Map());
    });
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-end gap-2">
        {dirty && (
          <span className="text-xs text-muted-foreground">
            {changements.size} modification{changements.size > 1 ? 's' : ''} en attente
          </span>
        )}
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={annuler}
          disabled={!dirty || isPending}
        >
          <Undo2Icon className="mr-1 size-3.5" />
          Annuler
        </Button>
        <Button
          type="button"
          size="sm"
          onClick={enregistrer}
          disabled={!dirty || isPending}
        >
          <SaveIcon className="mr-1 size-3.5" />
          {isPending ? 'Enregistrement…' : 'Enregistrer la matrice'}
        </Button>
      </div>

      <div className="overflow-x-auto rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="min-w-[280px]">Permission</TableHead>
              {roles.map((r) => (
                <TableHead key={r.id} className="text-center">
                  <div className="font-mono text-[10px] uppercase">{r.code}</div>
                  <div className="text-xs font-normal text-muted-foreground">{r.libelle}</div>
                  {r.id === adminRoleId && (
                    <div className="text-[10px] text-muted-foreground italic">verrouillé</div>
                  )}
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {groupes.map((g) => {
              const moduleReplie = modulesReplies.has(g.module);
              return (
              <Fragment key={`mod-${g.module}`}>
                <TableRow className="bg-muted/40">
                  <TableCell colSpan={1 + roles.length} className="p-0 font-medium">
                    <button
                      type="button"
                      className="flex w-full cursor-pointer items-center gap-2 px-2 py-2 text-left hover:bg-muted/60"
                      aria-expanded={!moduleReplie}
                      onClick={() => toggleModule(g.module)}
                    >
                      {moduleReplie ? (
                        <ChevronRightIcon className="size-4" />
                      ) : (
                        <ChevronDownIcon className="size-4" />
                      )}
                      {g.module}
                    </button>
                  </TableCell>
                </TableRow>
                {!moduleReplie && g.sousGroupes.map((sg) => {
                  const cleSousModule = `${g.module}::${sg.sousModule ?? '_'}`;
                  const sousModuleReplie = sousModulesReplies.has(cleSousModule);
                  return (
                  <Fragment key={`sub-${cleSousModule}`}>
                    {sg.sousModule && (
                      <TableRow className="bg-muted/20">
                        <TableCell
                          colSpan={1 + roles.length}
                          className="p-0 text-xs font-medium text-muted-foreground"
                        >
                          <button
                            type="button"
                            className="flex w-full cursor-pointer items-center gap-2 py-2 pl-6 pr-2 text-left hover:bg-muted/40"
                            aria-expanded={!sousModuleReplie}
                            onClick={() => toggleSousModule(cleSousModule)}
                          >
                            {sousModuleReplie ? (
                              <ChevronRightIcon className="size-3.5" />
                            ) : (
                              <ChevronDownIcon className="size-3.5" />
                            )}
                            {sg.sousModule}
                          </button>
                        </TableCell>
                      </TableRow>
                    )}
                    {!sousModuleReplie && sg.permissions.map((p) => (
                      <TableRow key={p.id}>
                        <TableCell className="pl-8">
                          <div>{p.libelle}</div>
                          <div
                            className="font-mono text-[10px] uppercase tracking-wide text-muted-foreground"
                            title={p.description ?? undefined}
                          >
                            {p.code}
                          </div>
                        </TableCell>
                        {roles.map((r) => {
                          const k = cle(r.id, p.id);
                          const etat = etatCourant(r.id, p.id);
                          const modifie = changements.has(k);
                          const verrouille = r.id === adminRoleId;
                          return (
                            <TableCell
                              key={r.id}
                              className={
                                modifie
                                  ? 'bg-amber-50 text-center dark:bg-amber-950/40'
                                  : 'text-center'
                              }
                            >
                              <input
                                type="checkbox"
                                className="size-4 accent-primary disabled:cursor-not-allowed disabled:opacity-50"
                                checked={etat}
                                onChange={() => toggle(r.id, p.id)}
                                disabled={verrouille || isPending}
                                aria-label={`${p.libelle} pour ${r.libelle}`}
                              />
                            </TableCell>
                          );
                        })}
                      </TableRow>
                    ))}
                  </Fragment>
                  );
                })}
              </Fragment>
              );
            })}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
