'use client';

import { ListPlusIcon, UploadIcon } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useRef, useState, type ReactNode } from 'react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';

import {
  ImportCatalogueDialog,
  type ImportCatalogueDialogHandle,
} from '@/components/catalogue/import-catalogue-dialog';
import { StatutActifBadge } from '@/components/tiers/statut-actif-badge';
import { StatutToggleButton } from '@/components/tiers/statut-toggle-button';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button, buttonVariants } from '@/components/ui/button';
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { FormSection } from '@/components/ui/form-section';
import { Input } from '@/components/ui/input';
import { typedZodResolver } from '@/lib/forms/zod-resolver';
import { useGuardedRouter, useUnsavedChangesGuard } from '@/lib/hooks/navigation-guard';
import { cn } from '@/lib/utils';
import { fournisseurSchema, type FournisseurInput } from '@/lib/validation/tiers';

import { AdresseFields } from './adresse-fields';

type ServerActionResult = {
  ok: boolean;
  error?: string;
  fieldErrors?: Record<string, string[]>;
  data?: { id: string } | void;
};

type Props = {
  defaultValues?: Partial<FournisseurInput>;
  onSubmit: (values: FournisseurInput) => Promise<ServerActionResult>;
  successRedirect: string;
  /** Titre affiché à gauche de la barre d'actions (ex. nom du fournisseur). */
  titre: string;
  /** Identité du fournisseur existant — active les actions catalogue (import / nouvelle grille). */
  fournisseurId?: string;
  fournisseurNom?: string;
  /** Autorise l'action « Import catalogue » (bouton + zone d'import inline). */
  peutImporterCatalogue?: boolean;
  /** Cible du lien « Création catalogue » (nouvelle grille tarifaire). */
  nouvelleGrilleHref?: string;
  /**
   * Bascule immédiate du statut actif/inactif depuis le bandeau (fiche existante).
   * Closure `'use server'` fournie par la page. Absente en création (rien à basculer).
   */
  onChangerStatut?: (actif: boolean) => Promise<ServerActionResult>;
  /** Action(s) contacts à afficher dans le bandeau (ex. « Créer un contact »). */
  actionContacts?: ReactNode;
};

