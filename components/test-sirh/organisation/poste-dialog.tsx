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
import type { ActionResult } from '@/lib/common/action-result';
import { typedZodResolver } from '@/lib/forms/zod-resolver';
import {
  CATEGORIES_PROFESSIONNELLES,
  LIBELLES_CATEGORIE_PROFESSIONNELLE,
  type CategorieProfessionnelle,
} from '@/lib/validation/test-sirh/enums';
import { posteSchema, type PosteInput } from '@/lib/validation/test-sirh/organisation';

const OPTIONS_CATEGORIE = optionsDepuisEnum(
  CATEGORIES_PROFESSIONNELLES,
  LIBELLES_CATEGORIE_PROFESSIONNELLE,
);

/** Valeurs initiales : TOUTES les clés sont présentes (convention des schémas SIRH). */
export function valeursPosteParDefaut(poste?: Partial<PosteInput> | null): PosteInput {
  return {
    id: poste?.id,
    code: poste?.code ?? null,
    intitule: poste?.intitule ?? '',
    famille: poste?.famille ?? null,
    categorie: poste?.categorie ?? null,
    niveau: poste?.niveau ?? null,
    coefficient: poste?.coefficient ?? null,
    description: poste?.description ?? null,
    actif: poste?.actif ?? true,
  };
}

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Poste à modifier ; `null` = création. */
  poste: Partial<PosteInput> | null;
  /** Familles déjà utilisées (suggestions de saisie). */
  familles: readonly string[];
  onSubmit: (values: PosteInput) => Promise<ActionResult<{ id: string }>>;
};

/** Modale de création / modification d'un poste du catalogue (RHF + Zod). */
export function PosteDialog({ open, onOpenChange, poste, familles, onSubmit }: Props) {
  const [erreur, setErreur] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const enEdition = Boolean(poste?.id);

  const form = useForm<PosteInput>({
    resolver: typedZodResolver(posteSchema),
    defaultValues: valeursPosteParDefaut(poste),
  });

  useEffect(() => {
    if (open) {
      form.reset(valeursPosteParDefaut(poste));
      setErreur(null);
    }
  }, [open, poste, form]);

  async function handleSubmit(values: PosteInput) {
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
    toast.success(enEdition ? 'Poste mis à jour' : 'Poste créé');
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>{enEdition ? 'Modifier le poste' : 'Nouveau poste'}</DialogTitle>
          <DialogDescription>
            Emploi du catalogue (intitulé, classification conventionnelle BTP) proposé dans les
            affectations, les contrats et les offres d’emploi.
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
                name="intitule"
                render={({ field }) => (
                  <FormItem className="sm:col-span-2">
                    <FormLabel>Intitulé</FormLabel>
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
                name="famille"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Famille métier</FormLabel>
                    <FormControl>
                      <Input
                        maxLength={80}
                        list="sirh-familles-postes"
                        placeholder="Gros œuvre, Second œuvre…"
                        {...field}
                        value={field.value ?? ''}
                      />
                    </FormControl>
                    <datalist id="sirh-familles-postes">
                      {familles.map((f) => (
                        <option key={f} value={f} />
                      ))}
                    </datalist>
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
                      onChange={(v) =>
                        field.onChange((v as CategorieProfessionnelle | null) ?? null)
                      }
                      libelleAucune="— Non précisée —"
                      aria-label="Catégorie"
                    />
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <FormField
                control={form.control}
                name="niveau"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Niveau / position</FormLabel>
                    <FormControl>
                      <Input
                        maxLength={20}
                        placeholder="N2P1, E, B…"
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
                name="coefficient"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Coefficient</FormLabel>
                    <FormControl>
                      <Input maxLength={20} {...field} value={field.value ?? ''} />
                    </FormControl>
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
                    <Textarea rows={3} maxLength={2000} {...field} value={field.value ?? ''} />
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
                  <FormLabel className="!mt-0">Poste actif</FormLabel>
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
                {isSubmitting ? 'Enregistrement…' : enEdition ? 'Enregistrer' : 'Créer le poste'}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
