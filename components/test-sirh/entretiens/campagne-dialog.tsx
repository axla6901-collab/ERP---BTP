'use client';

import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';

import { OptionSelect, optionsDepuisEnum } from '@/components/test-sirh/option-select';
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
import { Textarea } from '@/components/ui/textarea';
import type { ActionResult } from '@/lib/common/action-result';
import { typedZodResolver } from '@/lib/forms/zod-resolver';
import { campagneSchema, type CampagneInput } from '@/lib/validation/test-sirh/entretiens';
import { LIBELLES_TYPE_ENTRETIEN, TYPES_ENTRETIEN } from '@/lib/validation/test-sirh/enums';

const OPTIONS_TYPE = optionsDepuisEnum(TYPES_ENTRETIEN, LIBELLES_TYPE_ENTRETIEN);

/** Valeurs initiales : TOUTES les clés sont présentes (convention des schémas SIRH). */
export function valeursCampagneParDefaut(c?: Partial<CampagneInput> | null): CampagneInput {
  return {
    id: c?.id,
    libelle: c?.libelle ?? '',
    typeEntretien: c?.typeEntretien ?? 'annuel',
    dateDebut: c?.dateDebut ?? null,
    dateLimite: c?.dateLimite ?? null,
    description: c?.description ?? null,
  };
}

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Campagne à modifier ; `null` = création. */
  campagne: Partial<CampagneInput> | null;
  /** Le type ne change plus une fois des entretiens générés. */
  typeVerrouille?: boolean;
  onSubmit: (values: CampagneInput) => Promise<ActionResult<{ id: string }>>;
};

/** Modale de création / modification d'une campagne d'entretiens (RHF + Zod). */
export function CampagneDialog({ open, onOpenChange, campagne, typeVerrouille, onSubmit }: Props) {
  const [erreur, setErreur] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const enEdition = Boolean(campagne?.id);

  const form = useForm<CampagneInput>({
    resolver: typedZodResolver(campagneSchema),
    defaultValues: valeursCampagneParDefaut(campagne),
  });

  useEffect(() => {
    if (open) {
      form.reset(valeursCampagneParDefaut(campagne));
      setErreur(null);
    }
  }, [open, campagne, form]);

  async function handleSubmit(values: CampagneInput) {
    setErreur(null);
    setIsSubmitting(true);
    const result = await onSubmit(values);
    setIsSubmitting(false);
    if (!result.ok) {
      setErreur(result.error);
      if (result.fieldErrors) {
        for (const [field, msgs] of Object.entries(result.fieldErrors)) {
          if (msgs?.[0]) form.setError(field as never, { type: 'server', message: msgs[0] });
        }
      }
      return;
    }
    toast.success(enEdition ? 'Campagne mise à jour' : 'Campagne créée');
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>{enEdition ? 'Modifier la campagne' : 'Nouvelle campagne'}</DialogTitle>
          <DialogDescription>
            Une campagne regroupe les entretiens d’une période (annuels, professionnels…). Lancez-la
            ensuite pour générer un entretien par collaborateur.
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

            <FormField
              control={form.control}
              name="libelle"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Libellé</FormLabel>
                  <FormControl>
                    <Input maxLength={160} placeholder="Entretiens annuels 2026" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="typeEntretien"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Type d’entretien</FormLabel>
                  <OptionSelect
                    options={OPTIONS_TYPE}
                    value={field.value}
                    onChange={(v) => field.onChange(v ?? 'annuel')}
                    autoriserAucune={false}
                    disabled={typeVerrouille ?? false}
                    aria-label="Type d’entretien"
                  />
                  {typeVerrouille && (
                    <p className="text-xs text-muted-foreground">
                      Des entretiens ont déjà été générés : le type n’est plus modifiable.
                    </p>
                  )}
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <FormField
                control={form.control}
                name="dateDebut"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Date de début</FormLabel>
                    <FormControl>
                      <Input type="date" {...field} value={field.value ?? ''} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="dateLimite"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Date limite</FormLabel>
                    <FormControl>
                      <Input type="date" {...field} value={field.value ?? ''} />
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
                    <Textarea rows={3} maxLength={2000} {...field} value={field.value ?? ''} />
                  </FormControl>
                  <FormMessage />
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
                {isSubmitting ? 'Enregistrement…' : enEdition ? 'Enregistrer' : 'Créer la campagne'}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
