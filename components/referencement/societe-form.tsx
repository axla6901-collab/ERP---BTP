'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { useForm, type DefaultValues } from 'react-hook-form';
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
import { Switch } from '@/components/ui/switch';
import { useGuardedRouter, useUnsavedChangesGuard } from '@/lib/hooks/navigation-guard';
import { typedZodResolver } from '@/lib/forms/zod-resolver';
import { societeSchema, type SocieteInput } from '@/lib/validation/referencement-tiers';

type ServerActionResult = {
  ok: boolean;
  error?: string;
  fieldErrors?: Record<string, string[]>;
  data?: { id: string } | void;
};

type Props = {
  defaultValues?: Partial<SocieteInput>;
  onSubmit: (values: SocieteInput) => Promise<ServerActionResult>;
  successRedirect: string;
  titre: string;
};

export function SocieteForm({ defaultValues, onSubmit, successRedirect, titre }: Props) {
  const router = useRouter();
  const guardedRouter = useGuardedRouter();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);

  const form = useForm<SocieteInput>({
    resolver: typedZodResolver(societeSchema),
    defaultValues: {
      code: defaultValues?.code ?? '',
      raisonSociale: defaultValues?.raisonSociale ?? '',
      siret: defaultValues?.siret ?? '',
      actif: defaultValues?.actif ?? true,
    } as DefaultValues<SocieteInput>,
  });
  useUnsavedChangesGuard({ isDirty: form.formState.isDirty });

  async function handleSubmit(values: SocieteInput) {
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
    toast.success('Société enregistrée');
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
            <Button type="submit" form="societe-form" size="sm" disabled={isSubmitting}>
              {isSubmitting ? 'Enregistrement…' : 'Enregistrer'}
            </Button>
          </>
        }
      />
      <form
        id="societe-form"
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
        <FormSection number={1} title="Société du groupe" storageKey="societe:identification">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <FormField
              control={form.control}
              name="code"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Code</FormLabel>
                  <FormControl>
                    <Input maxLength={32} placeholder="SBI" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="siret"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>SIRET (optionnel)</FormLabel>
                  <FormControl>
                    <Input
                      maxLength={14}
                      placeholder="14 chiffres"
                      {...field}
                      value={field.value ?? ''}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>
          <FormField
            control={form.control}
            name="raisonSociale"
            render={({ field }) => (
              <FormItem className="mt-4">
                <FormLabel>Raison sociale</FormLabel>
                <FormControl>
                  <Input maxLength={200} {...field} />
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
                <FormLabel className="!mt-0">Active</FormLabel>
              </FormItem>
            )}
          />
        </FormSection>
      </form>
    </Form>
  );
}
