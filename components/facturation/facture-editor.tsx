'use client';

import { Trash2Icon } from 'lucide-react';
import { useRouter } from 'next/navigation';

import { useGuardedRouter, useUnsavedChangesGuard } from '@/lib/hooks/navigation-guard';
import { useMemo, useState } from 'react';
import { useFieldArray, useForm } from 'react-hook-form';
import { toast } from 'sonner';

import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { FormSection, SectionTotal } from '@/components/ui/form-section';
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
import { calculerMontantRetenue, calculerTotauxFacture } from '@/lib/facturation/calculs';
import { appliquerRemiseGlobale, libelleRemiseGlobale } from '@/lib/remise-globale';
import {
  factureSchema,
  type FactureInput,
  type LigneFactureInput,
} from '@/lib/validation/facturation';

type ServerActionResult = {
  ok: boolean;
  error?: string;
  fieldErrors?: Record<string, string[]>;
  data?: { id: string; numero?: string } | void;
};

type ClientOption = { id: string; code: string; libelle: string };
type ChantierOption = { id: string; numero: string; libelle: string };
type DevisOption = { id: string; numero: string; clientId: string };
type ArticleOption = {
  id: string;
  code: string;
  libelle: string;
  uniteVenteSymbole: string | null;
  prixCourant: string | null;
};

type Props = {
  clients: ClientOption[];
  chantiers: ChantierOption[];
  devis: DevisOption[];
  articles: ArticleOption[];
  defaultValues?: Partial<FactureInput>;
  onSubmit: (values: FactureInput) => Promise<ServerActionResult>;
  /** URL de redirection après succès. Si `successRedirectAppendId` est true et
   *  que l'action a renvoyé un id (cas création), `${successRedirect}/${id}`
   *  est utilisée à la place. String-only car les Server Components ne peuvent
   *  pas passer de fonction à un Client Component sans `'use server'`. */
  successRedirect: string;
  successRedirectAppendId?: boolean | undefined;
};

const TAUX_TVA_OPTIONS = [
  { value: '20.00', label: '20 %' },
  { value: '10.00', label: '10 %' },
  { value: '5.50', label: '5,5 %' },
  { value: '2.10', label: '2,1 %' },
  { value: '0.00', label: '0 %' },
];

const TODAY = () => new Date().toISOString().slice(0, 10);
const PLUS_30 = () => {
  const d = new Date();
  d.setDate(d.getDate() + 30);
  return d.toISOString().slice(0, 10);
};

