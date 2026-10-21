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
import { Textarea } from '@/components/ui/textarea';
import type { ActionResult } from '@/lib/common/action-result';
import { typedZodResolver } from '@/lib/forms/zod-resolver';
import {
  affectationSchema,
  type AffectationInput,
} from '@/lib/validation/test-sirh/collaborateurs';

/** Affectation courante (champs éditables). */
export type AffectationEditable = {
  posteId: string | null;
  siteId: string | null;
  managerId: string | null;
  horaireId: string | null;
  societeId: string | null;
  emailProfessionnel: string | null;
  telephoneProfessionnel: string | null;
  dateAnciennete: string | null;
  notes: string | null;
};

export type OptionsAffectation = {
  postes: readonly OptionListe[];
  sites: readonly OptionListe[];
  /** Managers possibles (le collaborateur lui-même est déjà exclu). */
  managers: readonly OptionListe[];
  horaires: readonly OptionListe[];
  societes: readonly OptionListe[];
};

/** Valeurs initiales : TOUTES les clés sont présentes (convention des schémas SIRH). */
export function valeursAffectation(
  employeId: string,
  affectation: AffectationEditable | null,
): AffectationInput {
  return {
    employeId,
    posteId: affectation?.posteId ?? null,
    siteId: affectation?.siteId ?? null,
    managerId: affectation?.managerId ?? null,
    horaireId: affectation?.horaireId ?? null,
    societeId: affectation?.societeId ?? null,
    emailProfessionnel: affectation?.emailProfessionnel ?? null,
    telephoneProfessionnel: affectation?.telephoneProfessionnel ?? null,
    dateAnciennete: affectation?.dateAnciennete ?? null,
    notes: affectation?.notes ?? null,
  };
}

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  employeId: string;
  affectation: AffectationEditable | null;
  options: OptionsAffectation;
  onSubmit: (values: AffectationInput) => Promise<ActionResult<{ id: string }>>;
};

/** Modale d'édition de l'affectation SIRH (poste, site, manager, horaire, société…). */
export function AffectationDialog({
  open,
  onOpenChange,
  employeId,
  affectation,
  options,
  onSubmit,
}: Props) {
  const [erreur, setErreur] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const form = useForm<AffectationInput>({
    resolver: typedZodResolver(affectationSchema),
    defaultValues: valeursAffectation(employeId, affectation),
  });

  useEffect(() => {
    if (open) {
      form.reset(valeursAffectation(employeId, affectation));
      setErreur(null);
    }
  }, [open, employeId, affectation, form]);

  async function handleSubmit(values: AffectationInput) {
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
    toast.success('Affectation enregistrée');
    onOpenChange(false);
  }

  const selecteurs: Array<{
    name: 'posteId' | 'siteId' | 'managerId' | 'horaireId' | 'societeId';
    label: string;
    options: readonly OptionListe[];
  }> = [
    { name: 'posteId', label: 'Poste', options: options.postes },
    { name: 'siteId', label: 'Site de rattachement', options: options.sites },
    { name: 'managerId', label: 'Manager', options: options.managers },
    { name: 'horaireId', label: 'Horaire de travail', options: options.horaires },
    { name: 'societeId', label: 'Société employeuse', options: options.societes },
  ];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Affectation</DialogTitle>
          <DialogDescription>
            Rattachement SIRH du collaborateur. L’identité, l’adresse et les données personnelles
            restent sur la fiche RH.
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

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              {selecteurs.map((s) => (
                <FormField
                  key={s.name}
                  control={form.control}
                  name={s.name}
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{s.label}</FormLabel>
                      <OptionSelect
                        options={s.options}
                        value={field.value}
                        onChange={field.onChange}
                        libelleAucune="— Aucun —"
                        aria-label={s.label}
                      />
                      <FormMessage />
                    </FormItem>
                  )}
                />
              ))}
              <FormField
                control={form.control}
                name="dateAnciennete"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Date d’ancienneté</FormLabel>
                    <FormControl>
                      <Input type="date" {...field} value={field.value ?? ''} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <FormField
                control={form.control}
                name="emailProfessionnel"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Email professionnel</FormLabel>
                    <FormControl>
                      <Input type="email" maxLength={200} {...field} value={field.value ?? ''} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="telephoneProfessionnel"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Téléphone professionnel</FormLabel>
                    <FormControl>
                      <Input type="tel" maxLength={30} {...field} value={field.value ?? ''} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <FormField
              control={form.control}
              name="notes"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Notes</FormLabel>
                  <FormControl>
                    <Textarea rows={2} maxLength={2000} {...field} value={field.value ?? ''} />
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
                {isSubmitting ? 'Enregistrement…' : 'Enregistrer'}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
