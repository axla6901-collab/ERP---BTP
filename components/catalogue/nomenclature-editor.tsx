'use client';

import { Trash2Icon } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';

import { useUnsavedChangesGuard } from '@/lib/hooks/navigation-guard';
import { useState } from 'react';
import { useFieldArray, useForm } from 'react-hook-form';
import { toast } from 'sonner';

import { typedZodResolver } from '@/lib/forms/zod-resolver';

import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
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
import { nomenclatureSchema, type NomenclatureInput } from '@/lib/validation/catalogue';

type ServerActionResult = {
  ok: boolean;
  error?: string;
  fieldErrors?: Record<string, string[]>;
  data?: { nomenclatureId: string; version: number } | void;
};

type ArticleOption = {
  id: string;
  code: string;
  libelle: string;
  type: 'simple' | 'compose' | 'prestation' | 'operation';
  uniteStockSymbole: string | null;
  /**
   * Prix utilisé comme « prix unitaire » du composant dans le calcul de
   * l'ouvrage parent : prix de référence pour les articles simples /
   * prestations / opérations, prix de revient calculé (bom_cost_roll) pour
   * les articles composés.
   */
  prixComposant: string | null;
  prixComposantUniteSymbole: string | null;
};

type UniteOption = { id: string; code: string; symbole: string };

function toNumber(v: string | null | undefined): number | null {
  if (v == null || v === '') return null;
  const n = Number(String(v).replace(',', '.'));
  return Number.isFinite(n) ? n : null;
}