function formatMontant(s: string): string {
  const n = Number(s);
  if (Number.isNaN(n)) return s;
  return n.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function FactureEditor({
  clients,
  chantiers,
  devis,
  articles,
  defaultValues,
  onSubmit,
  successRedirect,
  successRedirectAppendId,
}: Props) {
  const router = useRouter();
  const guardedRouter = useGuardedRouter();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);

  const form = useForm<FactureInput>({
    resolver: typedZodResolver(factureSchema),
    defaultValues: {
      clientId: defaultValues?.clientId ?? '',
      chantierId: defaultValues?.chantierId ?? null,
      devisId: defaultValues?.devisId ?? null,
      dateFacture: defaultValues?.dateFacture ?? TODAY(),
      dateEcheance: defaultValues?.dateEcheance ?? PLUS_30(),
      delaiPaiementJours: defaultValues?.delaiPaiementJours ?? 30,
      objet: defaultValues?.objet ?? '',
      conditionsPaiement: defaultValues?.conditionsPaiement ?? '',
      mentionsLegales: defaultValues?.mentionsLegales ?? '',
      notes: defaultValues?.notes ?? '',
      autoLiquidation: defaultValues?.autoLiquidation ?? false,
      retenueGarantiePct: defaultValues?.retenueGarantiePct ?? null,
      remiseGlobaleType: defaultValues?.remiseGlobaleType ?? null,
      remiseGlobaleValeur: defaultValues?.remiseGlobaleValeur ?? null,
      lignes:
        defaultValues?.lignes && defaultValues.lignes.length > 0
          ? defaultValues.lignes
          : [
              {
                type: 'libre',
                articleId: null,
                designation: '',
                quantite: '1',
                unite: 'u',
                prixUnitaireHt: '0',
                tauxTva: '20.00',
                remisePourcent: '0',
                notes: null,
              } as LigneFactureInput,
            ],
    },
  });
  useUnsavedChangesGuard({ isDirty: form.formState.isDirty });

  const { fields, append, remove, update } = useFieldArray({
    control: form.control,
    name: 'lignes',
  });

  const lignesLive = form.watch('lignes');
  const autoLiq = form.watch('autoLiquidation');
  const retenuePct = form.watch('retenueGarantiePct');
  const remiseGlobaleType = form.watch('remiseGlobaleType') ?? null;
  const remiseGlobaleValeur = form.watch('remiseGlobaleValeur') ?? null;

  const totauxLive = useMemo(
    () =>
      appliquerRemiseGlobale(calculerTotauxFacture(lignesLive, { autoLiquidation: autoLiq }), {
        type: remiseGlobaleType,
        valeur: remiseGlobaleValeur,
      }),
    [lignesLive, autoLiq, remiseGlobaleType, remiseGlobaleValeur],
  );
  const aRemise = Number(totauxLive.remiseGlobaleMontant) > 0;
  const montantRetenueLive = useMemo(
    () => calculerMontantRetenue(totauxLive.totalHt, retenuePct ?? null),
    [totauxLive.totalHt, retenuePct],
  );
  const netAPayer = useMemo(() => {
    if (!montantRetenueLive) return totauxLive.totalTtc;
    return (Number(totauxLive.totalTtc) - Number(montantRetenueLive)).toFixed(2);
  }, [totauxLive.totalTtc, montantRetenueLive]);

  function applyArticle(idx: number, articleId: string) {
    const a = articles.find((x) => x.id === articleId);
    if (!a) return;
    const actuelle = form.getValues(`lignes.${idx}`);
    update(idx, {
      ...actuelle,
      type: 'article_catalogue',
      articleId,
      designation: a.libelle,
      unite: a.uniteVenteSymbole ?? ('unite' in actuelle ? actuelle.unite : 'u') ?? 'u',
      prixUnitaireHt:
        a.prixCourant ?? ('prixUnitaireHt' in actuelle ? actuelle.prixUnitaireHt : '0') ?? '0',
    } as LigneFactureInput);
  }

  function changerType(idx: number, nouveauType: 'section' | 'article_catalogue' | 'libre') {
    const actuel = form.getValues(`lignes.${idx}`);
    if (nouveauType === 'section') {
      update(idx, {
        type: 'section',
        designation: actuel.designation || 'Section',
        articleId: null,
        quantite: null,
        unite: null,
        prixUnitaireHt: null,
        tauxTva: null,
        remisePourcent: null,
        notes: actuel.notes ?? null,
      } as LigneFactureInput);
    } else if (nouveauType === 'libre') {
      update(idx, {
        type: 'libre',
        articleId: null,
        designation: actuel.designation || '',
        quantite: ('quantite' in actuel && actuel.quantite) || '1',
        unite: ('unite' in actuel && actuel.unite) || 'u',
        prixUnitaireHt: ('prixUnitaireHt' in actuel && actuel.prixUnitaireHt) || '0',
        tauxTva: ('tauxTva' in actuel && actuel.tauxTva) || '20.00',
        remisePourcent: ('remisePourcent' in actuel && actuel.remisePourcent) || '0',
        notes: actuel.notes ?? null,
      } as LigneFactureInput);
    } else {
      update(idx, {
        type: 'article_catalogue',
        articleId: '',
        designation: actuel.designation || '',
        quantite: ('quantite' in actuel && actuel.quantite) || '1',
        unite: ('unite' in actuel && actuel.unite) || 'u',
        prixUnitaireHt: ('prixUnitaireHt' in actuel && actuel.prixUnitaireHt) || '0',
        tauxTva: ('tauxTva' in actuel && actuel.tauxTva) || '20.00',
        remisePourcent: ('remisePourcent' in actuel && actuel.remisePourcent) || '0',
        notes: actuel.notes ?? null,
      } as LigneFactureInput);
    }
  }

  async function handleSubmit(values: FactureInput) {
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
    toast.success(
      result.data && 'numero' in result.data && result.data.numero
        ? `Facture ${result.data.numero} enregistrée`
        : 'Facture enregistrée',
    );
    const resolvedId =
      result.data && typeof result.data === 'object' && 'id' in result.data
        ? (result.data as { id?: string }).id
        : undefined;
    const url =
      successRedirectAppendId && resolvedId
        ? `${successRedirect.replace(/\/$/, '')}/${resolvedId}`
        : successRedirect;
    router.push(url);
    router.refresh();
  }

  const clientId = form.watch('clientId');
  const devisFiltrees = clientId ? devis.filter((d) => d.clientId === clientId) : devis;

  return (
    <Form {...form}>
      <form method="post" onSubmit={form.handleSubmit(handleSubmit)} className="space-y-6">
        {erreur && (
          <Alert variant="destructive">
            <AlertTitle>Erreur</AlertTitle>
            <AlertDescription>{erreur}</AlertDescription>
          </Alert>
        )}

        {/* En-tête */}
        <FormSection number={1} title="Client et rattachement" storageKey="facture:client">
          <div className="grid gap-4">
            <FormField
              control={form.control}
              name="clientId"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Client</FormLabel>
                  <Select value={field.value} onValueChange={field.onChange}>
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder="Choisir un client">
                          {(v) => {
                            if (!v) return 'Choisir un client';
                            const c = clients.find((x) => x.id === v);
                            return c ? `${c.code} — ${c.libelle}` : String(v);
                          }}
                        </SelectValue>
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {clients.map((c) => (
                        <SelectItem key={c.id} value={c.id}>
                          {c.code} — {c.libelle}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />
            <div className="grid gap-4 sm:grid-cols-2">
              <FormField
                control={form.control}
                name="chantierId"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Chantier (optionnel)</FormLabel>
                    <Select
                      value={field.value ?? '__none__'}
                      onValueChange={(v) => field.onChange(v === '__none__' ? null : v)}
                    >
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue>
                            {(v) => {
                              if (!v || v === '__none__') return 'Aucun chantier';
                              const c = chantiers.find((x) => x.id === v);
                              return c ? `${c.numero} — ${c.libelle}` : String(v);
                            }}
                          </SelectValue>
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="__none__">Aucun chantier</SelectItem>
                        {chantiers.map((c) => (
                          <SelectItem key={c.id} value={c.id}>
                            {c.numero} — {c.libelle}
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
                name="devisId"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Devis source (optionnel)</FormLabel>
                    <Select
                      value={field.value ?? '__none__'}
                      onValueChange={(v) => field.onChange(v === '__none__' ? null : v)}
                    >
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue>
                            {(v) => {
                              if (!v || v === '__none__') return 'Aucun devis';
                              const d = devisFiltrees.find((x) => x.id === v);
                              return d ? d.numero : String(v);
                            }}
                          </SelectValue>
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="__none__">Aucun devis</SelectItem>
                        {devisFiltrees.map((d) => (
                          <SelectItem key={d.id} value={d.id}>
                            {d.numero}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
          </div>
        </FormSection>

        <FormSection number={2} title="Dates et objet" storageKey="facture:dates">
          <div className="grid gap-4 sm:grid-cols-3">
            <FormField
              control={form.control}
              name="dateFacture"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Date de facture</FormLabel>
                  <FormControl>
                    <Input type="date" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="dateEcheance"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Échéance</FormLabel>
                  <FormControl>
                    <Input type="date" {...field} value={field.value ?? ''} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="delaiPaiementJours"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Délai (jours)</FormLabel>
                  <FormControl>
                    <Input
                      type="number"
                      min={0}
                      max={365}
                      {...field}
                      value={field.value ?? ''}
                      onChange={(e) =>
                        field.onChange(e.target.value === '' ? null : Number(e.target.value))
                      }
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>
          <FormField
            control={form.control}
            name="objet"
            render={({ field }) => (
              <FormItem className="mt-4">
                <FormLabel>Objet (optionnel)</FormLabel>
                <FormControl>
                  <Input
                    maxLength={200}
                    placeholder="Ex. Travaux de rénovation, lot 3"
                    {...field}
                    value={field.value ?? ''}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </FormSection>

        {/* Lignes */}
        <FormSection
          number={3}
          title={`Lignes de facture (${fields.length})`}
          storageKey="facture:lignes"
          bodyClassName="p-0"
          rightSlot={
            <SectionTotal label="Total HT" value={`${formatMontant(totauxLive.totalHt)} €`} />
          }
        >
          <div className="divide-y">
            {fields.map((field, idx) => {
              const type = lignesLive[idx]?.type ?? field.type;
              return (
                <div key={field.id} className="space-y-2 p-3">
                  <div className="flex items-center gap-2">
                    <Select
                      value={type}
                      onValueChange={(v) =>
                        v && changerType(idx, v as 'section' | 'article_catalogue' | 'libre')
                      }
                    >
                      <SelectTrigger className="w-44">
                        <SelectValue>
                          {(v) => {
                            switch (v) {
                              case 'section':
                                return '— Section —';
                              case 'article_catalogue':
                                return 'Article catalogue';
                              case 'libre':
                                return 'Ligne libre';
                              default:
                                return 'Type';
                            }
                          }}
                        </SelectValue>
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="section">— Section —</SelectItem>
                        <SelectItem value="article_catalogue">Article catalogue</SelectItem>
                        <SelectItem value="libre">Ligne libre</SelectItem>
                      </SelectContent>
                    </Select>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-sm"
                      className="ml-auto"
                      onClick={() => remove(idx)}
                      disabled={fields.length <= 1}
                      aria-label="Supprimer la ligne"
                    >
                      <Trash2Icon />
                    </Button>
                  </div>

                  {type === 'section' ? (
                    <Input
                      placeholder="Titre de section"
                      className="font-medium"
                      {...form.register(`lignes.${idx}.designation` as const)}
                      defaultValue={field.designation}
                    />
                  ) : (
                    <div className="grid gap-2">
                      {type === 'article_catalogue' && (
                        <Select
                          value={
                            'articleId' in lignesLive[idx]!
                              ? ((lignesLive[idx] as { articleId: string | null }).articleId ?? '')
                              : ''
                          }
                          onValueChange={(v) => v && applyArticle(idx, v)}
                        >
                          <SelectTrigger>
                            <SelectValue placeholder="Choisir un article catalogue">
                              {(v) => {
                                if (!v) return 'Choisir un article catalogue';
                                const a = articles.find((x) => x.id === v);
                                return a ? `${a.code} — ${a.libelle}` : String(v);
                              }}
                            </SelectValue>
                          </SelectTrigger>
                          <SelectContent>
                            {articles.map((a) => (
                              <SelectItem key={a.id} value={a.id}>
                                {a.code} — {a.libelle}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      )}
                      <Input
                        placeholder="Désignation"
                        {...form.register(`lignes.${idx}.designation` as const)}
                        defaultValue={field.designation}
                      />
                      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
                        <Input
                          inputMode="decimal"
                          placeholder="Qté"
                          {...form.register(`lignes.${idx}.quantite` as const)}
                          defaultValue={('quantite' in field && field.quantite) || ''}
                        />
                        <Input
                          placeholder="Unité"
                          maxLength={20}
                          {...form.register(`lignes.${idx}.unite` as const)}
                          defaultValue={('unite' in field && field.unite) || ''}
                        />
                        <Input
                          inputMode="decimal"
                          placeholder="Prix HT"
                          {...form.register(`lignes.${idx}.prixUnitaireHt` as const)}
                          defaultValue={('prixUnitaireHt' in field && field.prixUnitaireHt) || ''}
                        />
                        <Select
                          value={
                            'tauxTva' in lignesLive[idx]!
                              ? ((lignesLive[idx] as { tauxTva: string | null }).tauxTva ?? '20.00')
                              : '20.00'
                          }
                          onValueChange={(v) =>
                            v && form.setValue(`lignes.${idx}.tauxTva` as never, v as never)
                          }
                        >
                          <SelectTrigger>
                            <SelectValue placeholder="TVA">
                              {(v) => {
                                if (!v) return 'TVA';
                                return `${Number(v)
                                  .toFixed(2)
                                  .replace(/\.?0+$/, '')} %`;
                              }}
                            </SelectValue>
                          </SelectTrigger>
                          <SelectContent>
                            {TAUX_TVA_OPTIONS.map((o) => (
                              <SelectItem key={o.value} value={o.value}>
                                {o.label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <Input
                          inputMode="decimal"
                          placeholder="Remise %"
                          {...form.register(`lignes.${idx}.remisePourcent` as const)}
                          defaultValue={('remisePourcent' in field && field.remisePourcent) || '0'}
                        />
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
          <div className="flex gap-2 border-t bg-muted/30 p-3">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() =>
                append({
                  type: 'section',
                  designation: 'Section',
                  articleId: null,
                  quantite: null,
                  unite: null,
                  prixUnitaireHt: null,
                  tauxTva: null,
                  remisePourcent: null,
                  notes: null,
                } as LigneFactureInput)
              }
            >
              + Section
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() =>
                append({
                  type: 'libre',
                  articleId: null,
                  designation: '',
                  quantite: '1',
                  unite: 'u',
                  prixUnitaireHt: '0',
                  tauxTva: '20.00',
                  remisePourcent: '0',
                  notes: null,
                } as LigneFactureInput)
              }
            >
              + Ligne libre
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() =>
                append({
                  type: 'article_catalogue',
                  articleId: '',
                  designation: '',
                  quantite: '1',
                  unite: 'u',
                  prixUnitaireHt: '0',
                  tauxTva: '20.00',
                  remisePourcent: '0',
                  notes: null,
                } as LigneFactureInput)
              }
            >
              + Article catalogue
            </Button>
          </div>
        </FormSection>

        {/* Options TVA + retenue + totaux */}
        <FormSection number={4} title="TVA, retenue et totaux" storageKey="facture:tva-totaux">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-3">
              <FormField
                control={form.control}
                name="autoLiquidation"
                render={({ field }) => (
                  <FormItem className="flex items-center gap-3">
                    <FormControl>
                      <Switch checked={field.value} onCheckedChange={field.onChange} />
                    </FormControl>
                    <div>
                      <FormLabel className="!mt-0">Auto-liquidation TVA BTP</FormLabel>
                      <p className="text-xs text-muted-foreground">
                        Art. 283-2 nonies CGI — TVA collectée par le preneur. Force TVA = 0 €.
                      </p>
                    </div>
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="retenueGarantiePct"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Retenue de garantie (%)</FormLabel>
                    <FormControl>
                      <Input
                        type="number"
                        step="0.01"
                        min={0}
                        max={10}
                        placeholder="5 (max 10 %)"
                        {...field}
                        value={field.value ?? ''}
                        onChange={(e) =>
                          field.onChange(e.target.value === '' ? null : e.target.value)
                        }
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                <FormField
                  control={form.control}
                  name="remiseGlobaleType"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Remise globale</FormLabel>
                      <Select
                        value={field.value ?? '__aucune__'}
                        onValueChange={(v) => {
                          if (!v) return;
                          if (v === '__aucune__') {
                            field.onChange(null);
                            form.setValue('remiseGlobaleValeur', null);
                          } else {
                            field.onChange(v);
                          }
                        }}
                      >
                        <FormControl>
                          <SelectTrigger aria-label="Type de remise globale">
                            <SelectValue>
                              {(val) =>
                                val === 'pourcent'
                                  ? 'Pourcentage (%)'
                                  : val === 'montant'
                                    ? 'Montant (€)'
                                    : 'Aucune'
                              }
                            </SelectValue>
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="__aucune__">Aucune</SelectItem>
                          <SelectItem value="pourcent">Pourcentage (%)</SelectItem>
                          <SelectItem value="montant">Montant (€)</SelectItem>
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="remiseGlobaleValeur"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>
                        {remiseGlobaleType === 'montant' ? 'Montant (€)' : 'Valeur (%)'}
                      </FormLabel>
                      <FormControl>
                        <Input
                          inputMode="decimal"
                          placeholder={remiseGlobaleType === 'montant' ? '0.00' : '0'}
                          disabled={remiseGlobaleType === null}
                          aria-label="Valeur de la remise globale"
                          {...field}
                          value={field.value ?? ''}
                          onChange={(e) =>
                            field.onChange(e.target.value === '' ? null : e.target.value)
                          }
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
            </div>
            <div className="space-y-1 rounded-md bg-muted/30 p-3 text-sm">
              <div className="flex justify-between">
                <span>Total HT{aRemise ? ' brut' : ''}</span>
                <span className="tabular-nums">
                  {formatMontant(totauxLive.totalHtAvantRemise)} €
                </span>
              </div>
              {aRemise && (
                <>
                  <div className="flex justify-between text-destructive">
                    <span>
                      Remise globale (
                      {libelleRemiseGlobale({
                        type: remiseGlobaleType,
                        valeur: remiseGlobaleValeur,
                      })}
                      )
                    </span>
                    <span className="tabular-nums">
                      − {formatMontant(totauxLive.remiseGlobaleMontant)} €
                    </span>
                  </div>
                  <div className="flex justify-between font-medium">
                    <span>Total HT net</span>
                    <span className="tabular-nums">{formatMontant(totauxLive.totalHt)} €</span>
                  </div>
                </>
              )}
              <div className="flex justify-between text-muted-foreground">
                <span>TVA{autoLiq ? ' (auto-liq.)' : ''}</span>
                <span className="tabular-nums">{formatMontant(totauxLive.totalTva)} €</span>
              </div>
              <div className="flex justify-between border-t pt-1 font-medium">
                <span>Total TTC</span>
                <span className="tabular-nums">{formatMontant(totauxLive.totalTtc)} €</span>
              </div>
              {montantRetenueLive && (
                <>
                  <div className="flex justify-between text-muted-foreground">
                    <span>Retenue de garantie</span>
                    <span className="tabular-nums">− {formatMontant(montantRetenueLive)} €</span>
                  </div>
                  <div className="flex justify-between border-t pt-1 text-base font-semibold">
                    <span>Net à payer</span>
                    <span className="tabular-nums">{formatMontant(netAPayer)} €</span>
                  </div>
                </>
              )}
            </div>
          </div>
        </FormSection>

        {/* Mentions */}
        <FormSection number={5} title="Conditions, mentions et notes" storageKey="facture:mentions">
          <div className="grid gap-3">
            <FormField
              control={form.control}
              name="conditionsPaiement"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Conditions de paiement (optionnel)</FormLabel>
                  <FormControl>
                    <Textarea
                      rows={2}
                      placeholder="Ex. Paiement à 30 jours, virement IBAN…"
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
              name="mentionsLegales"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Mentions légales (optionnel)</FormLabel>
                  <FormControl>
                    <Textarea
                      rows={3}
                      placeholder="Pénalités de retard, indemnité forfaitaire 40 €, assurance décennale…"
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
              name="notes"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Notes internes (non imprimées)</FormLabel>
                  <FormControl>
                    <Textarea rows={2} {...field} value={field.value ?? ''} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>
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
            {isSubmitting ? 'Enregistrement…' : 'Enregistrer la facture'}
          </Button>
        </div>
      </form>
    </Form>
  );
}
