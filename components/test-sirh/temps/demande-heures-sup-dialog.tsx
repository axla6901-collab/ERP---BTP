'use client';

import { PlusIcon } from 'lucide-react';
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
import { libelleMajoration } from '@/lib/test-sirh/temps/heures-sup';
import {
  COMPENSATIONS_HS,
  LIBELLES_COMPENSATION_HS,
  MAJORATIONS_HS,
} from '@/lib/validation/test-sirh/enums';
import { heuresSupSchema, type HeuresSupInput } from '@/lib/validation/test-sirh/temps';

const OPTIONS_MAJORATION: OptionListe[] = MAJORATIONS_HS.map((m) => ({
  id: String(m),
  label: libelleMajoration(m),
}));
const OPTIONS_COMPENSATION = optionsDepuisEnum(COMPENSATIONS_HS, LIBELLES_COMPENSATION_HS);

/** Valeurs initiales : TOUTES les clés sont présentes (convention des schémas SIRH). */
export function valeursHeuresSupParDefaut(employeId: string, today: string): HeuresSupInput {
  return {
    employeId,
    dateHeures: today,
    dureeHeures: '',
    majorationPct: 25,
    compensation: 'paiement',
    chantierId: null,
    motif: null,
  };
}

export type DemandeHeuresSupDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Collaborateur imposé (libre-service « Mon espace ») : le sélecteur est masqué. */
  employeFixe?: OptionListe | null;
  /** Collaborateurs sélectionnables (valideurs / RH) si `employeFixe` est absent. */
  employes?: readonly OptionListe[];
  chantiers?: readonly OptionListe[];
  /** Date du jour (ISO, calculée côté serveur) : valeur par défaut. */
  today: string;
  onSubmit: (input: HeuresSupInput) => Promise<ActionResult<{ id: string }>>;
};

/** Demande d'heures supplémentaires (Factorial attendance/OvertimeRequest). */
export function DemandeHeuresSupDialog({
  open,
  onOpenChange,
  employeFixe = null,
  employes = [],
  chantiers = [],
  today,
  onSubmit,
}: DemandeHeuresSupDialogProps) {
  const [erreur, setErreur] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const employeInitial = employeFixe?.id ?? '';

  const form = useForm<HeuresSupInput>({
    resolver: typedZodResolver(heuresSupSchema),
    defaultValues: valeursHeuresSupParDefaut(employeInitial, today),
  });

  useEffect(() => {
    if (open) {
      form.reset(valeursHeuresSupParDefaut(employeInitial, today));
      setErreur(null);
    }
  }, [open, employeInitial, today, form]);

  async function handleSubmit(values: HeuresSupInput) {
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
    toast.success('Demande d’heures supplémentaires envoyée');
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Demande d’heures supplémentaires</DialogTitle>
          <DialogDescription>
            La demande est transmise pour validation. Les heures payées approuvées sont reprises
            dans la préparation de paie du mois.
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

            {employeFixe ? (
              <p className="text-sm">
                <span className="text-muted-foreground">Collaborateur : </span>
                <span className="font-medium">{employeFixe.label}</span>
              </p>
            ) : (
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
            )}

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <FormField
                control={form.control}
                name="dateHeures"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Date</FormLabel>
                    <FormControl>
                      <Input type="date" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="dureeHeures"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Durée (heures)</FormLabel>
                    <FormControl>
                      <Input inputMode="decimal" placeholder="ex. 2,5" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <FormField
                control={form.control}
                name="majorationPct"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Majoration</FormLabel>
                    <OptionSelect
                      options={OPTIONS_MAJORATION}
                      value={String(field.value)}
                      onChange={(v) => field.onChange(Number(v ?? 25))}
                      autoriserAucune={false}
                      aria-label="Majoration"
                    />
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="compensation"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Compensation</FormLabel>
                    <OptionSelect
                      options={OPTIONS_COMPENSATION}
                      value={field.value}
                      onChange={(v) => field.onChange(v ?? 'paiement')}
                      autoriserAucune={false}
                      aria-label="Compensation"
                    />
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            {chantiers.length > 0 && (
              <FormField
                control={form.control}
                name="chantierId"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Chantier</FormLabel>
                    <OptionSelect
                      options={chantiers}
                      value={field.value}
                      onChange={field.onChange}
                      aria-label="Chantier"
                    />
                    <FormMessage />
                  </FormItem>
                )}
              />
            )}

            <FormField
              control={form.control}
              name="motif"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Motif</FormLabel>
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
                {isSubmitting ? 'Envoi…' : 'Envoyer la demande'}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}

/** Bouton « Déclarer des heures sup. » ouvrant `DemandeHeuresSupDialog` (Mon espace, listes). */
export function BoutonDemandeHeuresSup({
  libelle = 'Déclarer des heures sup.',
  ...props
}: Omit<DemandeHeuresSupDialogProps, 'open' | 'onOpenChange'> & { libelle?: string }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button type="button" size="sm" onClick={() => setOpen(true)}>
        <PlusIcon className="mr-1 size-4" /> {libelle}
      </Button>
      <DemandeHeuresSupDialog {...props} open={open} onOpenChange={setOpen} />
    </>
  );
}