function formatMontant(n: number | null): string {
  if (n == null) return '—';
  return n.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

type Props = {
  /** Lignes pré-remplies (édition d'une version existante). */
  defaultLignes?: NomenclatureInput['lignes'];
  /** Articles candidats comme composants (excluant l'article parent + ses ascendants). */
  articlesDisponibles: ArticleOption[];
  unites: UniteOption[];
  onSubmit: (values: NomenclatureInput) => Promise<ServerActionResult>;
};

export function NomenclatureEditor({
  defaultLignes = [],
  articlesDisponibles,
  unites,
  onSubmit,
}: Props) {
  const router = useRouter();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);

  const form = useForm<NomenclatureInput>({
    resolver: typedZodResolver(nomenclatureSchema),
    defaultValues: {
      libelle: null,
      lignes:
        defaultLignes.length > 0
          ? defaultLignes
          : [
              {
                composantArticleId: '',
                quantite: '1',
                uniteEmploiId: '',
                coefficientPerte: '0',
                notes: null,
              },
            ],
    },
  });
  useUnsavedChangesGuard({ isDirty: form.formState.isDirty });

  const { fields, append, remove } = useFieldArray({
    control: form.control,
    name: 'lignes',
  });

  async function handleSubmit(values: NomenclatureInput) {
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
    toast.success(`Version ${result.data?.version ?? ''} enregistrée`);
    router.refresh();
  }

  return (
    <form method="post" onSubmit={form.handleSubmit(handleSubmit)} className="space-y-4">
      {erreur && (
        <Alert variant="destructive">
          <AlertTitle>Erreur</AlertTitle>
          <AlertDescription>{erreur}</AlertDescription>
        </Alert>
      )}

      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-[28%]">Composant</TableHead>
              <TableHead className="w-[10%]">Quantité</TableHead>
              <TableHead className="w-[10%]">Unité d&apos;emploi</TableHead>
              <TableHead className="w-[8%]">Perte (%)</TableHead>
              <TableHead className="w-[14%] text-right">Prix unit. (€)</TableHead>
              <TableHead className="w-[12%] text-right">Sous-total (€)</TableHead>
              <TableHead className="w-[15%]">Notes</TableHead>
              <TableHead className="w-[3%]" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {fields.map((field, idx) => {
              const composantId = form.watch(`lignes.${idx}.composantArticleId`);
              const composant = articlesDisponibles.find((a) => a.id === composantId);
              const quantite = toNumber(form.watch(`lignes.${idx}.quantite`));
              const perteRaw = toNumber(form.watch(`lignes.${idx}.coefficientPerte`));
              // Accepter saisie en % (5) ou en décimal (0.05)
              const perte = perteRaw == null ? 0 : perteRaw >= 1 ? perteRaw / 100 : perteRaw;
              const prixUnit = toNumber(composant?.prixComposant ?? null);
              const sousTotal =
                quantite != null && prixUnit != null ? quantite * (1 + perte) * prixUnit : null;
              const estCompose = composant?.type === 'compose';

              return (
                <TableRow key={field.id}>
                  <TableCell>
                    <Select
                      value={form.watch(`lignes.${idx}.composantArticleId`)}
                      onValueChange={(v) => {
                        if (!v) return;
                        form.setValue(`lignes.${idx}.composantArticleId`, v);
                        // Pré-remplir l'unité d'emploi avec l'unité de stock du composant choisi
                        const c = articlesDisponibles.find((a) => a.id === v);
                        if (c?.uniteStockSymbole) {
                          const u = unites.find((u) => u.symbole === c.uniteStockSymbole);
                          if (u) form.setValue(`lignes.${idx}.uniteEmploiId`, u.id);
                        }
                      }}
                    >
                      <SelectTrigger
                        className={estCompose ? 'text-indigo-700 dark:text-indigo-400' : undefined}
                      >
                        <SelectValue placeholder="Choisir un composant">
                          {(value) => {
                            if (!value) return 'Choisir un composant';
                            const a = articlesDisponibles.find((x) => x.id === value);
                            return a ? `${a.code} — ${a.libelle}` : String(value);
                          }}
                        </SelectValue>
                      </SelectTrigger>
                      <SelectContent>
                        {articlesDisponibles.map((a) => (
                          <SelectItem
                            key={a.id}
                            value={a.id}
                            className={
                              a.type === 'compose'
                                ? 'text-indigo-700 dark:text-indigo-400'
                                : undefined
                            }
                          >
                            {a.code} — {a.libelle}
                            {a.type === 'compose' && (
                              <span className="ml-2 text-[10px] uppercase tracking-wide opacity-70">
                                composé
                              </span>
                            )}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {composant && (
                      <p className="mt-1 text-xs text-muted-foreground">
                        Stock&nbsp;: {composant.uniteStockSymbole ?? '?'}
                        {estCompose && (
                          <span className="ml-2 rounded-full bg-indigo-100 px-1.5 py-0.5 text-[10px] font-medium text-indigo-700 dark:bg-indigo-950 dark:text-indigo-300">
                            sous-ouvrage composé
                          </span>
                        )}
                      </p>
                    )}
                  </TableCell>
                  <TableCell>
                    <Input
                      inputMode="decimal"
                      {...form.register(`lignes.${idx}.quantite`)}
                      defaultValue={field.quantite}
                    />
                  </TableCell>
                  <TableCell>
                    <Select
                      value={form.watch(`lignes.${idx}.uniteEmploiId`)}
                      onValueChange={(v) => v && form.setValue(`lignes.${idx}.uniteEmploiId`, v)}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Unité">
                          {(value) => {
                            if (!value) return 'Unité';
                            const u = unites.find((x) => x.id === value);
                            return u ? `${u.symbole}` : String(value);
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
                  </TableCell>
                  <TableCell>
                    <Input
                      inputMode="decimal"
                      placeholder="0"
                      {...form.register(`lignes.${idx}.coefficientPerte`)}
                      defaultValue={field.coefficientPerte}
                    />
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {composant ? (
                      prixUnit != null ? (
                        <span>
                          {formatMontant(prixUnit)}
                          {composant.prixComposantUniteSymbole && (
                            <span className="ml-1 text-xs text-muted-foreground">
                              /{composant.prixComposantUniteSymbole}
                            </span>
                          )}
                          {estCompose && (
                            <span
                              className="ml-1 text-xs text-muted-foreground"
                              title="Prix de revient calculé récursivement via la composition"
                            >
                              (calculé)
                            </span>
                          )}
                        </span>
                      ) : (
                        <Link
                          href={
                            estCompose
                              ? `/catalogue/articles/${composant.id}/composition`
                              : `/catalogue/articles/${composant.id}`
                          }
                          className="text-xs text-destructive underline underline-offset-4"
                          title={
                            estCompose
                              ? 'Composant composé sans prix de revient calculable (composants sans prix). Voir sa composition.'
                              : 'Saisir le prix de référence de ce composant'
                          }
                        >
                          {estCompose ? 'Composition incomplète' : 'Saisir le prix'}
                        </Link>
                      )
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    <span className={sousTotal == null && composant ? 'text-destructive' : ''}>
                      {formatMontant(sousTotal)}
                    </span>
                  </TableCell>
                  <TableCell>
                    <Input
                      placeholder="—"
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
            <TableRow>
              <TableCell colSpan={5} className="text-right text-sm font-medium">
                Total estimé (prix réf. + composition récursive)
              </TableCell>
              <TableCell className="text-right text-base font-semibold tabular-nums">
                {(() => {
                  const total = fields.reduce((acc, _, idx) => {
                    const composantId = form.watch(`lignes.${idx}.composantArticleId`);
                    const composant = articlesDisponibles.find((a) => a.id === composantId);
                    const quantite = toNumber(form.watch(`lignes.${idx}.quantite`));
                    const perteRaw = toNumber(form.watch(`lignes.${idx}.coefficientPerte`));
                    const perte = perteRaw == null ? 0 : perteRaw >= 1 ? perteRaw / 100 : perteRaw;
                    const prixUnit = toNumber(composant?.prixComposant ?? null);
                    if (quantite == null || prixUnit == null) return acc;
                    return acc + quantite * (1 + perte) * prixUnit;
                  }, 0);
                  return `${formatMontant(total)} €`;
                })()}
              </TableCell>
              <TableCell colSpan={2} />
            </TableRow>
          </TableBody>
        </Table>
      </div>

      <div className="flex items-center justify-between">
        <Button
          type="button"
          variant="outline"
          onClick={() =>
            append({
              composantArticleId: '',
              quantite: '1',
              uniteEmploiId: '',
              coefficientPerte: '0',
              notes: null,
            })
          }
        >
          + Ajouter une ligne
        </Button>
        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting ? 'Enregistrement…' : 'Enregistrer comme nouvelle version'}
        </Button>
      </div>

      <p className="text-xs text-muted-foreground">
        Chaque enregistrement crée une nouvelle version immutable. Les anciennes restent
        consultables.
      </p>
    </form>
  );
}
