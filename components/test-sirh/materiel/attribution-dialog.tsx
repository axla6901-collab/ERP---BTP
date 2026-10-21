'use client';

import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';

import { OptionSelect, type OptionListe } from '@/components/test-sirh/option-select';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import type { ActionResult } from '@/lib/common/action-result';
import { typedZodResolver } from '@/lib/forms/zod-resolver';
import {
  attributionMaterielSchema,
  type AttributionMaterielInput,
} from '@/lib/validation/test-sirh/materiel';

export type MaterielAAttribuer = { id: string; libelle: string; numeroSerie: string | null };

export function valeursAttributionParDefaut(
  materielId: string,
  today: string,
): AttributionMaterielInput {
  return {
    materielId,
    employeId: '',
    dateRemise: today,
    etatRemise: null,
    dechargeSignee: false,
    commentaire: null,
  };
}

type Props = {
  /** Matériel à remettre ; `null` = modale fermée. */
  materiel: MaterielAAttribuer | null;
  employes: readonly OptionListe[];
  today: string;
  onClose: () => void;
  onSubmit: (values: AttributionMaterielInput) => Promise<ActionResult<{ id: string }>>;
};

/** Remise d'un matériel en stock à un collaborateur (décharge de remise). */
export function AttributionMaterielDialog({ materiel, employes, today, onClose, onSubmit }: Props) {
  const [erreur, setErreur] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const form = useForm<AttributionMaterielInput>({
    resolver: typedZodResolver(attributionMaterielSchema),
    defaultValues: valeursAttributionParDefaut(materiel?.id ?? '', today),
  });

  useEffect(() => {
    if (materiel) {
      form.reset(valeursAttributionParDefaut(materiel.id, today));
      setErreur(null);
    }
  }, [materiel, today, form]);

  async function handleSubmit(values: AttributionMaterielInput) {
    setErreur(null);
    setIsSubmitting(true);
    const r = await onSubmit(values);
    setIsSubmitting(false);
    if (!r.ok) {
      setErreur(r.error);
      if (r.fieldErrors) {
        for (const [champ, msgs] of Object.entries(r.fieldErrors)) {
          if (msgs?.[0]) form.setError(champ as never, { type: 'server', message: msgs[0] });
        }
      }
      return;
    }
    toast.success('Matériel attribué');
    onClose();
  }

  return (
    <Dialog open={materiel !== null} onOpenChange={(o) => (!o ? onClose() : undefined)}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Attribuer le matériel</DialogTitle>
          {materiel && (
            <DialogDescription>
              {materiel.libelle}
              {materiel.numeroSerie && ` · n° ${materiel.numeroSerie}`}
            </DialogDescription>
          )}
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(handleSubmit)} className="grid gap-4" noValidate>
            {erreur && (
              <Alert variant="destructive">
                <AlertTitle>Erreur</AlertTitle>
                <AlertDescription>{erreur}</AlertDescription>
              </Alert>
            )}
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <FormField
                control={form.control}
                name="employeId"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Collaborateur</FormLabel>
                    <OptionSelect
                      options={employes}
                      value={field.value || null}
                      onChange={(v) => field.onChange(v ?? '')}
                      libelleAucune="Choisir…"
                      aria-label="Collaborateur"
                    />
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="dateRemise"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Date de remise</FormLabel>
                    <FormControl>
                      <Input type="date" max={today} {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
            <FormField
              control={form.control}
              name="etatRemise"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>État à la remise</FormLabel>
                  <FormControl>
                    <Input
                      maxLength={200}
                      placeholder="Ex. Neuf, bon état…"
                      {...field}
                      value={field.value ?? ''}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="dechargeSignee"
              render={({ field }) => (
                <FormItem className="flex items-center gap-2">
                  <FormControl>
                    <Switch checked={field.value} onCheckedChange={field.onChange} />
                  </FormControl>
                  <FormLabel className="!mt-0">Décharge de remise signée</FormLabel>
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="commentaire"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Commentaire</FormLabel>
                  <FormControl>
                    <Textarea rows={2} maxLength={1000} {...field} value={field.value ?? ''} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <DialogFooter>
              <Button type="button" variant="ghost" onClick={onClose} disabled={isSubmitting}>
                Annuler
              </Button>
              <Button type="submit" disabled={isSubmitting}>
                {isSubmitting ? 'Enregistrement…' : 'Attribuer'}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
