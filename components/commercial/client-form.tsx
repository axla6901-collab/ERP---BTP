'use client';

import { useRouter } from 'next/navigation';

import { useGuardedRouter, useUnsavedChangesGuard } from '@/lib/hooks/navigation-guard';
import { useState } from 'react';
import { useForm, type DefaultValues } from 'react-hook-form';
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
import { clientSchema, type ClientInput } from '@/lib/validation/commercial';

type ServerActionResult = {
  ok: boolean;
  error?: string;
  fieldErrors?: Record<string, string[]>;
  data?: { id: string } | void;
};

type Props = {
  defaultValues?: Partial<ClientInput>;
  onSubmit: (values: ClientInput) => Promise<ServerActionResult>;
  successRedirect: string;
};

export function ClientForm({ defaultValues, onSubmit, successRedirect }: Props) {
  const router = useRouter();
  const guardedRouter = useGuardedRouter();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);

  const form = useForm<ClientInput>({
    resolver: typedZodResolver(clientSchema),
    // Le schéma est une union discriminée (particulier | professionnel) ; les
    // defaultValues regroupent tous les champs des deux branches avec des
    // chaînes vides en placeholder. Cast nécessaire car aucune branche ne
    // matche strictement cet état initial — la discrimination se fait via
    // `form.watch('type')`.
    defaultValues: {
      type: defaultValues?.type ?? 'professionnel',
      code: defaultValues?.code ?? '',
      raisonSociale: defaultValues?.raisonSociale ?? '',
      nom: defaultValues?.nom ?? '',
      prenom: defaultValues?.prenom ?? '',
      siret: defaultValues?.siret ?? '',
      tvaIntra: defaultValues?.tvaIntra ?? '',
      email: defaultValues?.email ?? '',
      telephone: defaultValues?.telephone ?? '',
      adresseLigne1: defaultValues?.adresseLigne1 ?? '',
      adresseLigne2: defaultValues?.adresseLigne2 ?? '',
      codePostal: defaultValues?.codePostal ?? '',
      ville: defaultValues?.ville ?? '',
      pays: defaultValues?.pays ?? 'France',
      notes: defaultValues?.notes ?? '',
      actif: defaultValues?.actif ?? true,
    } as DefaultValues<ClientInput>,
  });
  useUnsavedChangesGuard({ isDirty: form.formState.isDirty });

  const type = form.watch('type');

  async function handleSubmit(values: ClientInput) {
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
    toast.success('Client enregistré');
    router.push(successRedirect);
    router.refresh();
  }

  return (
    <Form {...form}>
      <form
        method="post"
        onSubmit={form.handleSubmit(handleSubmit)}
        className="grid max-w-3xl gap-4"
      >
        {erreur && (
          <Alert variant="destructive">
            <AlertTitle>Erreur</AlertTitle>
            <AlertDescription>{erreur}</AlertDescription>
          </Alert>
        )}
        <FormSection number={1} title="Identification" storageKey="client:identification">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <FormField
              control={form.control}
              name="code"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Code</FormLabel>
                  <FormControl>
                    <Input placeholder="CLI001" maxLength={32} {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="type"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Type</FormLabel>
                  <Select value={field.value} onValueChange={field.onChange}>
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue>
                          {(v) => (v === 'particulier' ? 'Particulier' : 'Professionnel')}
                        </SelectValue>
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value="professionnel">Professionnel</SelectItem>
                      <SelectItem value="particulier">Particulier</SelectItem>
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
          </div>

          {type === 'professionnel' ? (
            <div className="mt-4 space-y-4">
              <FormField
                control={form.control}
                name="raisonSociale"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Raison sociale</FormLabel>
                    <FormControl>
                      <Input maxLength={200} {...field} value={field.value ?? ''} />
                    </FormControl>
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
                      <FormLabel>SIRET (optionnel)</FormLabel>
                      <FormControl>
                        <Input
                          maxLength={14}
                          placeholder="14 chiffres"
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
                  name="tvaIntra"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>N° TVA intracom (optionnel)</FormLabel>
                      <FormControl>
                        <Input placeholder="FR12345678901" {...field} value={field.value ?? ''} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
            </div>
          ) : (
            <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
              <FormField
                control={form.control}
                name="nom"
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
                name="prenom"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Prénom (optionnel)</FormLabel>
                    <FormControl>
                      <Input maxLength={100} {...field} value={field.value ?? ''} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
          )}
        </FormSection>

        <FormSection number={2} title="Coordonnées" storageKey="client:coordonnees">
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <FormSubCard title="Contact">
              <FormField
                control={form.control}
                name="email"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Email (optionnel)</FormLabel>
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
                    <FormLabel>Téléphone (optionnel)</FormLabel>
                    <FormControl>
                      <Input {...field} value={field.value ?? ''} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </FormSubCard>

            <FormSubCard title="Adresse">
              <FormField
                control={form.control}
                name="adresseLigne1"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Adresse</FormLabel>
                    <FormControl>
                      <Input maxLength={200} {...field} />
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
                    <FormLabel>Complément (optionnel)</FormLabel>
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
                        <Input maxLength={5} {...field} />
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
                        <Input maxLength={100} {...field} />
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
                  <FormItem>
                    <FormLabel>Pays</FormLabel>
                    <FormControl>
                      <Input maxLength={100} {...field} />
                    </FormControl>
                    <FormDescription>France par défaut.</FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </FormSubCard>
          </div>
        </FormSection>

        <FormSection number={3} title="Notes" storageKey="client:notes">
          <FormField
            control={form.control}
            name="notes"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Notes internes (optionnel)</FormLabel>
                <FormControl>
                  <Textarea rows={3} {...field} value={field.value ?? ''} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </FormSection>

        <div className="flex justify-end gap-2">
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
