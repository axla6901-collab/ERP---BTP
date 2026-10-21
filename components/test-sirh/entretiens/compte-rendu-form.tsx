'use client';

import { LockIcon } from 'lucide-react';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';

import { OptionSelect, type OptionListe } from '@/components/test-sirh/option-select';
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
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import type { ActionResult } from '@/lib/common/action-result';
import { typedZodResolver } from '@/lib/forms/zod-resolver';
import { statutsAccessiblesEntretien } from '@/lib/test-sirh/entretiens/statuts';
import { compteRenduSchema, type CompteRenduInput } from '@/lib/validation/test-sirh/entretiens';
import { LIBELLES_STATUT_ENTRETIEN, type StatutEntretien } from '@/lib/validation/test-sirh/enums';

/** Échelle de la note globale. */
export const OPTIONS_NOTE: readonly OptionListe[] = [
  { id: '1', label: '1 — Insuffisant' },
  { id: '2', label: '2 — À améliorer' },
  { id: '3', label: '3 — Conforme aux attentes' },
  { id: '4', label: '4 — Au-delà des attentes' },
  { id: '5', label: '5 — Remarquable' },
];

type ChampTexte =
  | 'synthese'
  | 'pointsForts'
  | 'axesAmelioration'
  | 'souhaitsFormation'
  | 'souhaitsEvolution'
  | 'commentaireSalarie';

const CHAMPS_TEXTE: ReadonlyArray<{ name: ChampTexte; label: string; pleineLargeur?: boolean }> = [
  { name: 'synthese', label: 'Synthèse de l’entretien', pleineLargeur: true },
  { name: 'pointsForts', label: 'Points forts' },
  { name: 'axesAmelioration', label: 'Axes d’amélioration' },
  { name: 'souhaitsFormation', label: 'Souhaits de formation' },
  { name: 'souhaitsEvolution', label: 'Souhaits d’évolution' },
  { name: 'commentaireSalarie', label: 'Commentaire du salarié', pleineLargeur: true },
];

type Props = {
  /** Valeurs actuelles (toutes les clés présentes). */
  valeurs: CompteRenduInput;
  /** Statut enregistré (détermine les transitions proposées). */
  statutActuel: StatutEntretien;
  /** RH ou évaluateur, et entretien ni signé ni annulé. */
  modifiable: boolean;
  /** Explication affichée en lecture seule. */
  motifLectureSeule?: string;
  onSubmit: (values: CompteRenduInput) => Promise<ActionResult<{ id: string }>>;
};

/** Compte rendu d'entretien (RHF + Zod) : statut, dates, note et rubriques. */
export function CompteRenduForm({
  valeurs,
  statutActuel,
  modifiable,
  motifLectureSeule,
  onSubmit,
}: Props) {
  const [erreur, setErreur] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const form = useForm<CompteRenduInput>({
    resolver: typedZodResolver(compteRenduSchema),
    defaultValues: valeurs,
  });

  const optionsStatut = statutsAccessiblesEntretien(statutActuel).map((s) => ({
    id: s,
    label: LIBELLES_STATUT_ENTRETIEN[s],
  }));

  async function handleSubmit(values: CompteRenduInput) {
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
    toast.success('Compte rendu enregistré');
    form.reset(values);
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(handleSubmit)} className="grid gap-4">
        {!modifiable && (
          <p className="flex items-center gap-2 rounded-md border border-dashed px-3 py-2 text-sm text-muted-foreground">
            <LockIcon className="size-4 shrink-0" aria-hidden="true" />
            {motifLectureSeule ?? 'Compte rendu en lecture seule.'}
          </p>
        )}
        {erreur && (
          <Alert variant="destructive">
            <AlertTitle>Erreur</AlertTitle>
            <AlertDescription>{erreur}</AlertDescription>
          </Alert>
        )}

        <fieldset disabled={!modifiable || isSubmitting} className="grid gap-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <FormField
              control={form.control}
              name="statut"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Statut</FormLabel>
                  <OptionSelect
                    options={optionsStatut}
                    value={field.value}
                    onChange={(v) => field.onChange(v ?? statutActuel)}
                    autoriserAucune={false}
                    disabled={!modifiable}
                    aria-label="Statut de l’entretien"
                  />
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="datePrevue"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Date prévue</FormLabel>
                  <FormControl>
                    <Input type="date" {...field} value={field.value ?? ''} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="dateRealisation"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Date de réalisation</FormLabel>
                  <FormControl>
                    <Input type="date" {...field} value={field.value ?? ''} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="noteGlobale"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Note globale</FormLabel>
                  <OptionSelect
                    options={OPTIONS_NOTE}
                    value={field.value === null ? null : String(field.value)}
                    onChange={(v) => field.onChange(v === null ? null : Number(v))}
                    libelleAucune="Non notée"
                    disabled={!modifiable}
                    aria-label="Note globale"
                  />
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {CHAMPS_TEXTE.map((c) => (
              <FormField
                key={c.name}
                control={form.control}
                name={c.name}
                render={({ field }) => (
                  <FormItem className={c.pleineLargeur ? 'sm:col-span-2' : undefined}>
                    <FormLabel>{c.label}</FormLabel>
                    <FormControl>
                      <Textarea
                        rows={c.pleineLargeur ? 4 : 3}
                        maxLength={5000}
                        {...field}
                        value={field.value ?? ''}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            ))}
          </div>
        </fieldset>

        {modifiable && (
          <div className="flex justify-end">
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? 'Enregistrement…' : 'Enregistrer le compte rendu'}
            </Button>
          </div>
        )}
      </form>
    </Form>
  );
}
