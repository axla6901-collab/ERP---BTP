'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useRouter } from 'next/navigation';

import { useGuardedRouter, useUnsavedChangesGuard } from '@/lib/hooks/navigation-guard';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';

import { PageToolbar } from '@/components/layout/page-toolbar';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { FormSection } from '@/components/ui/form-section';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { familleSchema, type FamilleInput } from '@/lib/validation/catalogue';

type ServerActionResult = {
  ok: boolean;
  error?: string;
  fieldErrors?: Record<string, string[]>;
  data?: { id: string } | void;
};

type FamilleOption = { id: string; code: string; libelle: string };

type Props = {
  defaultValues?: Partial<FamilleInput>;
  /** Liste des familles disponibles comme parent (toutes sauf l'enfant lui-même + descendants). */
  parentsDisponibles: FamilleOption[];
  onSubmit: (values: FamilleInput) => Promise<ServerActionResult>;
  successRedirect: string;
  /** Titre affiché à gauche de la barre d'actions figée. */
  titre: string;
  /** Actions secondaires rendues dans la barre. */
  actions?: React.ReactNode;
};

export function FamilleForm({
  defaultValues,
  parentsDisponibles,
  onSubmit,
  successRedirect,
  titre,
  actions,
}: Props) {
  const router = useRouter();
  const guardedRouter = useGuardedRouter();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);

  const form = useForm({
    resolver: zodResolver(familleSchema),
    defaultValues: {
      code: defaultValues?.code ?? '',
      libelle: defaultValues?.libelle ?? '',
      parentId: defaultValues?.parentId ?? null,
      description: defaultValues?.description ?? '',
      ordre: defaultValues?.ordre ?? 0,
      actif: defaultValues?.actif ?? true,
    },
  });
  useUnsavedChangesGuard({ isDirty: form.formState.isDirty });

  async function handleSubmit(values: FamilleInput) {
    setErreur(null);
    setIsSubmitting(true);
    const result = await onSubmit(values);
    setIsSubmitting(false);

    if (!result.ok) {
      setErreur(result.error ?? 'Enregistrement impossible.');
      if (result.fieldErrors) {
        for (const [field, msgs] of Object.entries(result.fieldErrors)) {
          if (msgs?.[0]) form.setError(field as never, { type: 'server', message: msgs[0] });
        }
      }
      return;
    }
    toast.success('Famille enregistrée');
    router.push(successRedirect);
    router.refresh();
  }

  return (
    <Form {...form}>
      <PageToolbar
        title={titre}
        actions={
          <>
            <Button
              variant="ghost"
              type="button"
              size="sm"
              onClick={() => guardedRouter.back()}
              disabled={isSubmitting}
            >
              Annuler
            </Button>
            {actions}
            <Button type="submit" form="famille-form" size="sm" disabled={isSubmitting}>
              {isSubmitting ? 'Enregistrement…' : 'Enregistrer'}
            </Button>
          </>
        }
      />
      <form
        id="famille-form"
        method="post"
        onSubmit={form.handleSubmit(handleSubmit)}
        className="grid max-w-2xl gap-4"
      >
        {erreur && (
          <Alert variant="destructive">
            <AlertTitle>Erreur</AlertTitle>
            <AlertDescription>{erreur}</AlertDescription>
          </Alert>
        )}
        <FormSection number={1} title="Identification" storageKey="famille:identification">
          <FormField
            control={form.control}
            name="code"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Code</FormLabel>
                <FormControl>
                  <Input placeholder="GROS-OEUVRE" maxLength={32} {...field} />
                </FormControl>
                <FormDescription>
                  Identifiant court (2-32 caractères, lettres / chiffres / . _ -). Forcé en
                  majuscules.
                </FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="libelle"
            render={({ field }) => (
              <FormItem className="mt-4">
                <FormLabel>Libellé</FormLabel>
                <FormControl>
                  <Input maxLength={200} {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </FormSection>
        <FormSection number={2} title="Hiérarchie" storageKey="famille:hierarchie">
          <FormField
            control={form.control}
            name="parentId"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Famille parente (optionnel)</FormLabel>
                <Select
                  value={field.value ?? '__none__'}
                  onValueChange={(v) => field.onChange(v === '__none__' ? null : v)}
                >
                  <FormControl>
                    <SelectTrigger>
                      <SelectValue placeholder="Aucune (racine)">
                        {(value) => {
                          if (!value || value === '__none__') return 'Aucune (racine)';
                          const found = parentsDisponibles.find((x) => x.id === value);
                          return found ? `${found.code} — ${found.libelle}` : String(value);
                        }}
                      </SelectValue>
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    <SelectItem value="__none__">Aucune (racine)</SelectItem>
                    {parentsDisponibles.map((p) => (
                      <SelectItem key={p.id} value={p.id}>
                        {p.code} — {p.libelle}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <FormDescription>
                  Laisser vide pour créer une famille racine. Profondeur max 5 niveaux.
                </FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />
        </FormSection>
        <FormSection number={3} title="Description et statut" storageKey="famille:description">
          <FormField
            control={form.control}
            name="description"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Description (optionnel)</FormLabel>
                <FormControl>
                  <Textarea rows={4} {...field} value={field.value ?? ''} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="actif"
            render={({ field }) => (
              <FormItem className="mt-4 flex items-center gap-3">
                <FormControl>
                  <Switch checked={field.value} onCheckedChange={field.onChange} />
                </FormControl>
                <FormLabel className="!mt-0">Actif</FormLabel>
              </FormItem>
            )}
          />
        </FormSection>
      </form>
    </Form>
  );
}
