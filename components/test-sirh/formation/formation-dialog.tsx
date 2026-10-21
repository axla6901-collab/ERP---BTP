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
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import type { ActionResult } from '@/lib/common/action-result';
import { typedZodResolver } from '@/lib/forms/zod-resolver';
import {
  CATEGORIES_FORMATION,
  LIBELLES_CATEGORIE_FORMATION,
  LIBELLES_MODALITE_FORMATION,
  MODALITES_FORMATION,
} from '@/lib/validation/test-sirh/enums';
import { formationSchema, type FormationInput } from '@/lib/validation/test-sirh/formation';

const OPTIONS_CATEGORIE = optionsDepuisEnum(CATEGORIES_FORMATION, LIBELLES_CATEGORIE_FORMATION);
const OPTIONS_MODALITE = optionsDepuisEnum(MODALITES_FORMATION, LIBELLES_MODALITE_FORMATION);

/** Valeurs initiales : TOUTES les clés sont présentes (convention des schémas SIRH). */
export function valeursFormationParDefaut(f?: Partial<FormationInput> | null): FormationInput {
  return {
    id: f?.id,
    code: f?.code ?? null,
    intitule: f?.intitule ?? '',
    categorie: f?.categorie ?? 'technique',
    organisme: f?.organisme ?? null,
    modalite: f?.modalite ?? 'presentiel',
    dureeHeures: f?.dureeHeures ?? null,
    coutHt: f?.coutHt ?? null,
    obligatoire: f?.obligatoire ?? false,
    validiteMois: f?.validiteMois ?? null,
    description: f?.description ?? null,
    actif: f?.actif ?? true,
  };
}

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Formation à modifier ; `null` = création. */
  formation: Partial<FormationInput> | null;
  onSubmit: (values: FormationInput) => Promise<ActionResult<{ id: string }>>;
};

/** Création / modification d'une formation du catalogue (RHF + Zod). */
export function FormationDialog({ open, onOpenChange, formation, onSubmit }: Props) {
  const [erreur, setErreur] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const enEdition = Boolean(formation?.id);

  const form = useForm<FormationInput>({
    resolver: typedZodResolver(formationSchema),
    defaultValues: valeursFormationParDefaut(formation),
  });

  useEffect(() => {
    if (open) {
      form.reset(valeursFormationParDefaut(formation));
      setErreur(null);
    }
  }, [open, formation, form]);

  async function handleSubmit(values: FormationInput) {
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
    toast.success(enEdition ? 'Formation mise à jour' : 'Formation créée');
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{enEdition ? 'Modifier la formation' : 'Nouvelle formation'}</DialogTitle>
          <DialogDescription>
            Fiche catalogue : la validité (en mois) déclenche le suivi des recyclages (CACES, SST,
            habilitations…).
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
                name="intitule"
                render={({ field }) => (
                  <FormItem className="sm:col-span-2">
                    <FormLabel>Intitulé</FormLabel>
                    <FormControl>
                      <Input maxLength={200} {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="code"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Code</FormLabel>
                    <FormControl>
                      <Input maxLength={30} {...field} value={field.value ?? ''} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <FormField
                control={form.control}
                name="categorie"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Catégorie</FormLabel>
                    <OptionSelect
                      options={OPTIONS_CATEGORIE}
                      value={field.value}
                      onChange={(v) => field.onChange(v ?? 'technique')}
                      autoriserAucune={false}
                      aria-label="Catégorie"
                    />
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="modalite"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Modalité</FormLabel>
                    <OptionSelect
                      options={OPTIONS_MODALITE}
                      value={field.value}
                      onChange={(v) => field.onChange(v ?? 'presentiel')}
                      autoriserAucune={false}
                      aria-label="Modalité"
                    />
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="organisme"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Organisme</FormLabel>
                    <FormControl>
                      <Input maxLength={200} {...field} value={field.value ?? ''} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <FormField
                control={form.control}
                name="dureeHeures"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Durée (h)</FormLabel>
                    <FormControl>
                      <Input inputMode="decimal" {...field} value={field.value ?? ''} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="coutHt"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Coût HT / participant (€)</FormLabel>
                    <FormControl>
                      <Input inputMode="decimal" {...field} value={field.value ?? ''} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="validiteMois"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Validité (mois)</FormLabel>
                    <FormControl>
                      <Input
                        inputMode="numeric"
                        placeholder="Sans échéance"
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

            <div className="flex flex-wrap items-center gap-6">
              <FormField
                control={form.control}
                name="obligatoire"
                render={({ field }) => (
                  <FormItem className="flex items-center gap-2">
                    <FormControl>
                      <Switch checked={field.value} onCheckedChange={field.onChange} />
                    </FormControl>
                    <FormLabel className="!mt-0">Formation obligatoire</FormLabel>
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="actif"
                render={({ field }) => (
                  <FormItem className="flex items-center gap-2">
                    <FormControl>
                      <Switch checked={field.value} onCheckedChange={field.onChange} />
                    </FormControl>
                    <FormLabel className="!mt-0">Formation active</FormLabel>
                  </FormItem>
                )}
              />
            </div>

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
                    : 'Créer la formation'}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
