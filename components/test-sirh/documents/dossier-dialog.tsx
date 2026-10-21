'use client';

import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';

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
  dossierDocumentsSchema,
  type DossierDocumentsInput,
} from '@/lib/validation/test-sirh/documents';

/** Valeurs initiales : TOUTES les clés présentes. */
export function valeursDossierParDefaut(
  dossier?: Partial<DossierDocumentsInput> | null,
): DossierDocumentsInput {
  return {
    id: dossier?.id,
    nom: dossier?.nom ?? '',
    description: dossier?.description ?? null,
    visibleSalarie: dossier?.visibleSalarie ?? false,
    ordre: dossier?.ordre ?? 0,
  };
}

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Dossier à modifier ; `null` = création. */
  dossier: Partial<DossierDocumentsInput> | null;
  onSubmit: (values: DossierDocumentsInput) => Promise<ActionResult<{ id: string }>>;
};

/** Création / modification d'un dossier de la GED RH (Factorial documents/Folder). */
export function DossierDialog({ open, onOpenChange, dossier, onSubmit }: Props) {
  const [erreur, setErreur] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const enEdition = Boolean(dossier?.id);

  const form = useForm<DossierDocumentsInput>({
    resolver: typedZodResolver(dossierDocumentsSchema),
    defaultValues: valeursDossierParDefaut(dossier),
  });

  useEffect(() => {
    if (open) {
      form.reset(valeursDossierParDefaut(dossier));
      setErreur(null);
    }
  }, [open, dossier, form]);

  async function handleSubmit(values: DossierDocumentsInput) {
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
    toast.success(enEdition ? 'Dossier mis à jour' : 'Dossier créé');
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{enEdition ? 'Modifier le dossier' : 'Nouveau dossier'}</DialogTitle>
          <DialogDescription>
            Classement des documents RH (contrats, bulletins, attestations…). Un dossier « visible
            salarié » apparaît dans Mon espace.
          </DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(handleSubmit)} className="grid gap-4">
            {erreur && (
              <Alert variant="destructive">
                <AlertTitle>Erreur</AlertTitle>
                <AlertDescription>{erreur}</AlertDescription>
              </Alert>
            )}
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <FormField
                control={form.control}
                name="nom"
                render={({ field }) => (
                  <FormItem className="sm:col-span-2">
                    <FormLabel>Nom</FormLabel>
                    <FormControl>
                      <Input maxLength={120} {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="ordre"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Ordre</FormLabel>
                    <FormControl>
                      <Input
                        type="number"
                        min={0}
                        max={9999}
                        step={10}
                        name={field.name}
                        ref={field.ref}
                        onBlur={field.onBlur}
                        value={field.value ?? ''}
                        onChange={(e) => field.onChange(e.target.value)}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
            <FormField
              control={form.control}
              name="description"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Description</FormLabel>
                  <FormControl>
                    <Textarea rows={2} maxLength={500} {...field} value={field.value ?? ''} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="visibleSalarie"
              render={({ field }) => (
                <FormItem className="flex items-center gap-2">
                  <FormControl>
                    <Switch checked={field.value} onCheckedChange={field.onChange} />
                  </FormControl>
                  <FormLabel className="!mt-0">Visible par le salarié (Mon espace)</FormLabel>
                </FormItem>
              )}
            />
            <DialogFooter>
              <Button
                type="button"
                variant="ghost"
                onClick={() => onOpenChange(false)}
                disabled={isSubmitting}
              >
                Annuler
              </Button>
              <Button type="submit" disabled={isSubmitting}>
                {isSubmitting ? 'Enregistrement…' : enEdition ? 'Enregistrer' : 'Créer le dossier'}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
