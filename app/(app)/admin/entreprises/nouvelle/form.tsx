'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { useForm } from 'react-hook-form';

import { creerEntreprise } from '@/lib/admin/entreprises-super';
import { typedZodResolver } from '@/lib/forms/zod-resolver';
import {
  entrepriseCreateSchema,
  type EntrepriseCreateInput,
} from '@/lib/validation/super-admin';

export function NouvelleEntrepriseForm() {
  const router = useRouter();
  const [serverError, setServerError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
    setError,
  } = useForm<EntrepriseCreateInput>({
    resolver: typedZodResolver(entrepriseCreateSchema),
    defaultValues: {
      slug: '',
      raisonSociale: '',
      siret: null,
      tvaIntracom: null,
      adresseLigne1: null,
      adresseLigne2: null,
      codePostal: null,
      ville: null,
      pays: 'France',
      adminEmail: '',
    },
  });

  async function onSubmit(values: EntrepriseCreateInput) {
    setServerError(null);
    const res = await creerEntreprise(values);
    if (!res.ok) {
      setServerError(res.error);
      if (res.fieldErrors) {
        for (const [field, msgs] of Object.entries(res.fieldErrors)) {
          if (msgs?.[0]) {
            setError(field as keyof EntrepriseCreateInput, { message: msgs[0] });
          }
        }
      }
      return;
    }
    router.push('/admin/entreprises');
    router.refresh();
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
      {serverError && (
        <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          {serverError}
        </div>
      )}

      <fieldset className="space-y-4 rounded-md border bg-card p-4">
        <legend className="px-2 text-sm font-medium">Identité</legend>

        <Field label="Slug (URL)" error={errors.slug?.message} required>
          <input
            {...register('slug')}
            placeholder="acme-construction"
            className="w-full rounded-md border px-3 py-2 font-mono text-sm"
          />
          <p className="text-xs text-muted-foreground">
            Apparaîtra dans l&apos;URL : <code>/{`{slug}`}/dashboard</code>. Minuscules, chiffres et
            tirets uniquement.
          </p>
        </Field>

        <Field label="Raison sociale" error={errors.raisonSociale?.message} required>
          <input
            {...register('raisonSociale')}
            placeholder="ACME Construction SAS"
            className="w-full rounded-md border px-3 py-2 text-sm"
          />
        </Field>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="SIRET (14 chiffres)" error={errors.siret?.message}>
            <input
              {...register('siret')}
              placeholder="12345678901234"
              className="w-full rounded-md border px-3 py-2 font-mono text-sm"
            />
          </Field>
          <Field label="TVA intracom." error={errors.tvaIntracom?.message}>
            <input
              {...register('tvaIntracom')}
              placeholder="FR12345678901"
              className="w-full rounded-md border px-3 py-2 font-mono text-sm uppercase"
            />
          </Field>
        </div>
      </fieldset>

      <fieldset className="space-y-4 rounded-md border bg-card p-4">
        <legend className="px-2 text-sm font-medium">Adresse</legend>

        <Field label="Adresse ligne 1" error={errors.adresseLigne1?.message}>
          <input
            {...register('adresseLigne1')}
            className="w-full rounded-md border px-3 py-2 text-sm"
          />
        </Field>
        <Field label="Adresse ligne 2" error={errors.adresseLigne2?.message}>
          <input
            {...register('adresseLigne2')}
            className="w-full rounded-md border px-3 py-2 text-sm"
          />
        </Field>
        <div className="grid grid-cols-[120px_1fr_1fr] gap-4">
          <Field label="Code postal" error={errors.codePostal?.message}>
            <input
              {...register('codePostal')}
              placeholder="75001"
              className="w-full rounded-md border px-3 py-2 font-mono text-sm"
            />
          </Field>
          <Field label="Ville" error={errors.ville?.message}>
            <input
              {...register('ville')}
              className="w-full rounded-md border px-3 py-2 text-sm"
            />
          </Field>
          <Field label="Pays" error={errors.pays?.message}>
            <input
              {...register('pays')}
              className="w-full rounded-md border px-3 py-2 text-sm"
            />
          </Field>
        </div>
      </fieldset>

      <fieldset className="space-y-4 rounded-md border bg-card p-4">
        <legend className="px-2 text-sm font-medium">Administrateur initial</legend>
        <Field label="Email" error={errors.adminEmail?.message} required>
          <input
            {...register('adminEmail')}
            type="email"
            placeholder="admin@acme.fr"
            className="w-full rounded-md border px-3 py-2 text-sm"
          />
          <p className="text-xs text-muted-foreground">
            Si ce compte n&apos;existe pas, il sera créé. Un magic-link de connexion lui sera envoyé.
          </p>
        </Field>
      </fieldset>

      <div className="flex justify-end gap-2">
        <button
          type="submit"
          disabled={isSubmitting}
          className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
        >
          {isSubmitting ? 'Création…' : 'Créer l\'entreprise'}
        </button>
      </div>
    </form>
  );
}

function Field({
  label,
  required,
  error,
  children,
}: {
  label: string;
  required?: boolean | undefined;
  error?: string | undefined;
  children: React.ReactNode;
}) {
  return (
    <label className="block space-y-1">
      <span className="block text-sm font-medium">
        {label}
        {required && <span className="ml-1 text-red-600">*</span>}
      </span>
      {children}
      {error && <span className="block text-xs text-red-600">{error}</span>}
    </label>
  );
}
