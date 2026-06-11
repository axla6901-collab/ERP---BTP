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
import { useGuardedRouter, useUnsavedChangesGuard } from '@/lib/hooks/navigation-guard';
import { typedZodResolver } from '@/lib/forms/zod-resolver';
import {
  LIBELLES_MODE_CONTROLE,
  MODES_CONTROLE_DOCUMENT,
  natureDocumentSchema,
  type ModeControleDocument,
  type NatureDocumentInput,
} from '@/lib/validation/referencement-tiers';

type ServerActionResult = {
  ok: boolean;
  error?: string;
  fieldErrors?: Record<string, string[]>;
  data?: { id: string } | void;
};

type Props = {
  defaultValues?: Partial<NatureDocumentInput>;
  onSubmit: (values: NatureDocumentInput) => Promise<ServerActionResult>;
  successRedirect: string;
  titre: string;
};

export function NatureDocumentForm({ defaultValues, onSubmit, successRedirect, titre }: Props) {
  const router = useRouter();
  const guardedRouter = useGuardedRouter();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);

  const form = useForm<NatureDocumentInput>({
    resolver: typedZodResolver(natureDocumentSchema),
    defaultValues: {
      code: defaultValues?.code ?? '',
      libelle: defaultValues?.libelle ?? '',
      modeControle: defaultValues?.modeControle ?? 'duree_jours',
      delaiValiditeJours: defaultValues?.delaiValiditeJours ?? null,
      delaiRelanceJours: defaultValues?.delaiRelanceJours ?? null,
      ordreAffichage: defaultValues?.ordreAffichage ?? 0,
      actif: defaultValues?.actif ?? true,
    } as DefaultValues<NatureDocumentInput>,
  });
  useUnsavedChangesGuard({ isDirty: form.formState.isDirty });

  const mode = form.watch('modeControle') as ModeControleDocument;
  const validiteApplicable = mode === 'duree_jours' || mode === 'date_fin_assurance';

  async function handleSubmit(values: NatureDocumentInput) {
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
    toast.success('Nature de document enregistrée');
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
            <Button type="submit" form="nature-document-form" size="sm" disabled={isSubmitting}>
              {isSubmitting ? 'Enregistrement…' : 'Enregistrer'}
            </Button>
          </>
        }
      />
      <form
        id="nature-document-form"
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
        <FormSection number={1} title="Identification" storageKey="nature-doc:identification">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <FormField
              control={form.control}
              name="code"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Code</FormLabel>
                  <FormControl>
                    <Input maxLength={32} placeholder="KBIS" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="ordreAffichage"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Ordre d’affichage</FormLabel>
                  <FormControl>
                    <Input type="number" min={0} {...field} />
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
                  <Input maxLength={200} placeholder="Extrait K-bis" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </FormSection>

        <FormSection number={2} title="Contrôle de validité" storageKey="nature-doc:controle">
          <FormField
            control={form.control}
            name="modeControle"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Mode de contrôle</FormLabel>
                <Select value={field.value} onValueChange={field.onChange}>
                  <FormControl>
                    <SelectTrigger>
                      <SelectValue>
                        {(v) => LIBELLES_MODE_CONTROLE[v as ModeControleDocument] ?? 'Mode'}
                      </SelectValue>
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    {MODES_CONTROLE_DOCUMENT.map((m) => (
                      <SelectItem key={m} value={m}>
                        {LIBELLES_MODE_CONTROLE[m]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <FormDescription>
                  Durée (jours), date de fin (assurance) + tolérance, case à cocher, ou date
                  d’obtention.
                </FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />
          <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
            <FormField
              control={form.control}
              name="delaiValiditeJours"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>
                    {mode === 'date_fin_assurance'
                      ? 'Tolérance après expiration (jours)'
                      : 'Délai de validité (jours)'}
                  </FormLabel>
                  <FormControl>
                    <Input
                      type="number"
                      min={0}
                      disabled={!validiteApplicable}
                      value={field.value ?? ''}
                      onChange={(e) =>
                        field.onChange(e.target.value === '' ? null : Number(e.target.value))
                      }
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="delaiRelanceJours"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Délai de relance avant expiration (jours)</FormLabel>
                  <FormControl>
                    <Input
                      type="number"
                      min={0}
                      value={field.value ?? ''}
                      onChange={(e) =>
                        field.onChange(e.target.value === '' ? null : Number(e.target.value))
                      }
                    />
                  </FormControl>
                  <FormDescription>Laisser vide pour aucune relance.</FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>
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
