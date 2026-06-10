'use client';

import { XIcon } from 'lucide-react';
import { useRouter } from 'next/navigation';

import { useGuardedRouter, useUnsavedChangesGuard } from "@/lib/hooks/navigation-guard";
import { useState, type ReactNode } from 'react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';

import { StatutActifBadge } from '@/components/tiers/statut-actif-badge';
import { StatutToggleButton } from '@/components/tiers/statut-toggle-button';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { typedZodResolver } from '@/lib/forms/zod-resolver';
import {
  sousTraitantSchema,
  STATUT_SOUS_TRAITANT_LABELS,
  STATUT_SOUS_TRAITANT_VALUES,
  type SousTraitantInput,
} from '@/lib/validation/tiers';

import { AdresseFields } from './adresse-fields';
import { StatutSousTraitantBadge } from './statut-sous-traitant-badge';

type ServerActionResult = {
  ok: boolean;
  error?: string;
  fieldErrors?: Record<string, string[]>;
  data?: { id: string } | void;
};

type Props = {
  defaultValues?: Partial<SousTraitantInput>;
  onSubmit: (values: SousTraitantInput) => Promise<ServerActionResult>;
  successRedirect: string;
  /** Titre affiché à gauche du bandeau d'actions (ex. raison sociale ou « Nouveau sous-traitant »). */
  titre: string;
  /**
   * Sous-traitants pouvant servir de « parent » de cascade (déjà filtrés côté
   * page : actifs, hors soi-même). Le trigger SQL `trg_st_anti_cycle` reste le
   * garde-fou (cycle / profondeur > 3 / autre entreprise).
   */
  parentsPossibles?: { id: string; code: string; nom: string }[];
  /**
   * Bascule immédiate du statut actif/inactif depuis le bandeau (fiche existante).
   * Closure `'use server'` fournie par la page. Absente en création.
   */
  onChangerStatut?: (actif: boolean) => Promise<ServerActionResult>;
  /** Action(s) contacts à afficher dans le bandeau (ex. « Créer un contact »). */
  actionContacts?: ReactNode;
};

/** Valeur sentinelle du select parent pour « Aucun » (pas de FK SelectItem vide). */
const AUCUN_PARENT = '__aucun__';