export function FournisseurForm({
  defaultValues,
  onSubmit,
  successRedirect,
  titre,
  fournisseurId,
  fournisseurNom,
  peutImporterCatalogue = false,
  nouvelleGrilleHref,
  onChangerStatut,
  actionContacts,
}: Props) {
  const router = useRouter();
  const guardedRouter = useGuardedRouter();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);

  // Zone d'import catalogue : rendue dans le corps du form, ouverte depuis la barre.
  const importRef = useRef<ImportCatalogueDialogHandle>(null);
  const peutImporter = Boolean(peutImporterCatalogue && fournisseurId && fournisseurNom);

  const form = useForm<FournisseurInput>({
    resolver: typedZodResolver(fournisseurSchema),
    defaultValues: {
      code: defaultValues?.code ?? '',
      nom: defaultValues?.nom ?? '',
      siret: defaultValues?.siret ?? '',
      email: defaultValues?.email ?? '',
      telephone: defaultValues?.telephone ?? '',
      adresseLigne1: defaultValues?.adresseLigne1 ?? '',
      adresseLigne2: defaultValues?.adresseLigne2 ?? '',
      codePostal: defaultValues?.codePostal ?? '',
      ville: defaultValues?.ville ?? '',
      pays: defaultValues?.pays ?? 'France',
      actif: defaultValues?.actif ?? true,
    },
  });
  useUnsavedChangesGuard({ isDirty: form.formState.isDirty });

  // Statut courant suivi pour le badge du bandeau (mis à jour par le toggle).
  const statutActif = form.watch('actif');

  async function handleSubmit(values: FournisseurInput) {
    setErreur(null);
    setIsSubmitting(true);
    const result = await onSubmit(values);
    setIsSubmitting(false);
    if (!result.ok) {
      setErreur(result.error ?? 'Enregistrement impossible.');
      if (result.fieldErrors) {
        for (const [field, msgs] of Object.entries(result.fieldErrors)) {
          if (msgs?.[0]) form.setError(field as never, { type: 'server', message: msgs[0] });
        }
      }
      return;
    }
    toast.success('Fournisseur enregistré');
    router.push(successRedirect);
    router.refresh();
  }

  return (
    <Form {...form}>
      {/* Barre d'actions sticky en haut : titre à gauche, actions à droite
          (même présentation que la fiche devis). Le bouton Enregistrer est
          associé au <form> via l'attribut `form` bien qu'il soit hors de lui. */}
      <div className="sticky top-0 z-10 -mx-4 mb-6 flex flex-wrap items-center justify-between gap-3 border-b bg-card px-4 py-3 lg:-mx-8 lg:px-8">
        <div className="flex items-center gap-3">
          <h2 className="text-xl font-medium">{titre}</h2>
          {onChangerStatut && <StatutActifBadge actif={statutActif} />}
        </div>
        <div className="flex shrink-0 flex-wrap items-center gap-2">
          {onChangerStatut && (
            <StatutToggleButton
              actif={statutActif}
              libelle="Fournisseur"
              action={onChangerStatut}
              onDone={(actif) => form.setValue('actif', actif, { shouldDirty: false })}
            />
          )}
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => guardedRouter.back()}
            disabled={isSubmitting}
          >
            Annuler
          </Button>
          {actionContacts}
          {peutImporter && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="gap-1.5"
              onClick={() => importRef.current?.ouvrir()}
            >
              <UploadIcon className="size-4" aria-hidden="true" />
              Import catalogue
            </Button>
          )}
          {nouvelleGrilleHref && (
            <Link
              href={nouvelleGrilleHref}
              className={cn(buttonVariants({ variant: 'outline', size: 'sm' }), 'gap-1.5')}
            >
              <ListPlusIcon className="size-4" aria-hidden="true" />
              Création catalogue
            </Link>
          )}
          <Button type="submit" form="fournisseur-form" size="sm" disabled={isSubmitting}>
            {isSubmitting ? 'Enregistrement…' : 'Enregistrer'}
          </Button>
        </div>
      </div>

      <form
        id="fournisseur-form"
        method="post"
        onSubmit={form.handleSubmit(handleSubmit)}
        className="grid max-w-5xl gap-6"
      >
        {erreur && (
          <Alert variant="destructive">
            <AlertTitle>Erreur</AlertTitle>
            <AlertDescription>{erreur}</AlertDescription>
          </Alert>
        )}

        <div className="grid grid-cols-1 items-start gap-6 md:grid-cols-2">
          <FormSection number={1} title="Identification" storageKey="fournisseur:identification">
            <div className="space-y-4">
              <FormField
                control={form.control}
                name="code"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Code</FormLabel>
                    <FormControl>
                      <Input placeholder="POINTP" maxLength={32} {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="nom"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Nom</FormLabel>
                    <FormControl>
                      <Input maxLength={200} {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="siret"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>SIRET (optionnel)</FormLabel>
                    <FormControl>
                      <Input
                        placeholder="14 chiffres"
                        maxLength={14}
                        {...field}
                        value={field.value ?? ''}
                      />
                    </FormControl>
                    <FormDescription>14 chiffres sans espace.</FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <FormField
                  control={form.control}
                  name="email"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Email (générique)</FormLabel>
                      <FormControl>
                        <Input type="email" {...field} value={field.value ?? ''} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="telephone"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Téléphone (générique)</FormLabel>
                      <FormControl>
                        <Input {...field} value={field.value ?? ''} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
            </div>
          </FormSection>

          <FormSection number={2} title="Adresse" storageKey="fournisseur:adresse">
            <AdresseFields control={form.control} />
          </FormSection>
        </div>

        {peutImporter && (
          <ImportCatalogueDialog
            ref={importRef}
            fournisseurId={fournisseurId!}
            fournisseurNom={fournisseurNom!}
            hideTrigger
          />
        )}
      </form>
    </Form>
  );
}
