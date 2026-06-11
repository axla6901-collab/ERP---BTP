'use client';

import { Trash2Icon } from 'lucide-react';
import { useRouter } from 'next/navigation';

import { useUnsavedChangesGuard } from '@/lib/hooks/navigation-guard';
import { useState } from 'react';
import { useFieldArray, useForm } from 'react-hook-form';
import { toast } from 'sonner';

import { typedZodResolver } from '@/lib/forms/zod-resolver';

import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Textarea } from '@/components/ui/textarea';
import { grilleTarifaireSchema, type GrilleTarifaireInput } from '@/lib/validation/catalogue';

type ServerActionResult = {
  ok: boolean;
  error?: string;
  fieldErrors?: Record<string, string[]>;
  data?: { id: string } | void;
};

type ArticleOption = {
  id: string;
  code: string;
  libelle: string;
  uniteVenteId: string | null;
  uniteVenteSymbole: string | null;
};

type UniteOption = { id: string; code: string; symbole: string };

type ChantierOption = { id: string; numero: string; libelle: string };

type Props = {
  defaultValues?: Partial<GrilleTarifaireInput>;
  articlesDisponibles: ArticleOption[];
  unites: UniteOption[];
  chantiers: ChantierOption[];
  /**
   * Si défini, le sélecteur de chantier est verrouillé sur cette valeur
   * (ex. depuis la fiche d'un chantier on ne peut pas changer la cible).
   */
  chantierFige?: ChantierOption | null;
  onSubmit: (values: GrilleTarifaireInput) => Promise<ServerActionResult>;
  successRedirect: string;
};

const SENTINEL_GENERALE = '__generale__';

const ligneVide = (): GrilleTarifaireInput['lignes'][number] => ({
  articleId: '',
  prixUnitaireHt: '0.00',
  uniteId: '',
  referenceFournisseur: null,
  quantiteMin: null,
  notes: null,
});

