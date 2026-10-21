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
import { typedZodResolver } from '@/lib/forms/zod-resolver';
import type { ActionResult } from '@/lib/common/action-result';
import { LIBELLES_TYPE_SITE, TYPES_SITE } from '@/lib/validation/test-sirh/enums';
import { siteSchema, type SiteInput } from '@/lib/validation/test-sirh/organisation';

const OPTIONS_TYPE_SITE = optionsDepuisEnum(TYPES_SITE, LIBELLES_TYPE_SITE);

/** Valeurs initiales : TOUTES les clés sont présentes (convention des schémas SIRH). */
export function valeursSiteParDefaut(site?: Partial<SiteInput> | null): SiteInput {
  return {
    id: site?.id,
    code: site?.code ?? null,
    nom: site?.nom ?? '',
    typeSite: site?.typeSite ?? 'agence',
    adresseLigne1: site?.adresseLigne1 ?? null,
    adresseLigne2: site?.adresseLigne2 ?? null,
    codePostal: site?.codePostal ?? null,
    ville: site?.ville ?? null,
    pays: site?.pays ?? 'France',
    telephone: site?.telephone ?? null,
    actif: site?.actif ?? true,
    notes: site?.notes ?? null,
  };
}

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Site à modifier ; `null` = création. */
  site: Partial<SiteInput> | null;
  onSubmit: (values: SiteInput) => Promise<ActionResult<{ id: string }>>;
};

/** Modale de création / modification d'un lieu de travail (RHF + Zod). */
export function SiteDialog({ open, onOpenChange, site, onSubmit }: Props) {
  const [erreur, setErreur] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const enEdition = Boolean(site?.id);

  const form = useForm<SiteInput>({
    resolver: typedZodResolver(siteSchema),
    defaultValues: valeursSiteParDefaut(site),
  });

  useEffect(() => {
    if (open) {
      form.reset(valeursSiteParDefaut(site));
      setErreur(null);
    }
  }, [open, site, form]);

  async function handleSubmit(values: SiteInput) {
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
    toast.success(enEdition ? 'Site mis à jour' : 'Site créé');
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>{enEdition ? 'Modifier le site' : 'Nouveau site'}</DialogTitle>
          <DialogDescription>
            Siège, agence, dépôt ou atelier auquel les collaborateurs sont rattachés.
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
                name="nom"
                render={({ field }) => (
                  <FormItem className="sm:col-span-2">
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
                name="code"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Code</FormLabel>
                    <FormControl>
                      <Input maxLength={20} {...field} value={field.value ?? ''} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <FormField
                control={form.control}
                name="typeSite"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Type</FormLabel>
                    <OptionSelect
                      options={OPTIONS_TYPE_SITE}
                      value={field.value}
                      onChange={(v) => field.onChange(v ?? 'agence')}
                      autoriserAucune={false}
                      aria-label="Type de site"
                    />
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="telephone"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Téléphone</FormLabel>
                    <FormControl>
                      <Input maxLength={30} {...field} value={field.value ?? ''} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <FormField
              control={form.control}
              name="adresseLigne1"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Adresse</FormLabel>
                  <FormControl>
                    <Input maxLength={200} {...field} value={field.value ?? ''} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <FormField
                control={form.control}
                name="codePostal"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Code postal</FormLabel>
                    <FormControl>
                      <Input
                        inputMode="numeric"
                        maxLength={5}
                        {...field}
                        value={field.value ?? ''}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="ville"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Ville</FormLabel>
                    <FormControl>
                      <Input maxLength={120} {...field} value={field.value ?? ''} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="pays"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Pays</FormLabel>
                    <FormControl>
                      <Input maxLength={80} {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <FormField
              control={form.control}
              name="notes"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Notes</FormLabel>
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
                  <FormLabel className="!mt-0">Site actif</FormLabel>
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
                {isSubmitting ? 'Enregistrement…' : enEdition ? 'Enregistrer' : 'Créer le site'}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
