'use client';

import { useRouter } from 'next/navigation';

import { useGuardedRouter, useUnsavedChangesGuard } from '@/lib/hooks/navigation-guard';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';

import { typedZodResolver } from '@/lib/forms/zod-resolver';

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
import { Textarea } from '@/components/ui/textarea';
import {
  APTITUDES,
  CLASSIFICATIONS,
  LIBELLES_APTITUDE,
  LIBELLES_CLASSIFICATION,
  LIBELLES_SEXE,
  LIBELLES_SITUATION_FAMILIALE,
  LIBELLES_TYPE_CONTRAT,
  LIBELLES_ZONE,
  SEXES,
  SITUATIONS_FAMILIALES,
  TYPES_CONTRAT,
  ZONES_DEPLACEMENT,
  employeSchema,
  type EmployeInput,
} from '@/lib/validation/rh';

type ServerActionResult = {
  ok: boolean;
  error?: string;
  fieldErrors?: Record<string, string[]>;
  data?: { id: string } | void;
};

type Props = {
  defaultValues?: Partial<EmployeInput>;
  onSubmit: (values: EmployeInput) => Promise<ServerActionResult>;
  successRedirect: string;
};

export function EmployeForm({ defaultValues, onSubmit, successRedirect }: Props) {
  const router = useRouter();
  const guardedRouter = useGuardedRouter();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);

  const form = useForm<EmployeInput>({
    resolver: typedZodResolver(employeSchema),
    defaultValues: {
      nom: defaultValues?.nom ?? '',
      prenom: defaultValues?.prenom ?? '',
      typeContrat: defaultValues?.typeContrat ?? 'CDI',
      societeInterim: defaultValues?.societeInterim ?? null,
      qualification: defaultValues?.qualification ?? null,
      tauxHoraireBrut: defaultValues?.tauxHoraireBrut ?? null,
      heuresHebdoContractuelles: defaultValues?.heuresHebdoContractuelles ?? '39',
      zoneDeplacementDefaut: defaultValues?.zoneDeplacementDefaut ?? null,
      dateEntree: defaultValues?.dateEntree ?? null,
      dateSortie: defaultValues?.dateSortie ?? null,
      email: defaultValues?.email ?? null,
      telephoneMobile: defaultValues?.telephoneMobile ?? null,
      telephoneFixe: defaultValues?.telephoneFixe ?? null,
      actif: defaultValues?.actif ?? true,
      utilisateurId: defaultValues?.utilisateurId ?? null,
      notes: defaultValues?.notes ?? null,
      dateNaissance: defaultValues?.dateNaissance ?? null,
      lieuNaissance: defaultValues?.lieuNaissance ?? null,
      nationalite: defaultValues?.nationalite ?? 'Française',
      numeroSecu: defaultValues?.numeroSecu ?? null,
      sexe: defaultValues?.sexe ?? null,
      adresseLigne1: defaultValues?.adresseLigne1 ?? null,
      adresseLigne2: defaultValues?.adresseLigne2 ?? null,
      codePostal: defaultValues?.codePostal ?? null,
      ville: defaultValues?.ville ?? null,
      pays: defaultValues?.pays ?? 'France',
      contactUrgenceNom: defaultValues?.contactUrgenceNom ?? null,
      contactUrgenceTelephone: defaultValues?.contactUrgenceTelephone ?? null,
      contactUrgenceRelation: defaultValues?.contactUrgenceRelation ?? null,
      situationFamiliale: defaultValues?.situationFamiliale ?? null,
      nombreEnfants: defaultValues?.nombreEnfants ?? 0,
      matricule: defaultValues?.matricule ?? null,
      dateEmbauche: defaultValues?.dateEmbauche ?? null,
      dateFinContrat: defaultValues?.dateFinContrat ?? null,
      coefficientHierarchique: defaultValues?.coefficientHierarchique ?? null,
      classification: defaultValues?.classification ?? null,
      salaireMensuelBrut: defaultValues?.salaireMensuelBrut ?? null,
      conventionCollective: defaultValues?.conventionCollective ?? 'Bâtiment',
      iban: defaultValues?.iban ?? null,
      bic: defaultValues?.bic ?? null,
      dateDerniereVisiteMedicale: defaultValues?.dateDerniereVisiteMedicale ?? null,
      dateProchaineVisiteMedicale: defaultValues?.dateProchaineVisiteMedicale ?? null,
      aptitude: defaultValues?.aptitude ?? null,
      numeroCarteBtp: defaultValues?.numeroCarteBtp ?? null,
      dateValiditeCarteBtp: defaultValues?.dateValiditeCarteBtp ?? null,
    },
  });
  useUnsavedChangesGuard({ isDirty: form.formState.isDirty });

  const typeContrat = form.watch('typeContrat');

  async function handleSubmit(values: EmployeInput) {
    setErreur(null);
    setIsSubmitting(true);
    const r = await onSubmit(values);
    setIsSubmitting(false);
    if (!r.ok) {
      setErreur(r.error ?? 'Enregistrement impossible.');
      if (r.fieldErrors) {
        for (const [field, msgs] of Object.entries(r.fieldErrors)) {
          if (msgs?.[0]) form.setError(field as never, { type: 'server', message: msgs[0] });
        }
      }
      return;
    }
    toast.success('Employé enregistré');
    router.push(successRedirect);
    router.refresh();
  }

  return (
    <Form {...form}>
      <form method="post" onSubmit={form.handleSubmit(handleSubmit)} className="grid gap-4">
        {erreur && (
          <Alert variant="destructive">
            <AlertTitle>Erreur</AlertTitle>
            <AlertDescription>{erreur}</AlertDescription>
          </Alert>
        )}

        {/* ── 1. Identité professionnelle ── */}
        <FormSection number={1} title="Identité professionnelle" storageKey="employe:identite">
          <div className="grid gap-4">
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
              <FormField
                control={form.control}
                name="nom"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Nom</FormLabel>
                    <FormControl>
                      <Input maxLength={100} {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="prenom"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Prénom</FormLabel>
                    <FormControl>
                      <Input maxLength={100} {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="matricule"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Matricule interne</FormLabel>
                    <FormControl>
                      <Input maxLength={50} {...field} value={field.value ?? ''} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
              <FormField
                control={form.control}
                name="qualification"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Qualification</FormLabel>
                    <FormControl>
                      <Input
                        placeholder="Maçon, chef d'équipe…"
                        maxLength={100}
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
                name="classification"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Classification</FormLabel>
                    <Select
                      value={field.value ?? ''}
                      onValueChange={(v) => field.onChange(v === '__none__' ? null : v)}
                    >
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue>
                            {(v) =>
                              v
                                ? (LIBELLES_CLASSIFICATION[
                                    v as keyof typeof LIBELLES_CLASSIFICATION
                                  ] ?? v)
                                : 'Non précisée'
                            }
                          </SelectValue>
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="__none__">Non précisée</SelectItem>
                        {CLASSIFICATIONS.map((c) => (
                          <SelectItem key={c} value={c}>
                            {LIBELLES_CLASSIFICATION[c]}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="coefficientHierarchique"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Coefficient</FormLabel>
                    <FormControl>
                      <Input
                        placeholder="N1P1, 230, etc."
                        maxLength={50}
                        {...field}
                        value={field.value ?? ''}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
              <FormField
                control={form.control}
                name="typeContrat"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Type de contrat</FormLabel>
                    <Select value={field.value} onValueChange={field.onChange}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue>
                            {(v) =>
                              LIBELLES_TYPE_CONTRAT[v as keyof typeof LIBELLES_TYPE_CONTRAT] ?? v
                            }
                          </SelectValue>
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {TYPES_CONTRAT.map((t) => (
                          <SelectItem key={t} value={t}>
                            {LIBELLES_TYPE_CONTRAT[t]}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="actif"
                render={({ field }) => (
                  <FormItem className="flex items-end gap-3">
                    <FormControl>
                      <Switch checked={field.value} onCheckedChange={field.onChange} />
                    </FormControl>
                    <FormLabel className="!mt-0">Actif</FormLabel>
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="conventionCollective"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Convention collective</FormLabel>
                    <FormControl>
                      <Input maxLength={100} {...field} value={field.value ?? ''} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
            {typeContrat === 'INT' && (
              <FormField
                control={form.control}
                name="societeInterim"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Société d&apos;intérim (obligatoire)</FormLabel>
                    <FormControl>
                      <Input
                        placeholder="Randstad, Manpower…"
                        maxLength={200}
                        {...field}
                        value={field.value ?? ''}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            )}
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
              <FormField
                control={form.control}
                name="dateEntree"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Date d&apos;entrée</FormLabel>
                    <FormControl>
                      <Input type="date" {...field} value={field.value ?? ''} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="dateEmbauche"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Date d&apos;embauche officielle</FormLabel>
                    <FormControl>
                      <Input type="date" {...field} value={field.value ?? ''} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="dateFinContrat"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Fin contrat (CDD)</FormLabel>
                    <FormControl>
                      <Input type="date" {...field} value={field.value ?? ''} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="dateSortie"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Date de sortie</FormLabel>
                    <FormControl>
                      <Input type="date" {...field} value={field.value ?? ''} />
                    </FormControl>
                    <FormDescription>Vide = en poste.</FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
              <FormField
                control={form.control}
                name="tauxHoraireBrut"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Taux horaire brut (€)</FormLabel>
                    <FormControl>
                      <Input
                        type="number"
                        step="0.01"
                        min="0"
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
                name="salaireMensuelBrut"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Salaire mensuel brut (€)</FormLabel>
                    <FormControl>
                      <Input
                        type="number"
                        step="0.01"
                        min="0"
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
                name="heuresHebdoContractuelles"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Heures / semaine</FormLabel>
                    <FormControl>
                      <Input
                        type="number"
                        step="0.5"
                        min="0"
                        max="60"
                        {...field}
                        value={field.value ?? ''}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
            <FormField
              control={form.control}
              name="zoneDeplacementDefaut"
              render={({ field }) => (
                <FormItem className="max-w-xs">
                  <FormLabel>Zone déplacement par défaut</FormLabel>
                  <Select
                    value={field.value ?? ''}
                    onValueChange={(v) => field.onChange(v === '__none__' ? null : v)}
                  >
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue>
                          {(v) =>
                            v ? (LIBELLES_ZONE[v as keyof typeof LIBELLES_ZONE] ?? v) : 'Aucune'
                          }
                        </SelectValue>
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value="__none__">Aucune</SelectItem>
                      {ZONES_DEPLACEMENT.map((z) => (
                        <SelectItem key={z} value={z}>
                          {LIBELLES_ZONE[z]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>
        </FormSection>

        {/* ── 2. Identité civile ── */}
        <FormSection
          number={2}
          title="Identité civile"
          description="État civil, n° de sécurité sociale, nationalité."
          storageKey="employe:identite-civile"
        >
          <div className="grid gap-4">
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
              <FormField
                control={form.control}
                name="dateNaissance"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Date de naissance</FormLabel>
                    <FormControl>
                      <Input type="date" {...field} value={field.value ?? ''} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="lieuNaissance"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Lieu de naissance</FormLabel>
                    <FormControl>
                      <Input maxLength={100} {...field} value={field.value ?? ''} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="nationalite"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Nationalité</FormLabel>
                    <FormControl>
                      <Input maxLength={50} {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="sexe"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Sexe</FormLabel>
                    <Select
                      value={field.value ?? ''}
                      onValueChange={(v) => field.onChange(v === '__none__' ? null : v)}
                    >
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue>
                            {(v) =>
                              v
                                ? (LIBELLES_SEXE[v as keyof typeof LIBELLES_SEXE] ?? v)
                                : 'Non précisé'
                            }
                          </SelectValue>
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="__none__">Non précisé</SelectItem>
                        {SEXES.map((s) => (
                          <SelectItem key={s} value={s}>
                            {LIBELLES_SEXE[s]}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
            <FormField
              control={form.control}
              name="numeroSecu"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>N° de sécurité sociale</FormLabel>
                  <FormControl>
                    <Input
                      placeholder="13 à 15 chiffres"
                      maxLength={15}
                      {...field}
                      value={field.value ?? ''}
                    />
                  </FormControl>
                  <FormDescription>Confidentiel. Stockage chiffré recommandé.</FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>
        </FormSection>

        {/* ── 3. Coordonnées ── */}
        <FormSection
          number={3}
          title="Coordonnées"
          description="Adresse, contact, urgence."
          storageKey="employe:coordonnees"
        >
          <div className="grid gap-4">
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
            <FormField
              control={form.control}
              name="adresseLigne2"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Complément</FormLabel>
                  <FormControl>
                    <Input maxLength={200} {...field} value={field.value ?? ''} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              <FormField
                control={form.control}
                name="codePostal"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Code postal</FormLabel>
                    <FormControl>
                      <Input maxLength={5} {...field} value={field.value ?? ''} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="ville"
                render={({ field }) => (
                  <FormItem className="col-span-2">
                    <FormLabel>Ville</FormLabel>
                    <FormControl>
                      <Input maxLength={100} {...field} value={field.value ?? ''} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
            <FormField
              control={form.control}
              name="pays"
              render={({ field }) => (
                <FormItem className="max-w-xs">
                  <FormLabel>Pays</FormLabel>
                  <FormControl>
                    <Input maxLength={50} {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              <FormField
                control={form.control}
                name="telephoneMobile"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Téléphone mobile</FormLabel>
                    <FormControl>
                      <Input maxLength={30} {...field} value={field.value ?? ''} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="telephoneFixe"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Téléphone fixe</FormLabel>
                    <FormControl>
                      <Input maxLength={30} {...field} value={field.value ?? ''} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
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
            </div>
            <FormSubCard title="Personne à prévenir en cas d'urgence">
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                <FormField
                  control={form.control}
                  name="contactUrgenceNom"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Nom</FormLabel>
                      <FormControl>
                        <Input maxLength={100} {...field} value={field.value ?? ''} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="contactUrgenceTelephone"
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
                <FormField
                  control={form.control}
                  name="contactUrgenceRelation"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Lien</FormLabel>
                      <FormControl>
                        <Input
                          placeholder="Conjoint, parent…"
                          maxLength={50}
                          {...field}
                          value={field.value ?? ''}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
            </FormSubCard>
          </div>
        </FormSection>

        {/* ── 4. Famille ── */}
        <FormSection number={4} title="Situation familiale" storageKey="employe:famille">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <FormField
              control={form.control}
              name="situationFamiliale"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Situation</FormLabel>
                  <Select
                    value={field.value ?? ''}
                    onValueChange={(v) => field.onChange(v === '__none__' ? null : v)}
                  >
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue>
                          {(v) =>
                            v
                              ? (LIBELLES_SITUATION_FAMILIALE[
                                  v as keyof typeof LIBELLES_SITUATION_FAMILIALE
                                ] ?? v)
                              : 'Non précisée'
                          }
                        </SelectValue>
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value="__none__">Non précisée</SelectItem>
                      {SITUATIONS_FAMILIALES.map((s) => (
                        <SelectItem key={s} value={s}>
                          {LIBELLES_SITUATION_FAMILIALE[s]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="nombreEnfants"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Nombre d&apos;enfants à charge</FormLabel>
                  <FormControl>
                    <Input
                      type="number"
                      min="0"
                      max="20"
                      step="1"
                      {...field}
                      value={field.value ?? 0}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>
        </FormSection>

        {/* ── 5. Banque ── */}
        <FormSection
          number={5}
          title="Coordonnées bancaires"
          description="Pour le virement du salaire."
          storageKey="employe:banque"
        >
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <FormField
              control={form.control}
              name="iban"
              render={({ field }) => (
                <FormItem className="col-span-2">
                  <FormLabel>IBAN</FormLabel>
                  <FormControl>
                    <Input
                      placeholder="FR76..."
                      maxLength={34}
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
              name="bic"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>BIC</FormLabel>
                  <FormControl>
                    <Input maxLength={11} {...field} value={field.value ?? ''} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>
        </FormSection>

        {/* ── 6. Médical ── */}
        <FormSection
          number={6}
          title="Visite médicale"
          description="Suivi de l'aptitude."
          storageKey="employe:medical"
        >
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <FormField
              control={form.control}
              name="dateDerniereVisiteMedicale"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Dernière visite</FormLabel>
                  <FormControl>
                    <Input type="date" {...field} value={field.value ?? ''} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="dateProchaineVisiteMedicale"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Prochaine visite</FormLabel>
                  <FormControl>
                    <Input type="date" {...field} value={field.value ?? ''} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="aptitude"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Aptitude</FormLabel>
                  <Select
                    value={field.value ?? ''}
                    onValueChange={(v) => field.onChange(v === '__none__' ? null : v)}
                  >
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue>
                          {(v) =>
                            v
                              ? (LIBELLES_APTITUDE[v as keyof typeof LIBELLES_APTITUDE] ?? v)
                              : 'Non précisée'
                          }
                        </SelectValue>
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value="__none__">Non précisée</SelectItem>
                      {APTITUDES.map((a) => (
                        <SelectItem key={a} value={a}>
                          {LIBELLES_APTITUDE[a]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>
        </FormSection>

        {/* ── 7. Carte BTP ── */}
        <FormSection
          number={7}
          title="Carte BTP"
          description="Identifiant professionnel obligatoire pour le BTP."
          storageKey="employe:carte-btp"
        >
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <FormField
              control={form.control}
              name="numeroCarteBtp"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Numéro</FormLabel>
                  <FormControl>
                    <Input maxLength={30} {...field} value={field.value ?? ''} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="dateValiditeCarteBtp"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Date de validité</FormLabel>
                  <FormControl>
                    <Input type="date" {...field} value={field.value ?? ''} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>
        </FormSection>

        {/* ── 8. Notes ── */}
        <FormSection number={8} title="Notes internes" storageKey="employe:notes">
          <FormField
            control={form.control}
            name="notes"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Notes</FormLabel>
                <FormControl>
                  <Textarea rows={4} {...field} value={field.value ?? ''} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </FormSection>

        <div className="sticky bottom-0 -mx-4 flex justify-end gap-2 border-t bg-background/95 p-4 backdrop-blur">
          <Button
            variant="ghost"
            type="button"
            onClick={() => guardedRouter.back()}
            disabled={isSubmitting}
          >
            Annuler
          </Button>
          <Button type="submit" disabled={isSubmitting}>
            {isSubmitting ? 'Enregistrement…' : 'Enregistrer'}
          </Button>
        </div>
      </form>
    </Form>
  );
}
