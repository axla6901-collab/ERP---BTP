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
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { typedZodResolver } from '@/lib/forms/zod-resolver';
import { useGuardedRouter, useUnsavedChangesGuard } from '@/lib/hooks/navigation-guard';
import {
  articleSchema,
  ARTICLE_TYPES,
  LIBELLES_ARTICLE_TYPE,
  type ArticleInput,
} from '@/lib/validation/catalogue';

type ServerActionResult = {
  ok: boolean;
  error?: string;
  fieldErrors?: Record<string, string[]>;
  data?: { id: string } | void;
};

type FamilleOption = { id: string; code: string; libelle: string };
type UniteOption = { id: string; code: string; libelle: string; symbole: string };

type Props = {
  defaultValues?: Partial<ArticleInput>;
  familles: FamilleOption[];
  unites: UniteOption[];
  onSubmit: (values: ArticleInput) => Promise<ServerActionResult>;
  successRedirect: string;
  /** Titre affiché à gauche de la barre d'actions sticky. */
  titre: string;
  /** Actions secondaires rendues dans la barre (ex. lien « Historique des prix »). */
  actions?: React.ReactNode;
};

function renderFamille(value: string | null | undefined, list: FamilleOption[]): string {
  if (!value) return 'Choisir une famille';
  const found = list.find((x) => x.id === value);
  return found ? `${found.code} — ${found.libelle}` : String(value);
}

function renderUnite(value: string | null | undefined, list: UniteOption[]): string {
  if (!value) return 'Choisir une unité';
  const found = list.find((x) => x.id === value);
  return found ? `${found.code} (${found.symbole})` : String(value);
}

