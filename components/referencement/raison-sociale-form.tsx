'use client';

import { useRouter } from 'next/navigation';
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
import { Switch } from '@/components/ui/switch';
import { useGuardedRouter, useUnsavedChangesGuard } from '@/lib/hooks/navigation-guard';
import { typedZodResolver } from '@/lib/forms/zod-resolver';
import { raisonSocialeSchema, type RaisonSocialeInput } from '@/lib/validation/raisons-sociales';
import { useCheminTenant } from '@/lib/navigation/use-chemin-tenant';

type ServerActionResult = {
  ok: boolean;
  error?: string;
  fieldErrors?: Record<string, string[]>;
  data?: { id: string } | void;
};

type Props = {
  defaultValues?: Partial<RaisonSocialeInput>;
  onSubmit: (values: RaisonSocialeInput) => Promise<ServerActionResult>;
  successRedirect: string;
  titre: string;
};

export function RaisonSocialeForm({ defaultValues, onSubmit, successRedirect, titre }: Props) {
  const router = useRouter();
  const versTenant = useCheminTenant();
  const guardedRouter = useGuardedRouter();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);

  const form = useForm<RaisonSocialeInput>({
    resolver: typedZodResolver(raisonSocialeSchema),
    defaultValues: {
      raisonSociale: defaultValues?.raisonSociale ?? '',
      actif: defaultValues?.actif ?? true,
    },
  });
  useUnsavedChangesGuard({ isDirty: form.formState.isDirty });

  async function handleSubmit(values: RaisonSocialeInput) {
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
    toast.success('Raison sociale enregistrée');
    router.push(versTenant(successRedirect));
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
            <Button type="submit" form="raison-sociale-form" size="sm" disabled={isSubmitting}>
              {isSubmitting ? 'Enregistrement…' : 'Enregistrer'}
            </Button>
          </>
        }
      />
      <form
        id="raison-sociale-form"
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
        <FormSection number={1} title="Identification" storageKey="raison-sociale:identification">
          <FormField
            control={form.control}
            name="raisonSociale"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Raison sociale</FormLabel>
                <FormControl>
                  <Input maxLength={200} placeholder="Entreprise SARL" {...field} />
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
