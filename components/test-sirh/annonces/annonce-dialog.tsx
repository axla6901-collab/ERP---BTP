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
  FormDescription,
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
import { annonceSchema, type AnnonceInput } from '@/lib/validation/test-sirh/annonces';
import { CATEGORIES_ANNONCE, LIBELLES_CATEGORIE_ANNONCE } from '@/lib/validation/test-sirh/enums';

const OPTIONS_CATEGORIE = optionsDepuisEnum(CATEGORIES_ANNONCE, LIBELLES_CATEGORIE_ANNONCE);

/** Valeurs initiales : TOUTES les clés sont présentes ; publication aujourd'hui par défaut. */
export function valeursAnnonceParDefaut(
  annonce: Partial<AnnonceInput> | null | undefined,
  today: string,
): AnnonceInput {
  return {
    id: annonce?.id,
    titre: annonce?.titre ?? '',
    contenu: annonce?.contenu ?? '',
    categorie: annonce?.categorie ?? 'information',
    epinglee: annonce?.epinglee ?? false,
    publiee: annonce?.publiee ?? true,
    datePublication: annonce?.datePublication ?? today,
    dateExpiration: annonce?.dateExpiration ?? null,
    siteId: annonce?.siteId ?? null,
    equipeId: annonce?.equipeId ?? null,
  };
}

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Annonce à modifier ; `null` = création. */
  annonce: Partial<AnnonceInput> | null;
  today: string;
  sites: readonly OptionListe[];
  equipes: readonly OptionListe[];
  onSubmit: (values: AnnonceInput) => Promise<ActionResult<{ id: string }>>;
};

/** Modale de rédaction d'une annonce interne (texte brut, audience, publication). */
export function AnnonceDialog({
  open,
  onOpenChange,
  annonce,
  today,
  sites,
  equipes,
  onSubmit,
}: Props) {
  const [erreur, setErreur] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const enEdition = Boolean(annonce?.id);

  const form = useForm<AnnonceInput>({
    resolver: typedZodResolver(annonceSchema),
    defaultValues: valeursAnnonceParDefaut(annonce, today),
  });

  useEffect(() => {
    if (open) {
      form.reset(valeursAnnonceParDefaut(annonce, today));
      setErreur(null);
    }
  }, [open, annonce, today, form]);

  const publiee = form.watch('publiee');

  async function handleSubmit(values: AnnonceInput) {
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
    toast.success(
      enEdition
        ? 'Annonce mise à jour'
        : values.publiee
          ? 'Annonce publiée'
          : 'Brouillon enregistré',
    );
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{enEdition ? 'Modifier l’annonce' : 'Nouvelle annonce'}</DialogTitle>
          <DialogDescription>
            Communication interne affichée dans le fil d’actualité des collaborateurs concernés.
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
                    <FormLabel>Titre</FormLabel>
                    <FormControl>
                      <Input maxLength={200} {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="categorie"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Catégorie</FormLabel>
                    <OptionSelect
                      options={OPTIONS_CATEGORIE}
                      value={field.value}
                      onChange={(v) => field.onChange(v ?? 'information')}
                      autoriserAucune={false}
                      aria-label="Catégorie"
                    />
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <FormField
              control={form.control}
              name="contenu"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Contenu</FormLabel>
                  <FormControl>
                    <Textarea rows={6} maxLength={10_000} {...field} />
                  </FormControl>
                  <FormDescription className="text-xs">
                    Texte brut : les retours à la ligne sont conservés.
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <FormField
                control={form.control}
                name="datePublication"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Date de publication</FormLabel>
                    <FormControl>
                      <Input type="date" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="dateExpiration"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Date d’expiration</FormLabel>
                    <FormControl>
                      <Input type="date" {...field} value={field.value ?? ''} />
                    </FormControl>
                    <FormDescription className="text-xs">
                      Facultative : l’annonce reste visible jusqu’à ce jour inclus.
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

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
            <p className="-mt-2 text-xs text-muted-foreground">
              Audience : sans site ni équipe, toute l’entreprise ; les deux critères se cumulent.
            </p>

            <div className="flex flex-wrap gap-6">
              <FormField
                control={form.control}
                name="publiee"
                render={({ field }) => (
                  <FormItem className="flex items-center gap-2">
                    <FormControl>
                      <Switch checked={field.value} onCheckedChange={field.onChange} />
                    </FormControl>
                    <FormLabel className="!mt-0">Publiée (sinon brouillon)</FormLabel>
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="epinglee"
                render={({ field }) => (
                  <FormItem className="flex items-center gap-2">
                    <FormControl>
                      <Switch checked={field.value} onCheckedChange={field.onChange} />
                    </FormControl>
                    <FormLabel className="!mt-0">Épinglée en tête du fil</FormLabel>
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
                    : publiee
                      ? 'Publier'
                      : 'Enregistrer le brouillon'}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
