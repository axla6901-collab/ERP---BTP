'use client';

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
import { useUnsavedChangesGuard } from '@/lib/hooks/navigation-guard';
import { typedZodResolver } from '@/lib/forms/zod-resolver';
import {
  entrepriseIdentiteSchema,
  type EntrepriseIdentiteInput,
} from '@/lib/validation/entreprise';

type Props = {
  defaultValues: EntrepriseIdentiteInput;
  onSubmit: (values: EntrepriseIdentiteInput) => Promise<{
    ok: boolean;
    error?: string;
    fieldErrors?: Record<string, string[]>;
  }>;
};

export function EntrepriseIdentiteForm({ defaultValues, onSubmit }: Props) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);

  const form = useForm<EntrepriseIdentiteInput>({
    resolver: typedZodResolver(entrepriseIdentiteSchema),
    defaultValues,
  });
  useUnsavedChangesGuard({ isDirty: form.formState.isDirty });

  async function handleSubmit(values: EntrepriseIdentiteInput) {
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
    toast.success('Identité enregistrée');
    form.reset(values);
  }

  return (
    <Form {...form}>
      <form
        method="post"
        onSubmit={form.handleSubmit(handleSubmit)}
        className="grid max-w-2xl gap-4"
      >
        {erreur && (
          <Alert variant="destructive">
            <AlertTitle>Erreur</AlertTitle>
            <AlertDescription>{erreur}</AlertDescription>
          </Alert>
        )}

        <FormSection number={1} title="Identification" storageKey="entreprise:identification">
          <FormField
            control={form.control}
            name="raisonSociale"
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
        </FormSection>

        <FormSection number={2} title="Informations légales/fiscales" storageKey="entreprise:legal">
          <div className="grid gap-4 sm:grid-cols-2">
            <FormField
              control={form.control}
              name="siret"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>SIRET</FormLabel>
                  <FormControl>
                    <Input
                      inputMode="numeric"
                      maxLength={14}
                      placeholder="14 chiffres"
                      value={field.value ?? ''}
                      onChange={field.onChange}
                      onBlur={field.onBlur}
                      name={field.name}
                      ref={field.ref}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="tvaIntracom"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>N° TVA intracommunautaire</FormLabel>
                  <FormControl>
                    <Input
                      placeholder="FR12345678901"
                      maxLength={15}
                      value={field.value ?? ''}
                      onChange={(e) => field.onChange(e.target.value.toUpperCase())}
                      onBlur={field.onBlur}
                      name={field.name}
                      ref={field.ref}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>
        </FormSection>

        <FormSection number={3} title="Adresse" storageKey="entreprise:adresse">
          <div className="grid gap-4">
            <FormField
              control={form.control}
              name="adresseLigne1"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Adresse</FormLabel>
                  <FormControl>
                    <Input
                      maxLength={200}
                      value={field.value ?? ''}
                      onChange={field.onChange}
                      onBlur={field.onBlur}
                      name={field.name}
                      ref={field.ref}
                    />
                  </FormControl>
                  <FormDescription>Voie, numéro</FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="adresseLigne2"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Complément d&apos;adresse</FormLabel>
                  <FormControl>
                    <Input
                      maxLength={200}
                      value={field.value ?? ''}
                      onChange={field.onChange}
                      onBlur={field.onBlur}
                      name={field.name}
                      ref={field.ref}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="grid gap-4 sm:grid-cols-[160px_1fr_160px]">
              <FormField
                control={form.control}
                name="codePostal"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Code postal</FormLabel>
                    <FormControl>
                      <Input
                        inputMode="numeric"
                        maxLength={5}
                        value={field.value ?? ''}
                        onChange={field.onChange}
                        onBlur={field.onBlur}
                        name={field.name}
                        ref={field.ref}
                      />
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
                      <Input
                        maxLength={100}
                        value={field.value ?? ''}
                        onChange={field.onChange}
                        onBlur={field.onBlur}
                        name={field.name}
                        ref={field.ref}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="pays"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Pays</FormLabel>
                    <FormControl>
                      <Input maxLength={80} {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
          </div>
        </FormSection>

        <FormSection
          number={4}
          title="Facturation électronique (Factur-X)"
          storageKey="entreprise:facturx"
        >
          <p className="mb-4 text-sm text-muted-foreground">
            Coordonnées bancaires et mentions légales reprises sur les factures électroniques.
            L&apos;IBAN et le SIRET/TVA ci-dessus sont requis pour générer un Factur-X conforme.
          </p>
          <div className="grid gap-4 sm:grid-cols-2">
            <FormField
              control={form.control}
              name="iban"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>IBAN</FormLabel>
                  <FormControl>
                    <Input
                      placeholder="FR76 3000 6000 0112 3456 7890 189"
                      maxLength={42}
                      value={field.value ?? ''}
                      onChange={field.onChange}
                      onBlur={field.onBlur}
                      name={field.name}
                      ref={field.ref}
                    />
                  </FormControl>
                  <FormDescription>Compte de règlement (virement).</FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="bic"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>BIC / SWIFT</FormLabel>
                  <FormControl>
                    <Input
                      placeholder="BNPAFRPP"
                      maxLength={11}
                      value={field.value ?? ''}
                      onChange={field.onChange}
                      onBlur={field.onBlur}
                      name={field.name}
                      ref={field.ref}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="formeJuridique"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Forme juridique</FormLabel>
                  <FormControl>
                    <Input
                      placeholder="SARL, SAS, EI…"
                      maxLength={80}
                      value={field.value ?? ''}
                      onChange={field.onChange}
                      onBlur={field.onBlur}
                      name={field.name}
                      ref={field.ref}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="capitalSocial"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Capital social (€)</FormLabel>
                  <FormControl>
                    <Input
                      inputMode="decimal"
                      placeholder="10000.00"
                      value={field.value ?? ''}
                      onChange={field.onChange}
                      onBlur={field.onBlur}
                      name={field.name}
                      ref={field.ref}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="rcs"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Mention RCS</FormLabel>
                  <FormControl>
                    <Input
                      placeholder="RCS Lyon B 123 456 789"
                      maxLength={100}
                      value={field.value ?? ''}
                      onChange={field.onChange}
                      onBlur={field.onBlur}
                      name={field.name}
                      ref={field.ref}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="codeApe"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Code APE / NAF</FormLabel>
                  <FormControl>
                    <Input
                      placeholder="4399C"
                      maxLength={5}
                      value={field.value ?? ''}
                      onChange={(e) => field.onChange(e.target.value.toUpperCase())}
                      onBlur={field.onBlur}
                      name={field.name}
                      ref={field.ref}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>
        </FormSection>

        <div className="flex justify-end gap-2">
          <Button type="submit" disabled={isSubmitting || !form.formState.isDirty}>
            {isSubmitting ? 'Enregistrement…' : 'Enregistrer'}
          </Button>
        </div>
      </form>
    </Form>
  );
}
