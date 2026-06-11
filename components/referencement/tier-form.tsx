'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';

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
import { typedZodResolver } from '@/lib/forms/zod-resolver';
import { useGuardedRouter, useUnsavedChangesGuard } from '@/lib/hooks/navigation-guard';
import {
  LIBELLES_NATURE_TIERS,
  NATURES_TIERS,
  tierSchema,
  type TierInput,
} from '@/lib/validation/referencement-tiers';

type ServerActionResult = {
  ok: boolean;
  error?: string;
  fieldErrors?: Record<string, string[]>;
  data?: { id: string } | void;
};

type Option = { id: string; libelle: string };

type Props = {
  defaultValues?: Partial<TierInput>;
  corpsEtatOptions: Option[];
  societeOptions: Option[];
  onSubmit: (values: TierInput) => Promise<ServerActionResult>;
  successRedirect: string;
  titre: string;
};

export function TierForm({
  defaultValues,
  corpsEtatOptions,
  societeOptions,
  onSubmit,
  successRedirect,
  titre,
}: Props) {
  const router = useRouter();
  const guardedRouter = useGuardedRouter();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);

  const form = useForm<TierInput>({
    resolver: typedZodResolver(tierSchema),
    defaultValues: {
      code: defaultValues?.code ?? '',
      nom: defaultValues?.nom ?? '',
      natureTiers: defaultValues?.natureTiers ?? 'artisan',
      nomGerant: defaultValues?.nomGerant ?? '',
      telPortableGerant: defaultValues?.telPortableGerant ?? '',
      siret: defaultValues?.siret ?? '',
      nTvaIntra: defaultValues?.nTvaIntra ?? '',
      email: defaultValues?.email ?? '',
      telephone: defaultValues?.telephone ?? '',
      adresseLigne1: defaultValues?.adresseLigne1 ?? '',
      adresseLigne2: defaultValues?.adresseLigne2 ?? '',
      codePostal: defaultValues?.codePostal ?? '',
      ville: defaultValues?.ville ?? '',
      pays: defaultValues?.pays ?? 'France',
      corpsEtatIds: defaultValues?.corpsEtatIds ?? [],
      societeIds: defaultValues?.societeIds ?? [],
      cdtResponsableId: defaultValues?.cdtResponsableId ?? null,
      managerCdtId: defaultValues?.managerCdtId ?? null,
      actif: defaultValues?.actif ?? true,
    },
  });
  useUnsavedChangesGuard({ isDirty: form.formState.isDirty });

  const corpsSelection = form.watch('corpsEtatIds') ?? [];
  const societeSelection = form.watch('societeIds') ?? [];

  function toggleDansChamp(champ: 'corpsEtatIds' | 'societeIds', id: string) {
    const actuelles = form.getValues(champ) ?? [];
    const next = actuelles.includes(id) ? actuelles.filter((x) => x !== id) : [...actuelles, id];
    form.setValue(champ, next, { shouldDirty: true });
  }

  async function handleSubmit(values: TierInput) {
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
    toast.success('Tier enregistré');
    router.push(successRedirect);
    router.refresh();
  }

  return (
    <Form {...form}>
      <div className="sticky top-0 z-10 -mx-4 mb-6 flex flex-wrap items-center justify-between gap-3 border-b bg-card px-4 py-3 lg:-mx-8 lg:px-8">
        <h2 className="text-xl font-medium">{titre}</h2>
        <div className="flex shrink-0 flex-wrap items-center gap-2">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => guardedRouter.back()}
            disabled={isSubmitting}
          >
            Annuler
          </Button>
          <Button type="submit" form="tier-form" size="sm" disabled={isSubmitting}>
            {isSubmitting ? 'Enregistrement…' : 'Enregistrer'}
          </Button>
        </div>
      </div>

      <form
        id="tier-form"
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

        <FormSection number={1} title="Identification" storageKey="tier:identification">
          <div className="space-y-4">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
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
                name="natureTiers"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Nature</FormLabel>
                    <Select value={field.value} onValueChange={field.onChange}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue>
                            {(value) =>
                              LIBELLES_NATURE_TIERS[value as keyof typeof LIBELLES_NATURE_TIERS] ??
                              ''
                            }
                          </SelectValue>
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {NATURES_TIERS.map((v) => (
                          <SelectItem key={v} value={v}>
                            {LIBELLES_NATURE_TIERS[v]}
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
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <FormField
                control={form.control}
                name="nomGerant"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Nom du gérant</FormLabel>
                    <FormControl>
                      <Input maxLength={200} {...field} value={field.value ?? ''} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="telPortableGerant"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Portable du gérant</FormLabel>
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

        <FormSection number={2} title="Coordonnées" storageKey="tier:coordonnees">
          <div className="space-y-4">
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
                    <FormDescription>Le SIREN affiché = 9 premiers chiffres.</FormDescription>
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
                name="email"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Email</FormLabel>
                    <FormControl>
                      <Input type="email" {...field} value={field.value ?? ''} />
                    </FormControl>
                    <FormDescription>Destinataire des relances.</FormDescription>
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
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <FormField
                control={form.control}
                name="adresseLigne1"
                render={({ field }) => (
                  <FormItem className="sm:col-span-2">
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
                  <FormItem>
                    <FormLabel>Ville</FormLabel>
                    <FormControl>
                      <Input maxLength={100} {...field} value={field.value ?? ''} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
          </div>
        </FormSection>

        <FormSection
          number={3}
          title="Activités (corps d'état)"
          description="Détermine les documents administratifs requis pour ce tier."
          storageKey="tier:corps-etat"
        >
          {corpsEtatOptions.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Aucun corps d&apos;état dans le référentiel. Activez le module pour pré-remplir le
              référentiel par défaut.
            </p>
          ) : (
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              {corpsEtatOptions.map((c) => (
                <label
                  key={c.id}
                  className="flex cursor-pointer items-center gap-2 rounded-md border px-3 py-2 text-sm"
                >
                  <input
                    type="checkbox"
                    className="size-4 accent-amber-600"
                    checked={corpsSelection.includes(c.id)}
                    onChange={() => toggleDansChamp('corpsEtatIds', c.id)}
                  />
                  {c.libelle}
                </label>
              ))}
            </div>
          )}
        </FormSection>

        {societeOptions.length > 0 && (
          <FormSection
            number={4}
            title="Sociétés autorisées"
            description="Cloisonnement : sociétés du groupe pouvant engager ce tier."
            storageKey="tier:societes"
            defaultOpen={false}
          >
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              {societeOptions.map((s) => (
                <label
                  key={s.id}
                  className="flex cursor-pointer items-center gap-2 rounded-md border px-3 py-2 text-sm"
                >
                  <input
                    type="checkbox"
                    className="size-4 accent-amber-600"
                    checked={societeSelection.includes(s.id)}
                    onChange={() => toggleDansChamp('societeIds', s.id)}
                  />
                  {s.libelle}
                </label>
              ))}
            </div>
          </FormSection>
        )}
      </form>
    </Form>
  );
}
