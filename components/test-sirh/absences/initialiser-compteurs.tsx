'use client';

import { WandSparklesIcon } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';

import { OptionSelect } from '@/components/test-sirh/option-select';
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
import type { ActionResult } from '@/lib/common/action-result';
import { typedZodResolver } from '@/lib/forms/zod-resolver';
import { droitsParDefaut } from '@/lib/test-sirh/absences/soldes';
import type { TypeAbsenceSolde } from '@/lib/test-sirh/absences/types';
import { periodeReference } from '@/lib/test-sirh/calendrier';
import {
  initialisationCompteursSchema,
  type InitialisationCompteursInput,
} from '@/lib/validation/test-sirh/absences';

/** Valeurs par défaut : CP si présent, période BTP contenant `today`, droits par défaut du type. */
export function valeursInitialisationParDefaut(
  types: readonly TypeAbsenceSolde[],
  today: string,
): InitialisationCompteursInput {
  const type = types.find((t) => t.code.toUpperCase() === 'CP') ?? types[0];
  const periode = periodeReference(today);
  return {
    typeAbsenceId: type?.id ?? '',
    periodeDebut: periode.debut,
    periodeFin: periode.fin,
    droitsAcquis: String(type ? droitsParDefaut(type) : 0),
  };
}

type Props = {
  types: readonly TypeAbsenceSolde[];
  today: string;
  onInitialiser: (
    input: InitialisationCompteursInput,
  ) => Promise<ActionResult<{ crees: number; ignores: number }>>;
};

/**
 * « Initialiser les compteurs » : crée en une fois le compteur d'un type avec
 * solde pour tous les collaborateurs actifs qui n'en ont pas sur la période.
 */
export function InitialiserCompteurs({ types, today, onInitialiser }: Props) {
  const [ouvert, setOuvert] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  const defauts = useMemo(() => valeursInitialisationParDefaut(types, today), [types, today]);

  const form = useForm<InitialisationCompteursInput>({
    resolver: typedZodResolver(initialisationCompteursSchema),
    defaultValues: defauts,
  });

  useEffect(() => {
    if (ouvert) {
      form.reset(defauts);
      setErreur(null);
    }
  }, [ouvert, defauts, form]);

  async function handleSubmit(values: InitialisationCompteursInput) {
    setErreur(null);
    const result = await onInitialiser(values);
    if (!result.ok) {
      setErreur(result.error);
      if (result.fieldErrors) {
        for (const [field, msgs] of Object.entries(result.fieldErrors)) {
          if (msgs?.[0]) form.setError(field as never, { type: 'server', message: msgs[0] });
        }
      }
      return;
    }
    const { crees, ignores } = result.data;
    toast.success(
      `${crees} compteur${crees > 1 ? 's' : ''} créé${crees > 1 ? 's' : ''}` +
        (ignores > 0
          ? ` · ${ignores} collaborateur${ignores > 1 ? 's' : ''} déjà pourvu${ignores > 1 ? 's' : ''}`
          : ''),
    );
    setOuvert(false);
  }

  const enCours = form.formState.isSubmitting;

  return (
    <>
      <Button
        size="sm"
        variant="outline"
        onClick={() => setOuvert(true)}
        disabled={types.length === 0}
        title={types.length === 0 ? 'Aucun type d’absence avec solde actif.' : undefined}
      >
        <WandSparklesIcon className="mr-1 size-4" />
        Initialiser les compteurs
      </Button>
      <Dialog open={ouvert} onOpenChange={setOuvert}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Initialiser les compteurs</DialogTitle>
            <DialogDescription>
              Crée le compteur du type choisi pour chaque collaborateur actif qui n’en a pas encore
              sur la période. Les compteurs existants ne sont pas modifiés.
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
                name="typeAbsenceId"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Type d’absence</FormLabel>
                    <OptionSelect
                      options={types}
                      value={field.value || null}
                      onChange={(v) => {
                        field.onChange(v ?? '');
                        const type = types.find((t) => t.id === v);
                        if (type) form.setValue('droitsAcquis', String(droitsParDefaut(type)));
                      }}
                      autoriserAucune={false}
                      aria-label="Type d’absence"
                    />
                    <FormMessage />
                  </FormItem>
                )}
              />
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <FormField
                  control={form.control}
                  name="periodeDebut"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Début de période</FormLabel>
                      <FormControl>
                        <Input type="date" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="periodeFin"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Fin de période</FormLabel>
                      <FormControl>
                        <Input type="date" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
              <FormField
                control={form.control}
                name="droitsAcquis"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Droits acquis par collaborateur</FormLabel>
                    <FormControl>
                      <Input inputMode="decimal" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <DialogFooter>
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => setOuvert(false)}
                  disabled={enCours}
                >
                  Annuler
                </Button>
                <Button type="submit" disabled={enCours}>
                  {enCours ? 'Initialisation…' : 'Initialiser'}
                </Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>
    </>
  );
}