export function SousTraitantForm({
  defaultValues,
  onSubmit,
  successRedirect,
  titre,
  onChangerStatut,
  actionContacts,
  parentsPossibles = [],
}: Props) {
  const router = useRouter();
  const guardedRouter = useGuardedRouter();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  const [nouvelleQualif, setNouvelleQualif] = useState('');

  const form = useForm<SousTraitantInput>({
    resolver: typedZodResolver(sousTraitantSchema),
    defaultValues: {
      code: defaultValues?.code ?? '',
      nom: defaultValues?.nom ?? '',
      parentStId: defaultValues?.parentStId ?? null,
      tauxRetenueGarantie: defaultValues?.tauxRetenueGarantie ?? '0',
      siret: defaultValues?.siret ?? '',
      nTvaIntra: defaultValues?.nTvaIntra ?? '',
      email: defaultValues?.email ?? '',
      telephone: defaultValues?.telephone ?? '',
      adresseLigne1: defaultValues?.adresseLigne1 ?? '',
      adresseLigne2: defaultValues?.adresseLigne2 ?? '',
      codePostal: defaultValues?.codePostal ?? '',
      ville: defaultValues?.ville ?? '',
      pays: defaultValues?.pays ?? 'France',
      assuranceDecennaleNum: defaultValues?.assuranceDecennaleNum ?? '',
      assuranceDecennaleDateFin: defaultValues?.assuranceDecennaleDateFin ?? '',
      qualifications: defaultValues?.qualifications ?? [],
      agrementDc4: defaultValues?.agrementDc4 ?? false,
      dateAttestationUrssaf: defaultValues?.dateAttestationUrssaf ?? '',
      statut: defaultValues?.statut ?? 'a_qualifier',
      actif: defaultValues?.actif ?? true,
    },
  });
  useUnsavedChangesGuard({ isDirty: form.formState.isDirty });

  function ajouterQualification() {
    const valeur = nouvelleQualif.trim();
    if (!valeur) return;
    const actuelles = form.getValues('qualifications') ?? [];
    if (actuelles.includes(valeur)) {
      setNouvelleQualif('');
      return;
    }
    form.setValue('qualifications', [...actuelles, valeur], { shouldDirty: true });
    setNouvelleQualif('');
  }

  function retirerQualification(index: number) {
    const actuelles = form.getValues('qualifications') ?? [];
    form.setValue(
      'qualifications',
      actuelles.filter((_, i) => i !== index),
      { shouldDirty: true },
    );
  }

  async function handleSubmit(values: SousTraitantInput) {
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
    toast.success('Sous-traitant enregistré');
    router.push(successRedirect);
    router.refresh();
  }

  const qualifications = form.watch('qualifications') ?? [];
  // Statut courant suivi pour le badge du bandeau (mis à jour par le toggle).
  const statutActif = form.watch('actif');
  // Statut d'agrément (cycle de vie) suivi pour le badge du bandeau.
  const statutAgrement = form.watch('statut');

  return (
    <Form {...form}>
      {/* Barre d'actions sticky : titre + statut à gauche, actions à droite
          (même présentation que la fiche fournisseur). Le bouton Enregistrer est
          associé au <form> via l'attribut `form` bien qu'il soit hors de lui. */}
      <div className="sticky top-0 z-10 -mx-4 mb-6 flex flex-wrap items-center justify-between gap-3 border-b bg-card px-4 py-3 lg:-mx-8 lg:px-8">
        <div className="flex items-center gap-3">
          <h2 className="text-xl font-medium">{titre}</h2>
          <StatutSousTraitantBadge statut={statutAgrement} />
          {onChangerStatut && <StatutActifBadge actif={statutActif} />}
        </div>
        <div className="flex shrink-0 flex-wrap items-center gap-2">
          {onChangerStatut && (
            <StatutToggleButton
              actif={statutActif}
              libelle="Sous-traitant"
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
          <Button type="submit" form="sous-traitant-form" size="sm" disabled={isSubmitting}>
            {isSubmitting ? 'Enregistrement…' : 'Enregistrer'}
          </Button>
        </div>
      </div>

      <form
        id="sous-traitant-form"
        method="post"
        onSubmit={form.handleSubmit(handleSubmit)}
        className="grid max-w-2xl gap-6"
      >
        {erreur && (
          <Alert variant="destructive">
            <AlertTitle>Erreur</AlertTitle>
            <AlertDescription>{erreur}</AlertDescription>
          </Alert>
        )}

        <FormSection number={1} title="Identification" storageKey="sous-traitant:identification">
          <div className="space-y-4">
            <FormField
              control={form.control}
              name="code"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Code</FormLabel>
                  <FormControl>
                    <Input placeholder="ELEC-DURAND" maxLength={32} {...field} />
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
                  <FormLabel>Raison sociale</FormLabel>
                  <FormControl>
                    <Input maxLength={200} {...field} />
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
                  <FormLabel>Statut d&apos;agrément</FormLabel>
                  <Select value={field.value} onValueChange={field.onChange}>
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue>
                          {(value) =>
                            STATUT_SOUS_TRAITANT_LABELS[
                              value as keyof typeof STATUT_SOUS_TRAITANT_LABELS
                            ] ?? ''
                          }
                        </SelectValue>
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {STATUT_SOUS_TRAITANT_VALUES.map((v) => (
                        <SelectItem key={v} value={v}>
                          {STATUT_SOUS_TRAITANT_LABELS[v]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormDescription>
                    Cycle de référencement, indépendant de l&apos;activation (archivage).
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <FormField
                control={form.control}
                name="siret"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>SIRET</FormLabel>
                    <FormControl>
                      <Input placeholder="14 chiffres" maxLength={14} {...field} value={field.value ?? ''} />
                    </FormControl>
                    <FormDescription>14 chiffres sans espace.</FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="nTvaIntra"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>N° TVA intracom</FormLabel>
                    <FormControl>
                      <Input placeholder="FR12345678901" maxLength={15} {...field} value={field.value ?? ''} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <FormField
                control={form.control}
                name="parentStId"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Sous-traitant donneur d&apos;ordre (cascade)</FormLabel>
                    <Select
                      value={field.value ?? AUCUN_PARENT}
                      onValueChange={(v) => field.onChange(v === AUCUN_PARENT ? null : v)}
                    >
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue>
                            {(value) =>
                              value === AUCUN_PARENT || !value
                                ? 'Aucun (rang 1)'
                                : (parentsPossibles.find((p) => p.id === value)?.nom ?? '—')
                            }
                          </SelectValue>
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value={AUCUN_PARENT}>Aucun (rang 1)</SelectItem>
                        {parentsPossibles.map((p) => (
                          <SelectItem key={p.id} value={p.id}>
                            {p.code} — {p.nom}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormDescription>
                      Sous-traitance en chaîne (loi 75-1334) : 3 niveaux maximum.
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="tauxRetenueGarantie"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Retenue de garantie par défaut (%)</FormLabel>
                    <FormControl>
                      <Input
                        type="number"
                        min={0}
                        max={10}
                        step="0.01"
                        inputMode="decimal"
                        {...field}
                        value={field.value ?? '0'}
                      />
                    </FormControl>
                    <FormDescription>
                      0 à 10 % (usage CCAG). Repris sur les contrats et factures de ce sous-traitant.
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
          </div>
        </FormSection>

        <FormSection number={2} title="Coordonnées" storageKey="sous-traitant:coordonnees">
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
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
            </FormSubCard>

            <FormSubCard title="Adresse">
              <AdresseFields control={form.control} />
            </FormSubCard>
          </div>
        </FormSection>

        <FormSection
          number={3}
          title="Conformité légale (loi 75-1334)"
          storageKey="sous-traitant:vigilance"
        >
          <div className="space-y-4">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <FormField
                control={form.control}
                name="assuranceDecennaleNum"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Assurance décennale (n° police)</FormLabel>
                    <FormControl>
                      <Input maxLength={100} {...field} value={field.value ?? ''} />
                    </FormControl>
                    <FormDescription>Compagnie + numéro de police.</FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="assuranceDecennaleDateFin"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Validité jusqu&apos;au</FormLabel>
                    <FormControl>
                      <Input type="date" {...field} value={field.value ?? ''} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <FormField
                control={form.control}
                name="dateAttestationUrssaf"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Attestation URSSAF (date)</FormLabel>
                    <FormControl>
                      <Input type="date" {...field} value={field.value ?? ''} />
                    </FormControl>
                    <FormDescription>Date de la dernière attestation de vigilance.</FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="agrementDc4"
                render={({ field }) => (
                  <FormItem className="flex items-end gap-3">
                    <FormControl>
                      <Switch checked={field.value} onCheckedChange={field.onChange} />
                    </FormControl>
                    <FormLabel className="!mt-0">Agrément DC4 signé</FormLabel>
                  </FormItem>
                )}
              />
            </div>
          </div>
        </FormSection>

        <FormSection
          number={4}
          title="Qualifications"
          storageKey="sous-traitant:qualifications"
        >
          <div className="space-y-2">
            <div className="flex gap-2">
              <Input
                placeholder="Qualibat 1234, RGE…"
                value={nouvelleQualif}
                onChange={(e) => setNouvelleQualif(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    ajouterQualification();
                  }
                }}
                maxLength={100}
              />
              <Button type="button" variant="secondary" onClick={ajouterQualification}>
                Ajouter
              </Button>
            </div>
            {qualifications.length > 0 && (
              <ul className="flex flex-wrap gap-2 pt-1">
                {qualifications.map((q, i) => (
                  <li
                    key={`${q}-${i}`}
                    className="inline-flex items-center gap-1 rounded-full border bg-muted px-3 py-1 text-xs"
                  >
                    <span>{q}</span>
                    <button
                      type="button"
                      onClick={() => retirerQualification(i)}
                      className="text-muted-foreground hover:text-foreground"
                      aria-label={`Retirer ${q}`}
                    >
                      <XIcon className="size-3" />
                    </button>
                  </li>
                ))}
              </ul>
            )}
            <p className="text-xs text-muted-foreground">
              Ex. : Qualibat 1234, RGE, certification Veritas. Pressez Entrée pour ajouter.
            </p>
          </div>
        </FormSection>

      </form>
    </Form>
  );
}
