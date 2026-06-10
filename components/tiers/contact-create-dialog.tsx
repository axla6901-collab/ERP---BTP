'use client';

import { PlusIcon } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';

import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { ContactFields } from '@/components/contacts/contact-fields';
import { typedZodResolver } from '@/lib/forms/zod-resolver';
import { creerContactSchema, type CreerContactInput } from '@/lib/validation/tiers';

/** Option minimale (sérialisable) d'un tiers de rattachement. */
export type TiersOption = { id: string; nom: string };

type ServerActionResult = {
  ok: boolean;
  error?: string;
  fieldErrors?: Record<string, string[]>;
  data?: { id: string } | void;
};

type Props = {
  fournisseurs: TiersOption[];
  sousTraitants: TiersOption[];
  /** Closure `'use server'` fournie par la page (server action `creerContact`). */
  onCreer: (input: CreerContactInput) => Promise<ServerActionResult>;
};

const VALEURS_PAR_DEFAUT: CreerContactInput = {
  source: 'fournisseur',
  tiersId: '',
  nom: '',
  prenom: null,
  fonction: null,
  email: null,
  telephoneMobile: null,
  telephoneFixe: null,
  notes: null,
  principal: false,
  actif: true,
};

/**
 * Bouton « Nouveau contact » + modale de création depuis l'annuaire consolidé.
 *
 * Un contact doit toujours être rattaché à un tiers : on choisit d'abord le
 * type (fournisseur / sous-traitant) puis le tiers concerné, avant de saisir
 * les coordonnées. Les clients sont hors périmètre (pas de modèle multi-contacts).
 */
export function ContactCreateDialog({ fournisseurs, sousTraitants, onCreer }: Props) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const form = useForm<CreerContactInput>({
    resolver: typedZodResolver(creerContactSchema),
    defaultValues: VALEURS_PAR_DEFAUT,
  });

  const source = form.watch('source');
  const optionsTiers = source === 'fournisseur' ? fournisseurs : sousTraitants;
  const libelleSource = source === 'fournisseur' ? 'fournisseur' : 'sous-traitant';

  // Réinitialise tout (champs + erreurs) à chaque ouverture/fermeture.
  function changerOuverture(next: boolean) {
    setOpen(next);
    if (!next) {
      form.reset(VALEURS_PAR_DEFAUT);
      setErreur(null);
    }
  }

  async function handleSubmit(values: CreerContactInput) {
    setErreur(null);
    setIsSubmitting(true);
    const result = await onCreer(values);
    setIsSubmitting(false);
    if (!result.ok) {
      setErreur(result.error ?? 'Création impossible.');
      if (result.fieldErrors) {
        for (const [field, msgs] of Object.entries(result.fieldErrors)) {
          if (msgs?.[0]) form.setError(field as never, { type: 'server', message: msgs[0] });
        }
      }
      return;
    }
    toast.success('Contact créé');
    form.reset(VALEURS_PAR_DEFAUT);
    setOpen(false);
    router.refresh();
  }

  const aucunTiers = fournisseurs.length === 0 && sousTraitants.length === 0;

  return (
    <Dialog open={open} onOpenChange={changerOuverture}>
      <DialogTrigger
        render={
          <Button type="button">
            <PlusIcon className="size-4" />
            Nouveau contact
          </Button>
        }
      />
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Nouveau contact</DialogTitle>
          <DialogDescription>
            Rattachez le contact à un fournisseur ou un sous-traitant, puis saisissez ses
            coordonnées.
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

            {aucunTiers && (
              <Alert>
                <AlertDescription>
                  Aucun fournisseur ni sous-traitant n&apos;existe encore. Créez d&apos;abord un
                  tiers pour pouvoir y rattacher un contact.
                </AlertDescription>
              </Alert>
            )}

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <FormField
                control={form.control}
                name="source"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Type de tiers</FormLabel>
                    <Select
                      value={field.value}
                      onValueChange={(v) => {
                        if (!v) return;
                        field.onChange(v);
                        // Le tiers sélectionné dépend du type : on remet à zéro.
                        form.setValue('tiersId', '', { shouldValidate: false });
                      }}
                    >
                      <FormControl>
                        <SelectTrigger className="w-full">
                          <SelectValue>
                            {(v) => (v === 'sous_traitant' ? 'Sous-traitant' : 'Fournisseur')}
                          </SelectValue>
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="fournisseur">Fournisseur</SelectItem>
                        <SelectItem value="sous_traitant">Sous-traitant</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="tiersId"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Tiers de rattachement *</FormLabel>
                    <Select
                      value={field.value || ''}
                      onValueChange={(v) => v && field.onChange(v)}
                      disabled={optionsTiers.length === 0}
                    >
                      <FormControl>
                        <SelectTrigger className="w-full">
                          <SelectValue placeholder={`Choisir un ${libelleSource}…`} />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {optionsTiers.map((t) => (
                          <SelectItem key={t.id} value={t.id}>
                            {t.nom}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {optionsTiers.length === 0 && !aucunTiers && (
                      <p className="text-xs text-muted-foreground">
                        Aucun {libelleSource} disponible.
                      </p>
                    )}
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <ContactFields control={form.control} />

            <DialogFooter>
              <DialogClose
                render={
                  <Button type="button" variant="ghost" disabled={isSubmitting}>
                    Annuler
                  </Button>
                }
              />
              <Button type="submit" disabled={isSubmitting || aucunTiers}>
                {isSubmitting ? 'Création…' : 'Créer le contact'}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
