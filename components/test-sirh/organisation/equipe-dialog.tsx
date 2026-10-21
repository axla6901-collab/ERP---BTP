'use client';

import { useEffect, useMemo, useState } from 'react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';

import { OptionSelect, type OptionListe } from '@/components/test-sirh/option-select';
import { PastilleCouleur } from '@/components/test-sirh/statut-badges';
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
import { optionsEmployes } from '@/lib/test-sirh/collaborateurs/options';
import {
  COULEUR_EQUIPE_DEFAUT,
  equipeSchema,
  type EquipeInput,
} from '@/lib/validation/test-sirh/organisation';

const REGEX_COULEUR = /^#[0-9a-fA-F]{6}$/;

/** Valeurs initiales : TOUTES les clés sont présentes (convention des schémas SIRH). */
export function valeursEquipeParDefaut(equipe?: Partial<EquipeInput> | null): EquipeInput {
  return {
    id: equipe?.id,
    nom: equipe?.nom ?? '',
    description: equipe?.description ?? null,
    responsableId: equipe?.responsableId ?? null,
    siteId: equipe?.siteId ?? null,
    couleur: equipe?.couleur ?? COULEUR_EQUIPE_DEFAUT,
    actif: equipe?.actif ?? true,
  };
}

export type OptionEmployeEquipe = { id: string; label: string; actif: boolean };

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Équipe à modifier ; `null` = création. */
  equipe: Partial<EquipeInput> | null;
  employes: readonly OptionEmployeEquipe[];
  sites: readonly OptionListe[];
  onSubmit: (values: EquipeInput) => Promise<ActionResult<{ id: string }>>;
};

/** Modale de création / modification d'une équipe (RHF + Zod). */
export function EquipeDialog({ open, onOpenChange, equipe, employes, sites, onSubmit }: Props) {
  const [erreur, setErreur] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const enEdition = Boolean(equipe?.id);

  const form = useForm<EquipeInput>({
    resolver: typedZodResolver(equipeSchema),
    defaultValues: valeursEquipeParDefaut(equipe),
  });

  useEffect(() => {
    if (open) {
      form.reset(valeursEquipeParDefaut(equipe));
      setErreur(null);
    }
  }, [open, equipe, form]);

  const optionsResponsable = useMemo(
    () => optionsEmployes(employes, { valeurCourante: equipe?.responsableId ?? null }),
    [employes, equipe?.responsableId],
  );

  const nom = form.watch('nom');
  const couleur = form.watch('couleur');
  const couleurValide = REGEX_COULEUR.test(couleur ?? '');

  async function handleSubmit(values: EquipeInput) {
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
    toast.success(enEdition ? 'Équipe mise à jour' : 'Équipe créée');
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>{enEdition ? 'Modifier l’équipe' : 'Nouvelle équipe'}</DialogTitle>
          <DialogDescription>
            Groupe de collaborateurs (équipe de chantier, service…) avec son responsable.
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
              name="nom"
              render={({ field }) => (
                <FormItem>
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
              name="couleur"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Couleur</FormLabel>
                  <div className="flex flex-wrap items-center gap-2">
                    <input
                      type="color"
                      aria-label="Choisir la couleur"
                      value={couleurValide ? couleur : COULEUR_EQUIPE_DEFAUT}
                      onChange={(e) => field.onChange(e.target.value)}
                      className="h-8 w-10 shrink-0 cursor-pointer rounded border bg-transparent p-0.5"
                    />
                    <FormControl>
                      <Input
                        maxLength={7}
                        className="w-28 font-mono"
                        {...field}
                        value={field.value ?? ''}
                      />
                    </FormControl>
                    <span
                      className="inline-flex min-w-0 items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs"
                      data-testid="apercu-equipe"
                    >
                      <PastilleCouleur couleur={couleurValide ? couleur : COULEUR_EQUIPE_DEFAUT} />
                      <span className="truncate">{nom?.trim() || 'Aperçu'}</span>
                    </span>
                  </div>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <FormField
                control={form.control}
                name="responsableId"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Responsable</FormLabel>
                    <OptionSelect
                      options={optionsResponsable}
                      value={field.value}
                      onChange={field.onChange}
                      libelleAucune="— Aucun —"
                      aria-label="Responsable"
                    />
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="siteId"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Site</FormLabel>
                    <OptionSelect
                      options={sites}
                      value={field.value}
                      onChange={field.onChange}
                      libelleAucune="— Aucun —"
                      aria-label="Site"
                    />
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
                    <Textarea rows={2} maxLength={1000} {...field} value={field.value ?? ''} />
                  </FormControl>
                  <FormMessage />
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
                  <FormLabel className="!mt-0">Équipe active</FormLabel>
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
                {isSubmitting ? 'Enregistrement…' : enEdition ? 'Enregistrer' : 'Créer l’équipe'}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
