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
import { FormSection, FormSubCard } from '@/components/ui/form-section';
import { Input } from '@/components/ui/input';
import { typedZodResolver } from '@/lib/forms/zod-resolver';
import { useGuardedRouter, useUnsavedChangesGuard } from '@/lib/hooks/navigation-guard';
import { cn } from '@/lib/utils';
import { fournisseurSchema, type FournisseurInput } from '@/lib/validation/tiers';

import { AdresseFields } from './adresse-fields';
import { ChampApercu, NoteProposee, ProposeBadge, SelectApercu } from './champs-proposes';

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
  /** Raisons sociales déjà connues du référentiel (autocomplétion + anti-doublon). */
  raisonsSocialesConnues?: string[];
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
  /** Badges complémentaires du bandeau (ex. « Préféré · N articles », « Vigilance »). */
  badges?: ReactNode;
  /**
   * Rail contextuel (zone D) rendu à droite des sections (fiche existante).
   * Composant serveur passé en prop : lecture seule, ne fait pas partie du
   * formulaire. Absent → le formulaire s'affiche en colonne simple (création).
   */
  rail?: ReactNode;
  /** Sous-titre du bandeau (ex. code · SIRET · dernière modification). */
  sousTitre?: ReactNode;
  /** Lien de retour (fil d'Ariane discret du bandeau, ex. vers la liste). */
  retourHref?: string;
  /** Libellé du lien de retour. */
  retourLabel?: string;
};

/**
 * N° de TVA intracommunautaire FR proposé à partir du SIREN (9 premiers chiffres
 * du SIRET) : `FR` + clé (12 + 3·(SIREN mod 97)) mod 97 + SIREN. Chaîne vide si
 * le SIRET ne contient pas encore 9 chiffres.
 */
function tvaIntracomProposee(siret: string | null | undefined): string {
  const digits = (siret ?? '').replace(/\D/g, '');
  if (digits.length < 9) return '';
  const siren = digits.slice(0, 9);
  const cle = (12 + 3 * (Number(siren) % 97)) % 97;
  return `FR${String(cle).padStart(2, '0')}${siren}`;
}

