'use client';

import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';

import {
  OptionSelect,
  optionsDepuisEnum,
  type OptionListe,
} from '@/components/test-sirh/option-select';
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
  LIBELLES_SOURCE_VARIABLE,
  LIBELLES_TYPE_VARIABLE_PAIE,
  TYPES_VARIABLE_PAIE,
  type SourceVariable,
} from '@/lib/validation/test-sirh/enums';
import { variablePaieSchema, type VariablePaieInput } from '@/lib/validation/test-sirh/paie';

const OPTIONS_TYPE = optionsDepuisEnum(TYPES_VARIABLE_PAIE, LIBELLES_TYPE_VARIABLE_PAIE);

/** Variable éditée : valeurs du formulaire + origine (une variable importée est partiellement figée). */
export type VariableEditee = Partial<VariablePaieInput> & { source?: SourceVariable };

/** Valeurs initiales : TOUTES les clés sont présentes (convention des schémas SIRH). */
export function valeursVariableParDefaut(
  periodeId: string,
  v?: Partial<VariablePaieInput> | null,
): VariablePaieInput {
  return {
    id: v?.id,
    periodeId,
    employeId: v?.employeId ?? '',
    typeVariable: v?.typeVariable ?? 'prime',
    libelle: v?.libelle ?? LIBELLES_TYPE_VARIABLE_PAIE[v?.typeVariable ?? 'prime'],
    codeRubrique: v?.codeRubrique ?? null,
    quantite: v?.quantite ?? null,
    montant: v?.montant ?? null,
    commentaire: v?.commentaire ?? null,
  };
}

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  periodeId: string;
  /** Variable à modifier ; `null` = nouvelle variable manuelle. */
  variable: VariableEditee | null;
  employes: readonly OptionListe[];
  onSubmit: (values: VariablePaieInput) => Promise<ActionResult<{ id: string }>>;
};

/** Saisie / modification d'une variable de paie (Factorial payroll/Supplement). */
export function VariablePaieDialog({
  open,
  onOpenChange,
  periodeId,
  variable,
  employes,
  onSubmit,
}: Props) {
  const [erreur, setErreur] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const enEdition = Boolean(variable?.id);
  const importee = Boolean(variable?.source && variable.source !== 'manuelle');

  const form = useForm<VariablePaieInput>({
    resolver: typedZodResolver(variablePaieSchema),
    defaultValues: valeursVariableParDefaut(periodeId, variable),
  });

  useEffect(() => {
    if (open) {
      form.reset(valeursVariableParDefaut(periodeId, variable));
      setErreur(null);
    }
  }, [open, periodeId, variable, form]);

  async function handleSubmit(values: VariablePaieInput) {
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
    toast.success(enEdition ? 'Variable mise à jour' : 'Variable ajoutée');
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>
            {enEdition ? 'Modifier la variable' : 'Nouvelle variable de paie'}
          </DialogTitle>
          <DialogDescription>
            {importee && variable?.source
              ? `${LIBELLES_SOURCE_VARIABLE[variable.source]} : collaborateur et type sont figés.`
              : 'Prime, indemnité, acompte, retenue… avec son code rubrique pour l’export.'}
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
                      disabled={importee}
                      aria-label="Collaborateur"
                    />
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="typeVariable"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Type</FormLabel>
                    <OptionSelect
                      options={OPTIONS_TYPE}
                      value={field.value}
                      onChange={(v) => {
                        const type = (v ?? 'prime') as VariablePaieInput['typeVariable'];
                        // Libellé par défaut tant qu'il n'a pas été personnalisé.
                        const libelle = form.getValues('libelle');
                        if (!libelle || libelle === LIBELLES_TYPE_VARIABLE_PAIE[field.value]) {
                          form.setValue('libelle', LIBELLES_TYPE_VARIABLE_PAIE[type]);
                        }
                        field.onChange(type);
                      }}
                      autoriserAucune={false}
                      disabled={importee}
                      aria-label="Type de variable"
                    />
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <FormField
                control={form.control}
                name="libelle"
                render={({ field }) => (
                  <FormItem className="sm:col-span-2">
                    <FormLabel>Libellé</FormLabel>
                    <FormControl>
                      <Input maxLength={200} {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="codeRubrique"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Code rubrique</FormLabel>
                    <FormControl>
                      <Input maxLength={30} {...field} value={field.value ?? ''} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <FormField
                control={form.control}
                name="quantite"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Quantité</FormLabel>
                    <FormControl>
                      <Input
                        inputMode="decimal"
                        placeholder="jours, heures, unités"
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
                name="montant"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Montant (€)</FormLabel>
                    <FormControl>
                      <Input inputMode="decimal" {...field} value={field.value ?? ''} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <FormField
              control={form.control}
              name="commentaire"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Commentaire</FormLabel>
                  <FormControl>
                    <Textarea rows={2} maxLength={500} {...field} value={field.value ?? ''} />
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
                {isSubmitting
                  ? 'Enregistrement…'
                  : enEdition
                    ? 'Enregistrer'
                    : 'Ajouter la variable'}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