export function ArticleForm({
  defaultValues,
  familles,
  unites,
  onSubmit,
  successRedirect,
  titre,
  actions,
}: Props) {
  const router = useRouter();
  const guardedRouter = useGuardedRouter();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);

  const form = useForm<ArticleInput>({
    resolver: typedZodResolver(articleSchema),
    defaultValues: {
      code: defaultValues?.code ?? '',
      libelle: defaultValues?.libelle ?? '',
      familleId: defaultValues?.familleId ?? '',
      type: defaultValues?.type ?? 'simple',
      uniteAchatId: defaultValues?.uniteAchatId ?? null,
      uniteStockId: defaultValues?.uniteStockId ?? null,
      uniteVenteId: defaultValues?.uniteVenteId ?? null,
      densite: defaultValues?.densite ?? null,
      epaisseur: defaultValues?.epaisseur ?? null,
      longueurStd: defaultValues?.longueurStd ?? null,
      largeurStd: defaultValues?.largeurStd ?? null,
      description: defaultValues?.description ?? '',
      actif: defaultValues?.actif ?? true,
    },
  });
  useUnsavedChangesGuard({ isDirty: form.formState.isDirty });

  async function handleSubmit(values: ArticleInput) {
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
    toast.success('Article enregistré');
    router.push(successRedirect);
    router.refresh();
  }

  return (
    <Form {...form}>
      {/* Barre d'actions figée réutilisable (PageToolbar) : titre à gauche,
          actions à droite. Le bouton Enregistrer est associé au <form> via
          l'attribut `form` bien qu'il soit rendu hors de lui. */}
      <PageToolbar
        title={titre}
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
            <Button type="submit" form="article-form" size="sm" disabled={isSubmitting}>
              {isSubmitting ? 'Enregistrement…' : 'Enregistrer'}
            </Button>
          </>
        }
      />

      <form
        id="article-form"
        method="post"
        onSubmit={form.handleSubmit(handleSubmit)}
        className="max-w-5xl space-y-4"
      >
        {erreur && (
          <Alert variant="destructive">
            <AlertTitle>Erreur</AlertTitle>
            <AlertDescription>{erreur}</AlertDescription>
          </Alert>
        )}
        {/* Sections agencées en grille : 1 & 2 sur la 1re ligne, 3 & 4 sur la
            2e. `items-start` pour que chaque cadre garde sa hauteur naturelle. */}
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2 lg:items-start">
          <FormSection number={1} title="Identification" storageKey="article:identification">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <FormField
                control={form.control}
                name="code"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Code</FormLabel>
                    <FormControl>
                      <Input placeholder="ART001" maxLength={32} {...field} />
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
                          <SelectValue placeholder="Type">
                            {(value) =>
                              LIBELLES_ARTICLE_TYPE[value as keyof typeof LIBELLES_ARTICLE_TYPE] ??
                              'Type'
                            }
                          </SelectValue>
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {ARTICLE_TYPES.map((t) => (
                          <SelectItem key={t} value={t}>
                            {LIBELLES_ARTICLE_TYPE[t]}
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
              name="libelle"
              render={({ field }) => (
                <FormItem className="mt-4">
                  <FormLabel>Libellé</FormLabel>
                  <FormControl>
                    <Input maxLength={200} {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="familleId"
              render={({ field }) => (
                <FormItem className="mt-4">
                  <FormLabel>Famille</FormLabel>
                  <Select value={field.value} onValueChange={field.onChange}>
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder="Choisir une famille">
                          {(value) => renderFamille(value as string, familles)}
                        </SelectValue>
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {familles.map((f) => (
                        <SelectItem key={f.id} value={f.id}>
                          {f.code} — {f.libelle}
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
                <FormItem className="mt-4 flex items-center gap-3">
                  <FormControl>
                    <Switch checked={field.value} onCheckedChange={field.onChange} />
                  </FormControl>
                  <FormLabel className="!mt-0">Actif</FormLabel>
                </FormItem>
              )}
            />
          </FormSection>
          <FormSection
            number={2}
            title="Unités (achat / stock / vente)"
            storageKey="article:unites"
          >
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              <FormField
                control={form.control}
                name="uniteAchatId"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Achat</FormLabel>
                    <Select
                      value={field.value ?? '__none__'}
                      onValueChange={(v) => field.onChange(v === '__none__' ? null : v)}
                    >
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="—">
                            {(value) => {
                              if (!value || value === '__none__') return '—';
                              return renderUnite(value as string, unites);
                            }}
                          </SelectValue>
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="__none__">Aucune</SelectItem>
                        {unites.map((u) => (
                          <SelectItem key={u.id} value={u.id}>
                            {u.code} ({u.symbole})
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
                name="uniteStockId"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Stock</FormLabel>
                    <Select
                      value={field.value ?? '__none__'}
                      onValueChange={(v) => field.onChange(v === '__none__' ? null : v)}
                    >
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="—">
                            {(value) => {
                              if (!value || value === '__none__') return '—';
                              return renderUnite(value as string, unites);
                            }}
                          </SelectValue>
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="__none__">Aucune</SelectItem>
                        {unites.map((u) => (
                          <SelectItem key={u.id} value={u.id}>
                            {u.code} ({u.symbole})
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
                name="uniteVenteId"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Vente</FormLabel>
                    <Select
                      value={field.value ?? '__none__'}
                      onValueChange={(v) => field.onChange(v === '__none__' ? null : v)}
                    >
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="—">
                            {(value) => {
                              if (!value || value === '__none__') return '—';
                              return renderUnite(value as string, unites);
                            }}
                          </SelectValue>
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="__none__">Aucune</SelectItem>
                        {unites.map((u) => (
                          <SelectItem key={u.id} value={u.id}>
                            {u.code} ({u.symbole})
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

          <FormSection
            number={3}
            title="Caractéristiques physiques"
            description="Optionnel — utile pour conversion cross-type."
            storageKey="article:caracteristiques"
          >
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <FormField
                control={form.control}
                name="densite"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Densité</FormLabel>
                    <FormControl>
                      <Input
                        inputMode="decimal"
                        placeholder="ex: 7.85 (acier)"
                        {...field}
                        value={field.value ?? ''}
                      />
                    </FormControl>
                    <FormDescription>kg/m³ ou kg/m² selon le matériau.</FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="epaisseur"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Épaisseur (mm)</FormLabel>
                    <FormControl>
                      <Input inputMode="decimal" {...field} value={field.value ?? ''} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="longueurStd"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Longueur standard (m)</FormLabel>
                    <FormControl>
                      <Input inputMode="decimal" {...field} value={field.value ?? ''} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="largeurStd"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Largeur standard (m)</FormLabel>
                    <FormControl>
                      <Input inputMode="decimal" {...field} value={field.value ?? ''} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
          </FormSection>

          <FormSection number={4} title="Description" storageKey="article:description">
            <FormField
              control={form.control}
              name="description"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Description (optionnel)</FormLabel>
                  <FormControl>
                    <Textarea rows={3} {...field} value={field.value ?? ''} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </FormSection>
        </div>
      </form>
    </Form>
  );
}