export function FournisseurForm({
  defaultValues,
  onSubmit,
  successRedirect,
  raisonsSocialesConnues = [],
  titre,
  fournisseurId,
  fournisseurNom,
  peutImporterCatalogue = false,
  nouvelleGrilleHref,
  onChangerStatut,
  actionContacts,
  badges,
  rail,
  sousTitre,
  retourHref,
  retourLabel = 'Fournisseurs',
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

  // Valeurs dérivées des champs « proposé » (aperçu, non enregistré).
  const tvaProposee = tvaIntracomProposee(form.watch('siret'));
  const codeCourant = form.watch('code');
  const compteAuxPropose = codeCourant ? `401${codeCourant.toUpperCase()}` : '';

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
      {/* Bandeau figé (zone B) : retour + titre + badges à gauche, actions à
          droite. Le bouton Enregistrer est associé au <form> via l'attribut
          `form` bien qu'il soit rendu hors de lui (gabarit « écran unifié »). */}
      <div className="sticky top-0 z-10 -mx-4 -mt-6 mb-5 border-b bg-card/95 px-4 py-3 backdrop-blur lg:-mx-8 lg:px-8">
        {retourHref && (
          <Link
            href={retourHref}
            className="mb-0.5 inline-block text-xs text-muted-foreground hover:text-foreground"
          >
            ‹ {retourLabel}
          </Link>
        )}
        <div className="flex flex-wrap items-center gap-3">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="truncate text-xl font-medium leading-tight">{titre}</h2>
              {onChangerStatut && <StatutActifBadge actif={statutActif} />}
              {badges}
            </div>
            {sousTitre && (
              <p className="mt-0.5 truncate text-xs text-muted-foreground">{sousTitre}</p>
            )}
          </div>
          <div className="ml-auto flex shrink-0 flex-wrap items-center gap-2">
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
      </div>

      {/* Grille zone C (saisie) + zone D (rail contextuel). Sans rail (création),
          le formulaire occupe une colonne simple. */}
      <div className={rail ? 'grid grid-cols-12 gap-5' : ''}>
        <form
          id="fournisseur-form"
          method="post"
          onSubmit={form.handleSubmit(handleSubmit)}
          className={rail ? 'col-span-12 space-y-5 lg:col-span-8' : 'grid max-w-2xl gap-6'}
        >
          {erreur && (
            <Alert variant="destructive">
              <AlertTitle>Erreur</AlertTitle>
              <AlertDescription>{erreur}</AlertDescription>
            </Alert>
          )}

          <FormSection number={1} title="Identification" storageKey="fournisseur:identification">
            <div className="space-y-4">
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <FormField
                  control={form.control}
                  name="code"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Code</FormLabel>
                      <FormControl>
                        <Input
                          placeholder="POINTP"
                          maxLength={32}
                          className="font-mono"
                          {...field}
                        />
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
                        <Input maxLength={200} list="raisons-sociales-connues" {...field} />
                      </FormControl>
                      {raisonsSocialesConnues.length > 0 && (
                        <datalist id="raisons-sociales-connues">
                          {raisonsSocialesConnues.map((rs) => (
                            <option key={rs} value={rs} />
                          ))}
                        </datalist>
                      )}
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
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
                          className="font-mono"
                          {...field}
                          value={field.value ?? ''}
                        />
                      </FormControl>
                      <FormDescription>14 chiffres sans espace.</FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <ChampApercu label="N° TVA intracom" badge>
                  <Input
                    disabled
                    readOnly
                    value={tvaProposee}
                    placeholder="FR…"
                    className="font-mono"
                  />
                  <p className="mt-1 text-xs text-muted-foreground">
                    Proposé d’après le SIREN — module export comptable (à venir).
                  </p>
                </ChampApercu>
              </div>
            </div>
          </FormSection>

          <FormSection number={2} title="Coordonnées" storageKey="fournisseur:coordonnees">
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
              <FormSubCard title="Adresse">
                <AdresseFields control={form.control} />
              </FormSubCard>

              <FormSubCard title="Contact générique">
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <FormField
                    control={form.control}
                    name="email"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Email</FormLabel>
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
                        <FormLabel>Téléphone</FormLabel>
                        <FormControl>
                          <Input {...field} value={field.value ?? ''} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
                <p className="text-xs text-muted-foreground">
                  Adresse e-mail / standard de l’agence. Les interlocuteurs sont gérés dans
                  Contacts.
                </p>
              </FormSubCard>
            </div>
          </FormSection>

          <FormSection
            number={3}
            title={
              <>
                Conditions d’achat <ProposeBadge />
              </>
            }
            storageKey="fournisseur:conditions-achat"
          >
            <div className="space-y-4">
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                <ChampApercu label="Devise">
                  <SelectApercu
                    value="EUR — Euro (€)"
                    options={['EUR — Euro (€)', 'CHF — Franc suisse', 'GBP — Livre sterling']}
                  />
                </ChampApercu>
                <ChampApercu label="Délai de règlement">
                  <SelectApercu
                    value="45 jours fin de mois"
                    options={[
                      'Comptant',
                      '30 jours nets',
                      '45 jours fin de mois',
                      '60 jours nets (max légal)',
                    ]}
                  />
                </ChampApercu>
                <ChampApercu label="Mode de règlement">
                  <SelectApercu
                    value="Virement"
                    options={['Virement', 'Prélèvement', 'Chèque', 'Carte']}
                  />
                </ChampApercu>
              </div>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <ChampApercu
                  label="Franco de port (€ HT)"
                  hint="Montant de commande au-delà duquel le port est offert."
                >
                  <Input disabled readOnly type="number" defaultValue="800" />
                </ChampApercu>
                <ChampApercu label="Minimum de commande (€ HT)">
                  <Input disabled readOnly type="number" defaultValue="150" />
                </ChampApercu>
              </div>
              <NoteProposee>
                Conditions commerciales reprises à la création des commandes d’achat. Champs
                proposés — module Achats (ADR à venir).
              </NoteProposee>
            </div>
          </FormSection>

          <FormSection
            number={4}
            title={
              <>
                Comptabilité <ProposeBadge />
              </>
            }
            storageKey="fournisseur:comptabilite"
          >
            <div className="space-y-4">
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <ChampApercu
                  label="Compte général de rattachement"
                  hint="Compte de charge (PCG BTP) des écritures d’achat."
                >
                  <SelectApercu
                    value="607100 — Achats de marchandises"
                    options={[
                      '607100 — Achats de marchandises',
                      '601000 — Achats de matières premières',
                      '604000 — Achats d’études et de prestations',
                    ]}
                  />
                </ChampApercu>
                <ChampApercu
                  label="Compte auxiliaire (tiers)"
                  hint="Compte tiers repris dans les exports Cegid / Sage / FEC. Dérivé du code par défaut."
                >
                  <Input
                    disabled
                    readOnly
                    value={compteAuxPropose}
                    placeholder="401…"
                    className="font-mono"
                  />
                </ChampApercu>
              </div>
              <NoteProposee>
                Repris à la génération des écritures : facture fournisseur → compte 607, TVA
                déductible → 44566. Champ proposé — module export comptable (ADR-005).
              </NoteProposee>
            </div>
          </FormSection>

          {peutImporter && (
            <ImportCatalogueDialog
              ref={importRef}
              fournisseurId={fournisseurId!}
              fournisseurNom={fournisseurNom!}
              hideTrigger
            />
          )}
        </form>

        {rail && <aside className="col-span-12 space-y-5 lg:col-span-4">{rail}</aside>}
      </div>
    </Form>
  );
}
