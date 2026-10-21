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
import { Form, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import type { ActionResult } from '@/lib/common/action-result';
import { typedZodResolver } from '@/lib/forms/zod-resolver';
import {
  lancementCampagneSchema,
  type LancementCampagneInput,
} from '@/lib/validation/test-sirh/entretiens';
import { LIBELLES_TYPE_ENTRETIEN, type TypeEntretien } from '@/lib/validation/test-sirh/enums';

export type CampagneALancer = {
  id: string;
  libelle: string;
  typeEntretien: TypeEntretien;
  /** Entretiens déjà générés (relance = complément idempotent). */
  dejaGeneres: number;
};

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  campagne: CampagneALancer | null;
  sites: readonly OptionListe[];
  equipes: readonly OptionListe[];
  onLancer: (
    input: LancementCampagneInput,
  ) => Promise<ActionResult<{ crees: number; existants: number }>>;
};

/** Pluriel simple : `1 entretien créé`, `3 entretiens créés`. */
function nombre(n: number, singulier: string, pluriel: string): string {
  return `${n} ${n > 1 ? pluriel : singulier}`;
}

/**
 * « Lancer la campagne » : génère un entretien par employé actif (filtrable par
 * site et/ou équipe), évaluateur = manager. Relançable sans doublon.
 */
export function LancerCampagneDialog({
  open,
  onOpenChange,
  campagne,
  sites,
  equipes,
  onLancer,
}: Props) {
  const [erreur, setErreur] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const form = useForm<LancementCampagneInput>({
    resolver: typedZodResolver(lancementCampagneSchema),
    defaultValues: { campagneId: campagne?.id ?? '', siteId: null, equipeId: null },
  });

  useEffect(() => {
    if (open) {
      form.reset({ campagneId: campagne?.id ?? '', siteId: null, equipeId: null });
      setErreur(null);
    }
  }, [open, campagne, form]);

  async function handleSubmit(values: LancementCampagneInput) {
    setErreur(null);
    setIsSubmitting(true);
    const result = await onLancer(values);
    setIsSubmitting(false);
    if (!result.ok) {
      setErreur(result.error);
      return;
    }
    const { crees, existants } = result.data;
    toast.success(
      crees > 0
        ? `${nombre(crees, 'entretien créé', 'entretiens créés')}${existants > 0 ? ` · ${nombre(existants, 'déjà existant', 'déjà existants')}` : ''}`
        : 'Aucun nouvel entretien : tous les collaborateurs ciblés en ont déjà un.',
    );
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>
            {campagne && campagne.dejaGeneres > 0 ? 'Compléter la campagne' : 'Lancer la campagne'}
          </DialogTitle>
          <DialogDescription>
            {campagne ? (
              <>
                {campagne.libelle} — {LIBELLES_TYPE_ENTRETIEN[campagne.typeEntretien]}. Un entretien
                « à planifier » est créé pour chaque collaborateur actif, avec son manager pour
                évaluateur. Les collaborateurs qui ont déjà un entretien dans la campagne sont
                ignorés.
              </>
            ) : null}
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
                name="siteId"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Site</FormLabel>
                    <OptionSelect
                      options={sites}
                      value={field.value}
                      onChange={field.onChange}
                      libelleAucune="Tous les sites"
                      aria-label="Site"
                    />
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="equipeId"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Équipe</FormLabel>
                    <OptionSelect
                      options={equipes}
                      value={field.value}
                      onChange={field.onChange}
                      libelleAucune="Toutes les équipes"
                      aria-label="Équipe"
                    />
                    <FormMessage />
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
              <Button type="submit" disabled={isSubmitting || !campagne}>
                {isSubmitting ? 'Génération…' : 'Générer les entretiens'}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
