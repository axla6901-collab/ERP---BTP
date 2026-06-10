'use client';

import { useRouter } from 'next/navigation';

import { useGuardedRouter, useUnsavedChangesGuard } from "@/lib/hooks/navigation-guard";
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
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { typedZodResolver } from '@/lib/forms/zod-resolver';
import {
  roleCreateSchema,
  roleUpdateSchema,
  type RoleCreateInput,
  type RoleUpdateInput,
} from '@/lib/validation/admin';

type ServerActionResult = {
  ok: boolean;
  error?: string;
  fieldErrors?: Record<string, string[]>;
  data?: { id: string } | void;
};

type CreateProps = {
  mode: 'create';
  onSubmit: (values: RoleCreateInput) => Promise<ServerActionResult>;
  successRedirect: string;
  defaultValues?: never;
  codeFige?: never;
};

type EditProps = {
  mode: 'edit';
  onSubmit: (values: RoleUpdateInput) => Promise<ServerActionResult>;
  successRedirect: string;
  defaultValues: { code: string; libelle: string; description: string | null; actif: boolean };
  /** Si true, le rôle est système : le code est figé (non éditable) mais le libellé/description/actif restent modifiables. */
  codeFige?: boolean;
};

type Props = CreateProps | EditProps;

export function RoleForm(props: Props) {
  const router = useRouter();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);

  if (props.mode === 'create') {
    return (
      <RoleFormCreate
        onSubmit={props.onSubmit}
        successRedirect={props.successRedirect}
        router={router}
        isSubmitting={isSubmitting}
        setIsSubmitting={setIsSubmitting}
        erreur={erreur}
        setErreur={setErreur}
      />
    );
  }
  return (
    <RoleFormEdit
      onSubmit={props.onSubmit}
      successRedirect={props.successRedirect}
      defaultValues={props.defaultValues}
      router={router}
      isSubmitting={isSubmitting}
      setIsSubmitting={setIsSubmitting}
      erreur={erreur}
      setErreur={setErreur}
    />
  );
}

type CommonProps = {
  router: ReturnType<typeof useRouter>;
  isSubmitting: boolean;
  setIsSubmitting: (v: boolean) => void;
  erreur: string | null;
  setErreur: (v: string | null) => void;
  successRedirect: string;
};

function RoleFormCreate({
  onSubmit,
  router,
  isSubmitting,
  setIsSubmitting,
  erreur,
  setErreur,
  successRedirect,
}: CommonProps & { onSubmit: CreateProps['onSubmit'] }) {
  const guardedRouter = useGuardedRouter();
  const form = useForm<RoleCreateInput>({
    resolver: typedZodResolver(roleCreateSchema),
    defaultValues: {
      code: '',
      libelle: '',
      description: null,
      actif: true,
    },
  });
  useUnsavedChangesGuard({ isDirty: form.formState.isDirty });

  async function handleSubmit(values: RoleCreateInput) {
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
    toast.success('Rôle créé');
    router.push(successRedirect);
    router.refresh();
  }

  return (
    <Form {...form}>
      <form
        method="post"
        onSubmit={form.handleSubmit(handleSubmit)}
        className="grid max-w-xl gap-4"
      >
        {erreur && (
          <Alert variant="destructive">
            <AlertTitle>Erreur</AlertTitle>
            <AlertDescription>{erreur}</AlertDescription>
          </Alert>
        )}
        <FormSection number={1} title="Identification" storageKey="role:identification">
          <div className="grid gap-4">
            <FormField
              control={form.control}
              name="code"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Code</FormLabel>
                  <FormControl>
                    <Input
                      maxLength={48}
                      placeholder="responsable_qualite"
                      autoComplete="off"
                      {...field}
                    />
                  </FormControl>
                  <FormDescription>
                    Identifiant stable, en minuscules avec underscores. Non modifiable après création.
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="libelle"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Libellé</FormLabel>
                  <FormControl>
                    <Input maxLength={80} placeholder="Responsable Qualité" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="description"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Description</FormLabel>
                  <FormControl>
                    <Textarea
                      maxLength={500}
                      rows={3}
                      placeholder="Périmètre du rôle, missions principales…"
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
          </div>
        </FormSection>
        <FormSection number={2} title="Permissions" storageKey="role:permissions">
          <FormField
            control={form.control}
            name="actif"
            render={({ field }) => (
              <FormItem className="flex items-center gap-3">
                <FormControl>
                  <Switch checked={field.value} onCheckedChange={field.onChange} />
                </FormControl>
                <FormLabel className="!mt-0">Actif</FormLabel>
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
            {isSubmitting ? 'Enregistrement…' : 'Créer le rôle'}
          </Button>
        </div>
      </form>
    </Form>
  );
}

function RoleFormEdit({
  onSubmit,
  defaultValues,
  router,
  isSubmitting,
  setIsSubmitting,
  erreur,
  setErreur,
  successRedirect,
}: CommonProps & {
  onSubmit: EditProps['onSubmit'];
  defaultValues: EditProps['defaultValues'];
}) {
  const guardedRouter = useGuardedRouter();
  const form = useForm<RoleUpdateInput>({
    resolver: typedZodResolver(roleUpdateSchema),
    defaultValues: {
      libelle: defaultValues.libelle,
      description: defaultValues.description,
      actif: defaultValues.actif,
    },
  });
  useUnsavedChangesGuard({ isDirty: form.formState.isDirty });

  async function handleSubmit(values: RoleUpdateInput) {
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
    toast.success('Rôle enregistré');
    router.push(successRedirect);
    router.refresh();
  }

  return (
    <Form {...form}>
      <form
        method="post"
        onSubmit={form.handleSubmit(handleSubmit)}
        className="grid max-w-xl gap-4"
      >
        {erreur && (
          <Alert variant="destructive">
            <AlertTitle>Erreur</AlertTitle>
            <AlertDescription>{erreur}</AlertDescription>
          </Alert>
        )}
        <FormSection number={1} title="Identification" storageKey="role:identification">
          <div className="grid gap-4">
            <div className="grid gap-2">
              <FormLabel>Code</FormLabel>
              <Input value={defaultValues.code} readOnly disabled className="font-mono" />
              <FormDescription>Le code n&apos;est pas modifiable après création.</FormDescription>
            </div>
            <FormField
              control={form.control}
              name="libelle"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Libellé</FormLabel>
                  <FormControl>
                    <Input maxLength={80} {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="description"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Description</FormLabel>
                  <FormControl>
                    <Textarea
                      maxLength={500}
                      rows={3}
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
          </div>
        </FormSection>
        <FormSection number={2} title="Permissions" storageKey="role:permissions">
          <FormField
            control={form.control}
            name="actif"
            render={({ field }) => (
              <FormItem className="flex items-center gap-3">
                <FormControl>
                  <Switch checked={field.value} onCheckedChange={field.onChange} />
                </FormControl>
                <FormLabel className="!mt-0">Actif</FormLabel>
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
