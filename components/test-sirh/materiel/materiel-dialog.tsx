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
import { Textarea } from '@/components/ui/textarea';
import type { ActionResult } from '@/lib/common/action-result';
import { typedZodResolver } from '@/lib/forms/zod-resolver';
import { statutsSaisissables } from '@/lib/test-sirh/materiel/regles';
import {
  CATEGORIES_MATERIEL,
  LIBELLES_CATEGORIE_MATERIEL,
  LIBELLES_STATUT_MATERIEL,
  type CategorieMateriel,
  type StatutMateriel,
} from '@/lib/validation/test-sirh/enums';
import { materielSchema, type MaterielInput } from '@/lib/validation/test-sirh/materiel';

const OPTIONS_CATEGORIE = optionsDepuisEnum(CATEGORIES_MATERIEL, LIBELLES_CATEGORIE_MATERIEL);

export type MaterielEditable = {
  id: string;
  categorie: CategorieMateriel;
  libelle: string;
  marque: string | null;
  modele: string | null;
  numeroSerie: string | null;
  taille: string | null;
  dateAchat: string | null;
  valeurAchat: number | null;
  dateFinGarantie: string | null;
  dateControle: string | null;
  statut: StatutMateriel;
  notes: string | null;
};

/** Valeurs initiales : TOUTES les clés présentes. */
export function valeursMaterielParDefaut(m: MaterielEditable | null): MaterielInput {
  return {
    id: m?.id,
    categorie: m?.categorie ?? 'epi',
    libelle: m?.libelle ?? '',
    marque: m?.marque ?? null,
    modele: m?.modele ?? null,
    numeroSerie: m?.numeroSerie ?? null,
    taille: m?.taille ?? null,
    dateAchat: m?.dateAchat ?? null,
    valeurAchat: m && m.valeurAchat !== null ? m.valeurAchat.toFixed(2) : null,
    dateFinGarantie: m?.dateFinGarantie ?? null,
    dateControle: m?.dateControle ?? null,
    statut: m?.statut ?? 'en_stock',
    notes: m?.notes ?? null,
  };
}

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Matériel à modifier ; `null` = création. */
  materiel: MaterielEditable | null;
  onSubmit: (values: MaterielInput) => Promise<ActionResult<{ id: string }>>;
};

/** Fiche d'un matériel / EPI (création ou modification). */
export function MaterielDialog({ open, onOpenChange, materiel, onSubmit }: Props) {
  const [erreur, setErreur] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const enEdition = Boolean(materiel?.id);

  const form = useForm<MaterielInput>({
    resolver: typedZodResolver(materielSchema),
    defaultValues: valeursMaterielParDefaut(materiel),
  });

  useEffect(() => {
    if (open) {
      form.reset(valeursMaterielParDefaut(materiel));
      setErreur(null);
    }
  }, [open, materiel, form]);

  const statutsPossibles = statutsSaisissables(materiel?.statut ?? null);
  const optionsStatut = optionsDepuisEnum(statutsPossibles, LIBELLES_STATUT_MATERIEL);
  const statutVerrouille = materiel?.statut === 'attribue';

  async function handleSubmit(values: MaterielInput) {
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
    toast.success(enEdition ? 'Matériel mis à jour' : 'Matériel ajouté à l’inventaire');
    onOpenChange(false);
  }

  const champTexte = (
    name: 'marque' | 'modele' | 'numeroSerie' | 'taille',
    label: string,
    max: number,
  ) => (
    <FormField
      control={form.control}
      name={name}
      render={({ field }) => (
        <FormItem>
          <FormLabel>{label}</FormLabel>
          <FormControl>
            <Input maxLength={max} {...field} value={field.value ?? ''} />
          </FormControl>
          <FormMessage />
        </FormItem>
      )}
    />
  );

  const champDate = (name: 'dateAchat' | 'dateFinGarantie' | 'dateControle', label: string) => (
    <FormField
      control={form.control}
      name={name}
      render={({ field }) => (
        <FormItem>
          <FormLabel>{label}</FormLabel>
          <FormControl>
            <Input type="date" {...field} value={field.value ?? ''} />
          </FormControl>
          <FormMessage />
        </FormItem>
      )}
    />
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{enEdition ? 'Modifier le matériel' : 'Nouveau matériel'}</DialogTitle>
          <DialogDescription>
            Informatique, téléphonie, EPI, outillage, badges, vêtements de travail. La date de
            contrôle déclenche une alerte 30 jours avant l’échéance.
          </DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(handleSubmit)} className="grid gap-4" noValidate>
            {erreur && (
              <Alert variant="destructive">
                <AlertTitle>Erreur</AlertTitle>
                <AlertDescription>{erreur}</AlertDescription>
              </Alert>
            )}
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <FormField
                control={form.control}
                name="categorie"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Catégorie</FormLabel>
                    <OptionSelect
                      options={OPTIONS_CATEGORIE}
                      value={field.value}
                      onChange={(v) => field.onChange(v ?? 'autre')}
                      autoriserAucune={false}
                      aria-label="Catégorie"
                    />
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="libelle"
                render={({ field }) => (
                  <FormItem className="sm:col-span-2">
                    <FormLabel>Libellé</FormLabel>
                    <FormControl>
                      <Input maxLength={200} placeholder="Ex. Harnais antichute" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {champTexte('marque', 'Marque', 100)}
              {champTexte('modele', 'Modèle', 100)}
              {champTexte('numeroSerie', 'N° de série', 100)}
              {champTexte('taille', 'Taille', 20)}
            </div>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              {champDate('dateAchat', 'Date d’achat')}
              <FormField
                control={form.control}
                name="valeurAchat"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Valeur d’achat (€ HT)</FormLabel>
                    <FormControl>
                      <Input
                        inputMode="decimal"
                        placeholder="0,00"
                        {...field}
                        value={field.value ?? ''}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              {champDate('dateFinGarantie', 'Fin de garantie')}
              {champDate('dateControle', 'Prochain contrôle / péremption')}
            </div>
            <FormField
              control={form.control}
              name="statut"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Statut</FormLabel>
                  <OptionSelect
                    options={optionsStatut}
                    value={field.value}
                    onChange={(v) => field.onChange(v ?? 'en_stock')}
                    autoriserAucune={false}
                    disabled={statutVerrouille}
                    aria-label="Statut"
                  />
                  {statutVerrouille && (
                    <p className="text-xs text-muted-foreground">
                      Matériel attribué : utilisez « Restituer » pour changer son statut.
                    </p>
                  )}
                  <FormMessage />
                </FormItem>
              )}
            />
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
                {isSubmitting ? 'Enregistrement…' : enEdition ? 'Enregistrer' : 'Ajouter'}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
