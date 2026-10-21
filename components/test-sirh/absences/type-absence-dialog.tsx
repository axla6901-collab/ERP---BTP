'use client';

import { useEffect, useMemo, useState } from 'react';
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
import type { ActionResult } from '@/lib/common/action-result';
import { typedZodResolver } from '@/lib/forms/zod-resolver';
import type { TypeAbsenceLigne } from '@/lib/test-sirh/absences/types';
import { typeAbsenceSchema, type TypeAbsenceInput } from '@/lib/validation/test-sirh/absences';
import {
  CATEGORIES_ABSENCE,
  LIBELLES_CATEGORIE_ABSENCE,
  LIBELLES_UNITE_DECOMPTE,
  UNITES_DECOMPTE,
} from '@/lib/validation/test-sirh/enums';

const OPTIONS_CATEGORIE = optionsDepuisEnum(CATEGORIES_ABSENCE, LIBELLES_CATEGORIE_ABSENCE);
const OPTIONS_UNITE = optionsDepuisEnum(UNITES_DECOMPTE, LIBELLES_UNITE_DECOMPTE);

/** Valeurs initiales : TOUTES les clés sont présentes (convention des schémas SIRH). */
export function valeursTypeAbsenceParDefaut(type?: TypeAbsenceLigne | null): TypeAbsenceInput {
  return {
    id: type?.id,
    code: type?.code ?? '',
    libelle: type?.libelle ?? '',
    categorie: type?.categorie ?? 'conges',
    uniteDecompte: type?.uniteDecompte ?? 'jours_ouvres',
    avecSolde: type?.avecSolde ?? false,
    necessiteValidation: type?.necessiteValidation ?? true,
    justificatifRequis: type?.justificatifRequis ?? false,
    remuneree: type?.remuneree ?? true,
    couleur: type?.couleur ?? '#f59e0b',
    codeRubriquePaie: type?.codeRubriquePaie ?? null,
    actif: type?.actif ?? true,
    ordre: type?.ordre ?? 0,
  };
}

const INTERRUPTEURS: ReadonlyArray<{
  nom: 'avecSolde' | 'necessiteValidation' | 'justificatifRequis' | 'remuneree' | 'actif';
  libelle: string;
  aide: string;
}> = [
  { nom: 'avecSolde', libelle: 'Avec solde', aide: 'Décompté d’un compteur de droits (CP, RTT…)' },
  {
    nom: 'necessiteValidation',
    libelle: 'Soumis à validation',
    aide: 'Sinon : enregistré directement comme approuvé',
  },
  { nom: 'justificatifRequis', libelle: 'Justificatif obligatoire', aide: 'Arrêt, acte…' },
  { nom: 'remuneree', libelle: 'Rémunérée', aide: 'Maintien de salaire' },
  { nom: 'actif', libelle: 'Actif', aide: 'Proposé dans les demandes' },
];

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Type à modifier ; `null` = création. */
  type: TypeAbsenceLigne | null;
  onSubmit: (values: TypeAbsenceInput) => Promise<ActionResult<{ id: string }>>;
};

/** Création / modification d'un type d'absence (Factorial LeaveType). */
export function TypeAbsenceDialog({ open, onOpenChange, type, onSubmit }: Props) {
  const [erreur, setErreur] = useState<string | null>(null);
  const enEdition = type !== null;
  const defauts = useMemo(() => valeursTypeAbsenceParDefaut(type), [type]);

  const form = useForm<TypeAbsenceInput>({
    resolver: typedZodResolver(typeAbsenceSchema),
    defaultValues: defauts,
  });

  useEffect(() => {
    if (open) {
      form.reset(defauts);
      setErreur(null);
    }
  }, [open, defauts, form]);

  async function handleSubmit(values: TypeAbsenceInput) {
    setErreur(null);
    const result = await onSubmit(values);
    if (!result.ok) {
      setErreur(result.error);
      if (result.fieldErrors) {
        for (const [field, msgs] of Object.entries(result.fieldErrors)) {
          if (msgs?.[0]) form.setError(field as never, { type: 'server', message: msgs[0] });
        }
      }
      return;
    }
    toast.success(enEdition ? 'Type d’absence mis à jour' : 'Type d’absence créé');
    onOpenChange(false);
  }

  const enCours = form.formState.isSubmitting;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>
            {enEdition ? 'Modifier le type d’absence' : 'Nouveau type d’absence'}
          </DialogTitle>
          <DialogDescription>
            Règles de décompte et de validation appliquées aux demandes de ce type.
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
                name="libelle"
                render={({ field }) => (
                  <FormItem className="sm:col-span-2">
                    <FormLabel>Libellé</FormLabel>
                    <FormControl>
                      <Input maxLength={120} {...field} />
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
                      <Input maxLength={12} className="uppercase" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <FormField
                control={form.control}
                name="categorie"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Catégorie</FormLabel>
                    <OptionSelect
                      options={OPTIONS_CATEGORIE}
                      value={field.value}
                      onChange={(v) => field.onChange(v ?? 'conges')}
                      autoriserAucune={false}
                      aria-label="Catégorie"
                    />
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="uniteDecompte"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Unité de décompte</FormLabel>
                    <OptionSelect
                      options={OPTIONS_UNITE}
                      value={field.value}
                      onChange={(v) => field.onChange(v ?? 'jours_ouvres')}
                      autoriserAucune={false}
                      aria-label="Unité de décompte"
                    />
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <FormField
                control={form.control}
                name="couleur"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Couleur</FormLabel>
                    <div className="flex items-center gap-2">
                      <input
                        type="color"
                        aria-label="Choisir la couleur"
                        className="h-8 w-10 shrink-0 cursor-pointer rounded border bg-transparent p-0.5"
                        value={field.value}
                        onChange={(e) => field.onChange(e.target.value)}
                      />
                      <FormControl>
                        <Input maxLength={7} {...field} />
                      </FormControl>
                    </div>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="codeRubriquePaie"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Rubrique de paie</FormLabel>
                    <FormControl>
                      <Input maxLength={30} {...field} value={field.value ?? ''} />
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
                    <FormLabel>Ordre d’affichage</FormLabel>
                    <FormControl>
                      <Input type="number" min={0} max={9999} step={1} {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {INTERRUPTEURS.map((i) => (
                <FormField
                  key={i.nom}
                  control={form.control}
                  name={i.nom}
                  render={({ field }) => (
                    <FormItem className="flex items-start gap-2">
                      <FormControl>
                        <Switch checked={field.value} onCheckedChange={field.onChange} />
                      </FormControl>
                      <div className="grid gap-0.5">
                        <FormLabel className="!mt-0">{i.libelle}</FormLabel>
                        <span className="text-xs text-muted-foreground">{i.aide}</span>
                      </div>
                    </FormItem>
                  )}
                />
              ))}
            </div>

            <DialogFooter>
              <Button
                type="button"
                variant="ghost"
                onClick={() => onOpenChange(false)}
                disabled={enCours}
              >
                Annuler
              </Button>
              <Button type="submit" disabled={enCours}>
                {enCours ? 'Enregistrement…' : enEdition ? 'Enregistrer' : 'Créer le type'}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
