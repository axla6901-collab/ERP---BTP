'use client';

import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { toast } from 'sonner';

import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { FormSection } from '@/components/ui/form-section';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';

type ActionResult<T = void> =
  | { ok: true; data: T }
  | { ok: false; error: string; fieldErrors?: Record<string, string[]> };

type RoleOption = {
  id: string;
  code: string;
  libelle: string;
  actif: boolean;
};

type Props = {
  email: string;
  defaultValues: { roleId: string; actif: boolean };
  rolesDisponibles: RoleOption[];
  onSubmit: (values: { roleId: string; actif: boolean }) => Promise<ActionResult>;
  successRedirect: string;
};

export function UtilisateurForm({
  email,
  defaultValues,
  rolesDisponibles,
  onSubmit,
  successRedirect,
}: Props) {
  const router = useRouter();
  const [roleId, setRoleId] = useState(defaultValues.roleId);
  const [actif, setActif] = useState(defaultValues.actif);
  const [erreur, setErreur] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function enregistrer() {
    setErreur(null);
    startTransition(async () => {
      const res = await onSubmit({ roleId, actif });
      if (!res.ok) {
        setErreur(res.error);
        return;
      }
      toast.success('Utilisateur enregistré');
      router.push(successRedirect);
      router.refresh();
    });
  }

  return (
    <div className="grid max-w-xl gap-4">
      {erreur && (
        <Alert variant="destructive">
          <AlertTitle>Erreur</AlertTitle>
          <AlertDescription>{erreur}</AlertDescription>
        </Alert>
      )}

      <FormSection number={1} title="Identification" storageKey="utilisateur:identification">
        <div className="grid gap-2">
          <Label>Email</Label>
          <div className="font-mono text-sm">{email}</div>
        </div>
      </FormSection>

      <FormSection number={2} title="Rôle et accès" storageKey="utilisateur:role">
        <div className="grid gap-4">
          <div className="grid gap-2">
            <Label>Rôle</Label>
            <Select
              value={roleId}
              onValueChange={(v) => v && setRoleId(v)}
              disabled={isPending}
            >
              <SelectTrigger>
                <SelectValue>
                  {(value) => {
                    const r = rolesDisponibles.find((opt) => opt.id === value);
                    return r ? r.libelle : 'Sélectionner un rôle…';
                  }}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                {rolesDisponibles.map((r) => (
                  <SelectItem key={r.id} value={r.id} disabled={!r.actif}>
                    <div>
                      <div>
                        {r.libelle}
                        {!r.actif && (
                          <span className="ml-2 text-[10px] uppercase text-muted-foreground">
                            désactivé
                          </span>
                        )}
                      </div>
                      <div className="font-mono text-[10px] uppercase tracking-wide text-muted-foreground">
                        {r.code}
                      </div>
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="flex items-center gap-3">
            <Switch checked={actif} onCheckedChange={setActif} disabled={isPending} />
            <Label className="!mt-0">Compte actif</Label>
          </div>
        </div>
      </FormSection>

      <div className="flex justify-end gap-2">
        <Button variant="ghost" type="button" onClick={() => router.back()} disabled={isPending}>
          Annuler
        </Button>
        <Button type="button" onClick={enregistrer} disabled={isPending}>
          {isPending ? 'Enregistrement…' : 'Enregistrer'}
        </Button>
      </div>
    </div>
  );
}
