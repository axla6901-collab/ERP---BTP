'use client';

import { PencilIcon } from 'lucide-react';
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
  LIBELLES_STATUT_OFFRE,
  LIBELLES_TYPE_CONTRAT,
  STATUTS_OFFRE,
  TYPES_CONTRAT,
} from '@/lib/validation/test-sirh/enums';
import { offreSchema, type OffreInput } from '@/lib/validation/test-sirh/recrutement';

const OPTIONS_TYPE_CONTRAT = optionsDepuisEnum(TYPES_CONTRAT, LIBELLES_TYPE_CONTRAT);
const OPTIONS_STATUT_OFFRE = optionsDepuisEnum(STATUTS_OFFRE, LIBELLES_STATUT_OFFRE);

/** Listes des sélecteurs de l'offre (préparées par la page serveur). */
export type OptionsOffre = {
  postes: OptionListe[];
  sites: OptionListe[];
  /** Employés (responsable du recrutement) ; les inactifs ne sont proposés que s'ils sont déjà choisis. */
  responsables: Array<OptionListe & { actif: boolean }>;
};

/** Valeurs initiales : TOUTES les clés sont présentes (convention des schémas SIRH). */
export function valeursOffreParDefaut(offre?: Partial<OffreInput> | null): OffreInput {
  return {
    id: offre?.id,
    reference: offre?.reference ?? null,
    titre: offre?.titre ?? '',
    posteId: offre?.posteId ?? null,
    siteId: offre?.siteId ?? null,
    typeContrat: offre?.typeContrat ?? 'cdi',
    description: offre?.description ?? null,
    profilRecherche: offre?.profilRecherche ?? null,
    nbPostes: offre?.nbPostes ?? 1,
    salaireMin: offre?.salaireMin ?? null,
    salaireMax: offre?.salaireMax ?? null,
    statut: offre?.statut ?? 'brouillon',
    datePublication: offre?.datePublication ?? null,
    dateCloture: offre?.dateCloture ?? null,
    responsableId: offre?.responsableId ?? null,
  };
}

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Offre à modifier ; `null` = création. */
  offre: Partial<OffreInput> | null;
  options: OptionsOffre;
  onSubmit: (values: OffreInput) => Promise<ActionResult<{ id: string }>>;
};

/** Modale de création / modification d'une offre d'emploi (RHF + Zod). */
export function OffreDialog({ open, onOpenChange, offre, options, onSubmit }: Props) {
  const [erreur, setErreur] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const enEdition = Boolean(offre?.id);

  const form = useForm<OffreInput>({
    resolver: typedZodResolver(offreSchema),
    defaultValues: valeursOffreParDefaut(offre),
  });

  useEffect(() => {
    if (open) {
      form.reset(valeursOffreParDefaut(offre));
      setErreur(null);
    }
  }, [open, offre, form]);

  async function handleSubmit(values: OffreInput) {
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
    toast.success(enEdition ? 'Offre mise à jour' : 'Offre créée');
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{enEdition ? 'Modifier l’offre' : 'Nouvelle offre d’emploi'}</DialogTitle>
          <DialogDescription>
            Poste à pourvoir, contrat, fourchette de salaire et responsable du recrutement.
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
                name="titre"
                render={({ field }) => (
                  <FormItem className="sm:col-span-2">
                    <FormLabel>Intitulé de l’offre</FormLabel>
                    <FormControl>
                      <Input maxLength={160} {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="reference"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Référence</FormLabel>
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
                name="posteId"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Poste (catalogue)</FormLabel>
                    <OptionSelect
                      options={options.postes}
                      value={field.value}
                      onChange={field.onChange}
                      aria-label="Poste"
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
                      options={options.sites}
                      value={field.value}
                      onChange={field.onChange}
                      aria-label="Site"
                    />
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <FormField
                control={form.control}
                name="typeContrat"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Type de contrat</FormLabel>
                    <OptionSelect
                      options={OPTIONS_TYPE_CONTRAT}
                      value={field.value}
                      onChange={(v) => field.onChange(v ?? 'cdi')}
                      autoriserAucune={false}
                      aria-label="Type de contrat"
                    />
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="nbPostes"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Nombre de postes</FormLabel>
                    <FormControl>
                      <Input inputMode="numeric" {...field} value={field.value ?? ''} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="statut"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Statut</FormLabel>
                    <OptionSelect
                      options={OPTIONS_STATUT_OFFRE}
                      value={field.value}
                      onChange={(v) => field.onChange(v ?? 'brouillon')}
                      autoriserAucune={false}
                      aria-label="Statut de l’offre"
                    />
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <FormField
                control={form.control}
                name="salaireMin"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Salaire brut mensuel min. (€)</FormLabel>
                    <FormControl>
                      <Input inputMode="decimal" {...field} value={field.value ?? ''} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="salaireMax"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Salaire brut mensuel max. (€)</FormLabel>
                    <FormControl>
                      <Input inputMode="decimal" {...field} value={field.value ?? ''} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <FormField
                control={form.control}
                name="datePublication"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Publication</FormLabel>
                    <FormControl>
                      <Input type="date" {...field} value={field.value ?? ''} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="dateCloture"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Clôture</FormLabel>
                    <FormControl>
                      <Input type="date" {...field} value={field.value ?? ''} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="responsableId"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Responsable</FormLabel>
                    <OptionSelect
                      options={options.responsables.filter((o) => o.actif || o.id === field.value)}
                      value={field.value}
                      onChange={field.onChange}
                      aria-label="Responsable du recrutement"
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
                  <FormLabel>Description du poste</FormLabel>
                  <FormControl>
                    <Textarea rows={3} maxLength={5000} {...field} value={field.value ?? ''} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="profilRecherche"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Profil recherché</FormLabel>
                  <FormControl>
                    <Textarea rows={3} maxLength={5000} {...field} value={field.value ?? ''} />
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
                {isSubmitting ? 'Enregistrement…' : enEdition ? 'Enregistrer' : 'Créer l’offre'}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}

/** Bouton « Modifier l'offre » + sa modale (bandeau de la page pipeline). */
export function BoutonModifierOffre(props: Omit<Props, 'open' | 'onOpenChange'>) {
  const [ouvert, setOuvert] = useState(false);
  return (
    <>
      <Button size="sm" variant="outline" onClick={() => setOuvert(true)}>
        <PencilIcon className="mr-1 size-3.5" /> Modifier l’offre
      </Button>
      <OffreDialog {...props} open={ouvert} onOpenChange={setOuvert} />
    </>
  );
}
