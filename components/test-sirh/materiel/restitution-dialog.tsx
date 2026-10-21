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
import { formatDateFr } from '@/lib/test-sirh/format';
import { controleRestitution } from '@/lib/test-sirh/materiel/regles';
import {
  restitutionMaterielSchema,
  type RestitutionMaterielInput,
} from '@/lib/validation/test-sirh/materiel';

export type MaterielARestituer = {
  id: string;
  libelle: string;
  detenteurNom: string;
  dateRemise: string;
};

export function valeursRestitutionParDefaut(
  materielId: string,
  today: string,
): RestitutionMaterielInput {
  return {
    materielId,
    dateRetour: today,
    etatRetour: null,
    signalerReparation: false,
    commentaire: null,
  };
}

type Props = {
  /** Matériel attribué à restituer ; `null` = modale fermée. */
  materiel: MaterielARestituer | null;
  today: string;
  onClose: () => void;
  onSubmit: (values: RestitutionMaterielInput) => Promise<ActionResult>;
};

/**
 * Retour d'un matériel : date (≥ date de remise) et état au retour ; un défaut
 * signalé le passe « en réparation » au lieu de « en stock ».
 */
export function RestitutionMaterielDialog({ materiel, today, onClose, onSubmit }: Props) {
  const [erreur, setErreur] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const form = useForm<RestitutionMaterielInput>({
    resolver: typedZodResolver(restitutionMaterielSchema),
    defaultValues: valeursRestitutionParDefaut(materiel?.id ?? '', today),
  });

  useEffect(() => {
    if (materiel) {
      form.reset(valeursRestitutionParDefaut(materiel.id, today));
      setErreur(null);
    }
  }, [materiel, today, form]);

  async function handleSubmit(values: RestitutionMaterielInput) {
    if (!materiel) return;
    const erreurDates = controleRestitution(materiel.dateRemise, values.dateRetour);
    if (erreurDates) {
      form.setError('dateRetour', { type: 'validate', message: erreurDates });
      return;
    }
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
    toast.success(
      values.signalerReparation ? 'Matériel restitué (en réparation)' : 'Matériel restitué',
    );
    onClose();
  }

  return (
    <Dialog open={materiel !== null} onOpenChange={(o) => (!o ? onClose() : undefined)}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Restituer le matériel</DialogTitle>
          {materiel && (
            <DialogDescription>
              {materiel.libelle} · remis à {materiel.detenteurNom} le{' '}
              {formatDateFr(materiel.dateRemise)}
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
                name="dateRetour"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Date de retour</FormLabel>
                    <FormControl>
                      <Input type="date" min={materiel?.dateRemise} max={today} {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="etatRetour"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>État au retour</FormLabel>
                    <FormControl>
                      <Input
                        maxLength={200}
                        placeholder="Ex. Bon état, sangle usée…"
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
              name="signalerReparation"
              render={({ field }) => (
                <FormItem className="flex items-center gap-2">
                  <FormControl>
                    <Switch checked={field.value} onCheckedChange={field.onChange} />
                  </FormControl>
                  <FormLabel className="!mt-0">Défaut constaté : envoyer en réparation</FormLabel>
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
                {isSubmitting ? 'Enregistrement…' : 'Restituer'}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
