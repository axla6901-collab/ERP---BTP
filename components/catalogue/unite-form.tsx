'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useRouter } from 'next/navigation';

import { useGuardedRouter, useUnsavedChangesGuard } from "@/lib/hooks/navigation-guard";
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';

import { PageToolbar } from '@/components/layout/page-toolbar';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import {
  Form,
  FormControl,
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
import { uniteSchema, UNITE_TYPES, type UniteInput, type UniteType } from '@/lib/validation/catalogue';

const LIBELLES_TYPE: Record<UniteType, string> = {
  masse: 'Masse',
  longueur: 'Longueur',
  surface: 'Surface',
  volume: 'Volume',
  unitaire: 'Unitaire',
  temps: 'Temps',
  autre: 'Autre',
};

type ServerActionResult = {
  ok: boolean;
  error?: string;
  fieldErrors?: Record<string, string[]>;
  data?: { id: string } | void;
};

type Props = {
  defaultValues?: Partial<UniteInput>;
  onSubmit: (values: UniteInput) => Promise<ServerActionResult>;
  successRedirect: string;
  /** Titre affiché à gauche de la barre d'actions figée. */
  titre: string;
  /** Actions secondaires rendues dans la barre. */
  actions?: React.ReactNode;
};

export function UniteForm({ defaultValues, onSubmit, successRedirect, titre, actions }: Props) {
  const router = useRouter();
  const guardedRouter = useGuardedRouter();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);

  const form = useForm({
    resolver: zodResolver(uniteSchema),
    defaultValues: {
      code: defaultValues?.code ?? '',
      libelle: defaultValues?.libelle ?? '',
      symbole: defaultValues?.symbole ?? '',
      type: defaultValues?.type ?? 'unitaire',
      actif: defaultValues?.actif ?? true,
    },
  });
  useUnsavedChangesGuard({ isDirty: form.formState.isDirty });

  async function handleSubmit(values: UniteInput) {
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
    toast.success('Unité enregistrée');
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
            <Button type="submit" form="unite-form" size="sm" disabled={isSubmitting}>
              {isSubmitting ? 'Enregistrement…' : 'Enregistrer'}
            </Button>
          </>
        }
      />
      <form
        id="unite-form"
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
        <FormSection number={1} title="Identification" storageKey="unite:identification">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <FormField
              control={form.control}
              name="code"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Code</FormLabel>
                  <FormControl>
                    <Input maxLength={16} placeholder="KG" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="symbole"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Symbole</FormLabel>
                  <FormControl>
                    <Input maxLength={10} placeholder="kg" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>
          <FormField
            control={form.control}
            name="libelle"
            render={({ field }) => (
              <FormItem className="mt-4">
                <FormLabel>Libellé</FormLabel>
                <FormControl>
                  <Input maxLength={100} placeholder="Kilogramme" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </FormSection>
        <FormSection number={2} title="Classification" storageKey="unite:classification">
          <FormField
            control={form.control}
            name="type"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Type</FormLabel>
                <Select value={field.value} onValueChange={field.onChange}>
                  <FormControl>
                    <SelectTrigger>
                      <SelectValue placeholder="Type">
                        {(value) => LIBELLES_TYPE[value as UniteType] ?? 'Type'}
                      </SelectValue>
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    {UNITE_TYPES.map((t) => (
                      <SelectItem key={t} value={t}>
                        {LIBELLES_TYPE[t]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
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
