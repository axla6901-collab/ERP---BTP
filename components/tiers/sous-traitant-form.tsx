'use client';

import { XIcon } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';

import { useGuardedRouter, useUnsavedChangesGuard } from '@/lib/hooks/navigation-guard';
import { useState, type ReactNode } from 'react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';

import { ConformitePastille, RangCascadeBadge } from '@/components/tiers/conformite-badges';
import { StatutActifBadge } from '@/components/tiers/statut-actif-badge';
import { StatutToggleButton } from '@/components/tiers/statut-toggle-button';
import type { NiveauConformite } from '@/lib/sous-traitance/fiche-synthese';
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
import { typedZodResolver } from '@/lib/forms/zod-resolver';
import {
  sousTraitantSchema,
  STATUT_SOUS_TRAITANT_LABELS,
  STATUT_SOUS_TRAITANT_VALUES,
  type SousTraitantInput,
} from '@/lib/validation/tiers';

import { AdresseFields } from './adresse-fields';
import { ChampApercu, NoteProposee, ProposeBadge, SelectApercu } from './champs-proposes';
import { StatutSousTraitantBadge } from './statut-sous-traitant-badge';
import { useCheminTenant } from '@/lib/navigation/use-chemin-tenant';

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
  /** Raisons sociales déjà connues du référentiel (autocomplétion + anti-doublon). */
  raisonsSocialesConnues?: string[];
  /**
   * Rail contextuel (zone D) rendu à droite des sections (fiche existante).
   * Composant serveur passé en prop : lecture seule, ne fait pas partie du
   * formulaire. Absent → le formulaire s'affiche en colonne simple (création).
   */
  rail?: ReactNode;
  /** Pastille de rang de cascade dans le bandeau (calculée côté page). */
  rangCascade?: { rang: number; max: number; depassement: boolean } | null;
  /** Pastille de synthèse de conformité dans le bandeau (calculée côté page). */
  conformite?: { niveau: NiveauConformite; label: string } | null;
  /** Sous-titre du bandeau (ex. code · SIRET · dernière modification). */
  sousTitre?: ReactNode;
  /** Lien de retour (fil d'Ariane discret du bandeau, ex. vers la liste). */
  retourHref?: string;
  /** Libellé du lien de retour. */
  retourLabel?: string;
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
  raisonsSocialesConnues = [],
  rail,
  rangCascade,
  conformite,
  sousTitre,
  retourHref,
  retourLabel = 'Sous-traitants',
}: Props) {
  const router = useRouter();
  const versTenant = useCheminTenant();
  const guardedRouter = useGuardedRouter();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  const [nouvelleQualif, setNouvelleQualif] = useState('');

  const form = useForm<SousTraitantInput>({
    resolver: typedZodResolver(sousTraitantSchema),
    defaultValues: {
      code: defaultValues?.code ?? '',
      nom: defaultValues?.nom ?? '',
      gerantNom: defaultValues?.gerantNom ?? '',
      gerantPrenom: defaultValues?.gerantPrenom ?? '',
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
      // Conformité (décennale / URSSAF / DC4) : plus saisie ici — elle est dérivée
      // des pièces de la zone Vigilance (cf. maquette). Ces champs scalaires restent
      // conservés en l'état (passthrough) le temps de la migration des données.
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
    router.push(versTenant(successRedirect));
    router.refresh();
  }

  const qualifications = form.watch('qualifications') ?? [];
  // Statut courant suivi pour le badge du bandeau (mis à jour par le toggle).
  const statutActif = form.watch('actif');
  // Statut d'agrément (cycle de vie) suivi pour le badge du bandeau.
  const statutAgrement = form.watch('statut');
  // Compte auxiliaire (tiers) proposé pour l'aperçu Comptabilité (non enregistré).
  const codeCourant = form.watch('code');
  const compteAuxPropose = codeCourant ? `401${codeCourant.toUpperCase()}` : '';

  return (
    <Form {...form}>
      {/* Bandeau figé (zone B) : retour + titre + badges à gauche, actions à
          droite. Le bouton Enregistrer est associé au <form> via l'attribut
          `form` bien qu'il soit rendu hors de lui (gabarit « écran unifié »). */}
      <div className="sticky top-0 z-10 -mx-4 -mt-6 mb-5 border-b bg-card/95 px-4 py-3 backdrop-blur lg:-mx-8 lg:px-8">
        {retourHref && (
          <Link
            href={versTenant(retourHref)}
            className="mb-0.5 inline-block text-xs text-muted-foreground hover:text-foreground"
          >
            ‹ {retourLabel}
          </Link>
        )}
        <div className="flex flex-wrap items-center gap-3">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="truncate text-lg font-semibold leading-tight">{titre}</h2>
              <StatutSousTraitantBadge statut={statutAgrement} />
              {onChangerStatut && <StatutActifBadge actif={statutActif} />}
              {rangCascade && (
                <RangCascadeBadge
                  rang={rangCascade.rang}
                  max={rangCascade.max}
                  depassement={rangCascade.depassement}
                />
              )}
              {conformite && (
                <ConformitePastille niveau={conformite.niveau} label={conformite.label} />
              )}
            </div>
            {sousTitre && (
              <p className="mt-0.5 truncate text-xs text-muted-foreground">{sousTitre}</p>
            )}
          </div>
          <div className="ml-auto flex shrink-0 flex-wrap items-center gap-2">
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
      </div>

      {/* Grille zone C (saisie) + zone D (rail contextuel). Sans rail (création),
          le formulaire occupe une colonne simple. */}
      <div className={rail ? 'grid grid-cols-12 gap-5' : ''}>
        <form
          id="sous-traitant-form"
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
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <FormField
                  control={form.control}
                  name="gerantPrenom"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Prénom du gérant</FormLabel>
                      <FormControl>
                        <Input maxLength={100} {...field} value={field.value ?? ''} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="gerantNom"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Nom du gérant</FormLabel>
                      <FormControl>
                        <Input maxLength={100} {...field} value={field.value ?? ''} />
                      </FormControl>
                      <FormDescription>
                        Mandataire social de la société sous-traitante.
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
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
                <FormField
                  control={form.control}
                  name="nTvaIntra"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>N° TVA intracom</FormLabel>
                      <FormControl>
                        <Input
                          placeholder="FR12345678901"
                          maxLength={15}
                          {...field}
                          value={field.value ?? ''}
                        />
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
                        0 à 10 % (usage CCAG). Repris sur les contrats et factures de ce
                        sous-traitant.
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
              </FormSubCard>
            </div>
          </FormSection>

          {/* Comptabilité (proposé) : aperçu lecture seule rattaché au module export
            comptable (ADR-005). La conformité (décennale, URSSAF, DC4) n'est plus
            saisie dans la colonne : elle vit dans le tableau Vigilance (zone E). */}
          <FormSection
            number={3}
            title={
              <>
                Comptabilité <ProposeBadge />
              </>
            }
            storageKey="sous-traitant:comptabilite"
          >
            <div className="space-y-4">
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <ChampApercu
                  label="Compte général de rattachement"
                  hint="Compte de charge (PCG BTP) des écritures de sous-traitance."
                >
                  <SelectApercu
                    value="611100 — Sous-traitance BTP"
                    options={[
                      '611100 — Sous-traitance BTP',
                      "604000 — Achats d'études et de prestations",
                      '401000 — Fournisseurs',
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
                Repris à la génération des écritures : facture de sous-traitance → compte 611,
                retenue de garantie → 4017. Champ proposé — module export comptable (ADR-005).
              </NoteProposee>
            </div>
          </FormSection>

          <FormSection number={4} title="Qualifications" storageKey="sous-traitant:qualifications">
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

        {rail && <aside className="col-span-12 space-y-5 lg:col-span-4">{rail}</aside>}
      </div>
    </Form>
  );
}
