'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';

import { PageToolbar } from '@/components/layout/page-toolbar';
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
import { FormSection } from '@/components/ui/form-section';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { typedZodResolver } from '@/lib/forms/zod-resolver';
import { useGuardedRouter, useUnsavedChangesGuard } from '@/lib/hooks/navigation-guard';
import {
  CARBURANTS,
  LIBELLES_CARBURANT,
  LIBELLES_MODE_DETENTION,
  LIBELLES_STATUT_VEHICULE,
  LIBELLES_TYPE_VEHICULE,
  MODES_DETENTION,
  STATUTS_VEHICULE,
  TYPES_VEHICULE,
  vehiculeSchema,
  type VehiculeInput,
} from '@/lib/validation/flotte';
import { useCheminTenant } from '@/lib/navigation/use-chemin-tenant';

type ServerActionResult = {
  ok: boolean;
  error?: string;
  fieldErrors?: Record<string, string[]>;
  data?: { id: string } | void;
};

type EmployeOption = { id: string; nom: string };

type Props = {
  defaultValues?: Partial<VehiculeInput>;
  employes: EmployeOption[];
  onSubmit: (values: VehiculeInput) => Promise<ServerActionResult>;
  successRedirect: string;
  titre: string;
  sousTitre?: React.ReactNode;
  backHref?: string;
  backLabel?: React.ReactNode;
  actions?: React.ReactNode;
  railTop?: React.ReactNode;
  railBottom?: React.ReactNode;
};

const CONDUCTEUR_NONE = '__none__';