export function GrilleTarifaireEditor({
  defaultValues,
  articlesDisponibles,
  unites,
  chantiers,
  chantierFige,
  onSubmit,
  successRedirect,
}: Props) {
  const router = useRouter();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);

  const form = useForm<GrilleTarifaireInput>({
    resolver: typedZodResolver(grilleTarifaireSchema),
    defaultValues: {
      libelle: defaultValues?.libelle ?? '',
      chantierId: chantierFige?.id ?? defaultValues?.chantierId ?? null,
      validFrom: defaultValues?.validFrom ?? new Date().toISOString().slice(0, 10),
      validTo: defaultValues?.validTo ?? null,
      actif: defaultValues?.actif ?? true,
      notes: defaultValues?.notes ?? null,
      lignes:
        defaultValues?.lignes && defaultValues.lignes.length > 0
          ? defaultValues.lignes
          : [ligneVide()],
    },
  });
  useUnsavedChangesGuard({ isDirty: form.formState.isDirty });

  const { fields, append, remove } = useFieldArray({
    control: form.control,
    name: 'lignes',
  });

  async function handleSubmit(values: GrilleTarifaireInput) {
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
    toast.success('Grille enregistrée');
    router.push(successRedirect);
    router.refresh();
  }

  return (
    <form method="post" onSubmit={form.handleSubmit(handleSubmit)} className="space-y-6">
      {erreur && (
        <Alert variant="destructive">
          <AlertTitle>Erreur</AlertTitle>
          <AlertDescription>{erreur}</AlertDescription>
        </Alert>
      )}

      {/* En-tête de la grille */}
      <div className="grid gap-4 rounded-md border bg-card p-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="lg:col-span-2">
          <label className="text-sm font-medium" htmlFor="libelle">
            Libellé *
          </label>
          <Input
            id="libelle"
            maxLength={200}
            placeholder="Tarif 2026"
            {...form.register('libelle')}
          />
          {form.formState.errors.libelle && (
            <p className="mt-1 text-xs text-destructive">{form.formState.errors.libelle.message}</p>
          )}
        </div>
        <div className="lg:col-span-2">
          <label className="text-sm font-medium" htmlFor="chantierId">
            Chantier rattaché
          </label>
          {chantierFige ? (
            <div className="rounded-md border bg-muted/40 px-3 py-2 text-sm">
              <span className="font-mono text-xs text-muted-foreground">{chantierFige.numero}</span>{' '}
              {chantierFige.libelle}
            </div>
          ) : (
            <Select
              value={form.watch('chantierId') ?? SENTINEL_GENERALE}
              onValueChange={(v) =>
                form.setValue('chantierId', v === SENTINEL_GENERALE ? null : v, {
                  shouldDirty: true,
                })
              }
            >
              <SelectTrigger id="chantierId">
                <SelectValue>
                  {(value) => {
                    if (!value || value === SENTINEL_GENERALE) {
                      return 'Grille générale (aucun chantier)';
                    }
                    const c = chantiers.find((x) => x.id === value);
                    return c ? `${c.numero} — ${c.libelle}` : String(value);
                  }}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={SENTINEL_GENERALE}>Grille générale (aucun chantier)</SelectItem>
                {chantiers.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.numero} — {c.libelle}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
          <p className="mt-1 text-xs text-muted-foreground">
            Si rattachée à un chantier, cette grille devient prioritaire pour le calcul du prix de
            revient sur ce chantier.
          </p>
        </div>
        <div>
          <label className="text-sm font-medium" htmlFor="validFrom">
            Valide à partir du *
          </label>
          <Input id="validFrom" type="date" {...form.register('validFrom')} />
          {form.formState.errors.validFrom && (
            <p className="mt-1 text-xs text-destructive">
              {form.formState.errors.validFrom.message}
            </p>
          )}
        </div>
        <div>
          <label className="text-sm font-medium" htmlFor="validTo">
            Valide jusqu&apos;au
          </label>
          <Input
            id="validTo"
            type="date"
            {...form.register('validTo')}
            defaultValue={form.getValues('validTo') ?? ''}
          />
          {form.formState.errors.validTo && (
            <p className="mt-1 text-xs text-destructive">{form.formState.errors.validTo.message}</p>
          )}
        </div>
        <div className="flex items-center gap-3 sm:col-span-2">
          <Switch
            id="actif"
            checked={form.watch('actif')}
            onCheckedChange={(v) => form.setValue('actif', v)}
          />
          <label htmlFor="actif" className="text-sm">
            Grille active (utilisée par le calcul de prix courant)
          </label>
        </div>
        <div className="sm:col-span-2 lg:col-span-4">
          <label className="text-sm font-medium" htmlFor="notes">
            Notes
          </label>
          <Textarea
            id="notes"
            rows={2}
            maxLength={2000}
            {...form.register('notes')}
            defaultValue={form.getValues('notes') ?? ''}
          />
        </div>
      </div>

      {/* Tableau des lignes */}
      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-[35%]">Article</TableHead>
              <TableHead className="w-[12%]">Prix HT *</TableHead>
              <TableHead className="w-[10%]">Unité *</TableHead>
              <TableHead className="w-[15%]">Réf. fournisseur</TableHead>
              <TableHead className="w-[10%]">Qté min.</TableHead>
              <TableHead className="w-[15%]">Notes</TableHead>
              <TableHead className="w-[3%]" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {fields.map((field, idx) => {
              const articleId = form.watch(`lignes.${idx}.articleId`);
              const article = articlesDisponibles.find((a) => a.id === articleId);
              const ligneErr = form.formState.errors.lignes?.[idx];

              return (
                <TableRow key={field.id}>
                  <TableCell>
                    <Select
                      value={articleId}
                      onValueChange={(v) => {
                        if (!v) return;
                        form.setValue(`lignes.${idx}.articleId`, v);
                        // Pré-remplir l'unité avec l'unité de vente de l'article
                        const a = articlesDisponibles.find((x) => x.id === v);
                        if (a?.uniteVenteId) {
                          form.setValue(`lignes.${idx}.uniteId`, a.uniteVenteId);
                        }
                      }}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Choisir un article">
                          {(value) => {
                            if (!value) return 'Choisir un article';
                            const a = articlesDisponibles.find((x) => x.id === value);
                            return a ? `${a.code} — ${a.libelle}` : String(value);
                          }}
                        </SelectValue>
                      </SelectTrigger>
                      <SelectContent>
                        {articlesDisponibles.map((a) => (
                          <SelectItem key={a.id} value={a.id}>
                            {a.code} — {a.libelle}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {ligneErr?.articleId && (
                      <p className="mt-1 text-xs text-destructive">{ligneErr.articleId.message}</p>
                    )}
                  </TableCell>
                  <TableCell>
                    <Input
                      inputMode="decimal"
                      placeholder="0.00"
                      {...form.register(`lignes.${idx}.prixUnitaireHt`)}
                      defaultValue={field.prixUnitaireHt}
                    />
                  </TableCell>
                  <TableCell>
                    <Select
                      value={form.watch(`lignes.${idx}.uniteId`)}
                      onValueChange={(v) => v && form.setValue(`lignes.${idx}.uniteId`, v)}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Unité">
                          {(value) => {
                            if (!value) return 'Unité';
                            const u = unites.find((x) => x.id === value);
                            return u ? u.symbole : String(value);
                          }}
                        </SelectValue>
                      </SelectTrigger>
                      <SelectContent>
                        {unites.map((u) => (
                          <SelectItem key={u.id} value={u.id}>
                            {u.code} ({u.symbole})
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {article?.uniteVenteSymbole && (
                      <p className="mt-1 text-xs text-muted-foreground">
                        Vente&nbsp;: {article.uniteVenteSymbole}
                      </p>
                    )}
                  </TableCell>
                  <TableCell>
                    <Input
                      placeholder="—"
                      maxLength={100}
                      {...form.register(`lignes.${idx}.referenceFournisseur`)}
                      defaultValue={field.referenceFournisseur ?? ''}
                    />
                  </TableCell>
                  <TableCell>
                    <Input
                      inputMode="decimal"
                      placeholder="—"
                      {...form.register(`lignes.${idx}.quantiteMin`)}
                      defaultValue={field.quantiteMin ?? ''}
                    />
                  </TableCell>
                  <TableCell>
                    <Input
                      placeholder="—"
                      maxLength={500}
                      {...form.register(`lignes.${idx}.notes`)}
                      defaultValue={field.notes ?? ''}
                    />
                  </TableCell>
                  <TableCell>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-sm"
                      onClick={() => remove(idx)}
                      disabled={fields.length <= 1}
                      aria-label="Supprimer la ligne"
                    >
                      <Trash2Icon />
                    </Button>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>

      <div className="flex items-center justify-between">
        <Button type="button" variant="outline" onClick={() => append(ligneVide())}>
          + Ajouter une ligne
        </Button>
        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting ? 'Enregistrement…' : 'Enregistrer la grille'}
        </Button>
      </div>

      <p className="text-xs text-muted-foreground">
        Le calcul du prix de revient utilise en priorité la grille active du fournisseur préféré de
        chaque article, puis retombe sur les prix d&apos;article ad-hoc et les prix de référence du
        catalogue.
      </p>
    </form>
  );
}