export function VehiculeForm({
  defaultValues,
  employes,
  onSubmit,
  successRedirect,
  titre,
  sousTitre,
  backHref,
  backLabel,
  actions,
  railTop,
  railBottom,
}: Props) {
  const router = useRouter();
  const versTenant = useCheminTenant();
  const guardedRouter = useGuardedRouter();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);

  const form = useForm<VehiculeInput>({
    resolver: typedZodResolver(vehiculeSchema),
    defaultValues: {
      id: defaultValues?.id,
      immatriculation: defaultValues?.immatriculation ?? '',
      codeInterne: defaultValues?.codeInterne ?? null,
      typeVehicule: defaultValues?.typeVehicule ?? 'vl',
      marque: defaultValues?.marque ?? '',
      modele: defaultValues?.modele ?? '',
      version: defaultValues?.version ?? null,
      vin: defaultValues?.vin ?? null,
      carburant: defaultValues?.carburant ?? 'diesel',
      datePremiereImmat: defaultValues?.datePremiereImmat ?? null,
      puissanceFiscale: defaultValues?.puissanceFiscale ?? null,
      critair: defaultValues?.critair ?? null,
      places: defaultValues?.places ?? null,
      ptacKg: defaultValues?.ptacKg ?? null,
      couleur: defaultValues?.couleur ?? null,
      modeDetention: defaultValues?.modeDetention ?? 'propriete',
      dateAcquisition: defaultValues?.dateAcquisition ?? null,
      prixAcquisitionHt: defaultValues?.prixAcquisitionHt ?? null,
      valeurResiduelleHt: defaultValues?.valeurResiduelleHt ?? null,
      loyerMensuelHt: defaultValues?.loyerMensuelHt ?? null,
      organismeFinancement: defaultValues?.organismeFinancement ?? null,
      kilometrageActuel: defaultValues?.kilometrageActuel ?? 0,
      dateReleveKm: defaultValues?.dateReleveKm ?? null,
      conducteurPrincipalId: defaultValues?.conducteurPrincipalId ?? null,
      statut: defaultValues?.statut ?? 'actif',
      dateSortieParc: defaultValues?.dateSortieParc ?? null,
      prixReventeHt: defaultValues?.prixReventeHt ?? null,
      notes: defaultValues?.notes ?? null,
    },
  });
  useUnsavedChangesGuard({ isDirty: form.formState.isDirty });

  async function handleSubmit(values: VehiculeInput) {
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
    toast.success('Véhicule enregistré');
    // Valeurs enregistrées = nouvelle référence : sans ce reset, le formulaire
    // reste « modifié » quand on reste sur la fiche (édition → même page) et la
    // garde de navigation réclame un enregistrement déjà fait.
    form.reset(form.getValues());
    router.push(versTenant(successRedirect));
    router.refresh();
  }

  return (
    <Form {...form}>
      <PageToolbar
        title={titre}
        subtitle={sousTitre}
        backHref={backHref ? versTenant(backHref) : undefined}
        backLabel={backLabel}
        actions={
          <>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => guardedRouter.back()}
              disabled={isSubmitting}
            >
              Annuler
            </Button>
            {actions}
            <Button type="submit" form="vehicule-form" size="sm" disabled={isSubmitting}>
              {isSubmitting ? 'Enregistrement…' : 'Enregistrer'}
            </Button>
          </>
        }
      />

      <form
        id="vehicule-form"
        method="post"
        onSubmit={form.handleSubmit(handleSubmit)}
        className="space-y-5"
      >
        {erreur && (
          <Alert variant="destructive">
            <AlertTitle>Erreur</AlertTitle>
            <AlertDescription>{erreur}</AlertDescription>
          </Alert>
        )}

        <div className="flex flex-col gap-5 lg:flex-row lg:items-start">
          {/* Zone C — saisie */}
          <div className="min-w-0 flex-1 space-y-5">
            <FormSection number={1} title="Identification" storageKey="vehicule:identification">
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                <FormField
                  control={form.control}
                  name="immatriculation"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Immatriculation</FormLabel>
                      <FormControl>
                        <Input placeholder="AA-123-BB" maxLength={15} {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="codeInterne"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Code interne</FormLabel>
                      <FormControl>
                        <Input
                          placeholder="VEH-0007"
                          maxLength={32}
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
                  name="typeVehicule"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Catégorie</FormLabel>
                      <Select value={field.value} onValueChange={field.onChange}>
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue>
                              {(v) =>
                                LIBELLES_TYPE_VEHICULE[v as keyof typeof LIBELLES_TYPE_VEHICULE] ??
                                'Catégorie'
                              }
                            </SelectValue>
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {TYPES_VEHICULE.map((t) => (
                            <SelectItem key={t} value={t}>
                              {LIBELLES_TYPE_VEHICULE[t]}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
              <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-3">
                <FormField
                  control={form.control}
                  name="marque"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Marque</FormLabel>
                      <FormControl>
                        <Input maxLength={80} {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="modele"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Modèle</FormLabel>
                      <FormControl>
                        <Input maxLength={80} {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="version"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Version</FormLabel>
                      <FormControl>
                        <Input maxLength={80} {...field} value={field.value ?? ''} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
              <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-3">
                <FormField
                  control={form.control}
                  name="carburant"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Énergie</FormLabel>
                      <Select value={field.value} onValueChange={field.onChange}>
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue>
                              {(v) =>
                                LIBELLES_CARBURANT[v as keyof typeof LIBELLES_CARBURANT] ??
                                'Énergie'
                              }
                            </SelectValue>
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {CARBURANTS.map((c) => (
                            <SelectItem key={c} value={c}>
                              {LIBELLES_CARBURANT[c]}
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
                  name="vin"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>N° de série (VIN)</FormLabel>
                      <FormControl>
                        <Input maxLength={17} {...field} value={field.value ?? ''} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="datePremiereImmat"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>1re mise en circulation</FormLabel>
                      <FormControl>
                        <Input type="date" {...field} value={field.value ?? ''} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
            </FormSection>

            <FormSection
              number={2}
              title="Caractéristiques & détention"
              storageKey="vehicule:caracteristiques"
            >
              <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
                <FormField
                  control={form.control}
                  name="puissanceFiscale"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Puissance (CV)</FormLabel>
                      <FormControl>
                        <Input inputMode="numeric" {...field} value={field.value ?? ''} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="critair"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Crit&apos;Air</FormLabel>
                      <FormControl>
                        <Input
                          inputMode="numeric"
                          placeholder="0-5"
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
                  name="kilometrageActuel"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Kilométrage</FormLabel>
                      <FormControl>
                        <Input inputMode="numeric" {...field} value={field.value ?? ''} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="ptacKg"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>PTAC (kg)</FormLabel>
                      <FormControl>
                        <Input inputMode="numeric" {...field} value={field.value ?? ''} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
              <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-3">
                <FormField
                  control={form.control}
                  name="modeDetention"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Mode de détention</FormLabel>
                      <Select value={field.value} onValueChange={field.onChange}>
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue>
                              {(v) =>
                                LIBELLES_MODE_DETENTION[
                                  v as keyof typeof LIBELLES_MODE_DETENTION
                                ] ?? 'Détention'
                              }
                            </SelectValue>
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {MODES_DETENTION.map((m) => (
                            <SelectItem key={m} value={m}>
                              {LIBELLES_MODE_DETENTION[m]}
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
                  name="loyerMensuelHt"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Loyer mensuel HT (€)</FormLabel>
                      <FormControl>
                        <Input inputMode="decimal" {...field} value={field.value ?? ''} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="prixAcquisitionHt"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Prix d&apos;acquisition HT (€)</FormLabel>
                      <FormControl>
                        <Input inputMode="decimal" {...field} value={field.value ?? ''} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
              <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-3">
                <FormField
                  control={form.control}
                  name="organismeFinancement"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Organisme de financement</FormLabel>
                      <FormControl>
                        <Input maxLength={120} {...field} value={field.value ?? ''} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="couleur"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Couleur</FormLabel>
                      <FormControl>
                        <Input maxLength={40} {...field} value={field.value ?? ''} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="places"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Places</FormLabel>
                      <FormControl>
                        <Input inputMode="numeric" {...field} value={field.value ?? ''} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
            </FormSection>

            <FormSection number={3} title="Statut & notes" storageKey="vehicule:statut">
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                <FormField
                  control={form.control}
                  name="statut"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Statut</FormLabel>
                      <Select value={field.value} onValueChange={field.onChange}>
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue>
                              {(v) =>
                                LIBELLES_STATUT_VEHICULE[
                                  v as keyof typeof LIBELLES_STATUT_VEHICULE
                                ] ?? 'Statut'
                              }
                            </SelectValue>
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {STATUTS_VEHICULE.map((s) => (
                            <SelectItem key={s} value={s}>
                              {LIBELLES_STATUT_VEHICULE[s]}
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
                  name="dateSortieParc"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Date de sortie du parc</FormLabel>
                      <FormControl>
                        <Input type="date" {...field} value={field.value ?? ''} />
                      </FormControl>
                      <FormDescription>Requise si vendu / réformé / volé.</FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="conducteurPrincipalId"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Conducteur principal</FormLabel>
                      <Select
                        value={field.value ?? CONDUCTEUR_NONE}
                        onValueChange={(v) => field.onChange(v === CONDUCTEUR_NONE ? null : v)}
                      >
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue>
                              {(v) => {
                                if (!v || v === CONDUCTEUR_NONE) return '—';
                                return employes.find((e) => e.id === v)?.nom ?? '—';
                              }}
                            </SelectValue>
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value={CONDUCTEUR_NONE}>—</SelectItem>
                          {employes.map((e) => (
                            <SelectItem key={e.id} value={e.id}>
                              {e.nom}
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
                name="notes"
                render={({ field }) => (
                  <FormItem className="mt-4">
                    <FormLabel>Notes</FormLabel>
                    <FormControl>
                      <Textarea rows={3} {...field} value={field.value ?? ''} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </FormSection>
          </div>

          {/* Zone D — rail contextuel */}
          <aside className="w-full space-y-5 lg:sticky lg:top-32 lg:w-96 lg:shrink-0 lg:self-start">
            {railTop}
            {railBottom}
          </aside>
        </div>
      </form>
    </Form>
  );
}
