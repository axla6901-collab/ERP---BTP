'use client';

import {
  ChevronDownIcon,
  ChevronRightIcon,
  FileTextIcon,
  Trash2Icon,
  UploadIcon,
} from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';

import { useGuardedRouter, useUnsavedChangesGuard } from '@/lib/hooks/navigation-guard';
import { useFieldArray, useForm } from 'react-hook-form';
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
import { FormSection, SectionTotal } from '@/components/ui/form-section';
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
import { calculerLigneSituation, calculerTotauxSituation } from '@/lib/facturation/calculs';
import { calculerMontantRemiseGlobale, libelleRemiseGlobale } from '@/lib/remise-globale';
import type { LignePreview } from '@/lib/facturation/import-situation';
import type {
  ChantierAvecAvancement,
  DevisFacturable,
  LigneDevisPourSituation,
  LignePrecedente,
  RemiseReprise,
} from '@/lib/facturation/situations';
import {
  situationTravauxSchema,
  type LigneSituationInput,
  type SituationTravauxInput,
} from '@/lib/validation/facturation';

type ServerActionResult<T = unknown> =
  | { ok: true; data: T }
  | { ok: false; error: string; fieldErrors?: Record<string, string[]> };

type ArticleOption = {
  id: string;
  code: string;
  libelle: string;
  uniteVenteSymbole: string | null;
  prixCourant: string | null;
};

type Props = {
  chantiers: ChantierAvecAvancement[];
  articles: ArticleOption[];
  chantierFigeId?: string | undefined;
  /** Devis pré-sélectionné (ex. depuis la fiche devis « Créer situation »). */
  devisFigeId?: string | undefined;
  onSubmit: (
    values: SituationTravauxInput,
  ) => Promise<ServerActionResult<{ id: string; numero: number }>>;
  /** Server action : charge les lignes de la situation précédente d'un chantier. */
  chargerLignesPrecedentesAction: (
    chantierId: string,
  ) => Promise<{ lignes: LignePrecedente[]; situationNumero: number } | null>;
  /** Server action : parse un fichier xlsx/csv en preview. */
  parserFichierAction: (
    fichierBase64: string,
    nomFichier: string,
  ) => Promise<
    ServerActionResult<{ lignes: LignePreview[]; nbLignesValides: number; nbLignesErreurs: number }>
  >;
  /** Server action : liste les devis acceptés du chantier sélectionné. */
  listerDevisFacturablesAction: (chantierId: string) => Promise<DevisFacturable[]>;
  /** Server action : charge les lignes d'un devis comme lignes de situation. */
  chargerLignesDevisAction: (devisId: string) => Promise<{
    lignes: LigneDevisPourSituation[];
    devisNumero: string;
    remiseGlobale: RemiseReprise;
  } | null>;
  successRedirect: string;
};

function formatMontant(s: string | number | null | undefined): string {
  if (s === null || s === undefined || s === '') return '—';
  const n = Number(s);
  if (Number.isNaN(n)) return String(s);
  return n.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

const TODAY = () => new Date().toISOString().slice(0, 10);
const SENTINEL_NO_ARTICLE = '__none__';

const ligneVide = (): LigneSituationInput => ({
  designation: '',
  articleId: null,
  quantite: null,
  unite: null,
  prixUnitaireHt: null,
  montantMarcheHt: null,
  pctAvancementCumule: '0',
  notes: null,
  lignePrecedenteId: null,
});

export function SituationForm({
  chantiers,
  articles,
  chantierFigeId,
  devisFigeId,
  onSubmit,
  chargerLignesPrecedentesAction,
  parserFichierAction,
  listerDevisFacturablesAction,
  chargerLignesDevisAction,
  successRedirect,
}: Props) {
  const router = useRouter();
  const guardedRouter = useGuardedRouter();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  const [importOuvert, setImportOuvert] = useState(false);
  const [importPreview, setImportPreview] = useState<{
    lignes: LignePreview[];
    nbValides: number;
    nbErreurs: number;
  } | null>(null);
  const [importEnCours, setImportEnCours] = useState(false);
  const [reprendreEnCours, setReprendreEnCours] = useState(false);
  const [devisFacturables, setDevisFacturables] = useState<DevisFacturable[]>([]);
  const [chargerDevisEnCours, setChargerDevisEnCours] = useState(false);
  // Map ligne_precedente_id → montant_cumule_ht (alimentée par "reprendre lignes précédentes")
  const [cumulesPrecedents, setCumulesPrecedents] = useState<Map<string, string>>(new Map());

  const chantierFige = chantierFigeId
    ? (chantiers.find((c) => c.id === chantierFigeId) ?? null)
    : null;

  const form = useForm<SituationTravauxInput>({
    resolver: typedZodResolver(situationTravauxSchema),
    defaultValues: {
      chantierId: chantierFige?.id ?? '',
      devisId: devisFigeId ?? null,
      dateSituation: TODAY(),
      tauxTva: '20.00',
      notes: '',
      lignes: [ligneVide()],
      remiseGlobaleType: null,
      remiseGlobaleValeur: null,
    },
  });
  useUnsavedChangesGuard({ isDirty: form.formState.isDirty });

  const { fields, append, remove, replace } = useFieldArray({
    control: form.control,
    name: 'lignes',
  });

  const chantierId = form.watch('chantierId');
  const chantierChoisi = useMemo(
    () => chantiers.find((c) => c.id === chantierId) ?? null,
    [chantiers, chantierId],
  );
  const lignesLive = form.watch('lignes');
  const remiseGlobaleType = form.watch('remiseGlobaleType') ?? null;
  const remiseGlobaleValeur = form.watch('remiseGlobaleValeur') ?? null;

  // Charge la liste des devis facturables dès qu'un chantier est sélectionné
  useEffect(() => {
    if (!chantierId) {
      setDevisFacturables([]);
      return;
    }
    let annule = false;
    (async () => {
      const liste = await listerDevisFacturablesAction(chantierId);
      if (!annule) setDevisFacturables(liste);
    })();
    return () => {
      annule = true;
    };
  }, [chantierId, listerDevisFacturablesAction]);

  // Si un devis est pré-sélectionné via la query string, charge automatiquement
  // ses lignes au premier rendu (commodité pour le bouton « Créer situation »
  // depuis la fiche devis).
  useEffect(() => {
    if (!devisFigeId) return;
    void chargerDepuisDevis(devisFigeId, true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [devisFigeId]);

  async function chargerDepuisDevis(devisId: string, remplacer: boolean) {
    setChargerDevisEnCours(true);
    try {
      const res = await chargerLignesDevisAction(devisId);
      if (!res || res.lignes.length === 0) {
        toast.error('Aucune ligne exploitable dans ce devis.');
        return;
      }
      const nouvelles: LigneSituationInput[] = res.lignes.map((l) => ({
        designation: l.designation,
        articleId: l.articleId,
        quantite: l.quantite,
        unite: l.unite,
        prixUnitaireHt: l.prixUnitaireHt,
        montantMarcheHt: l.montantMarcheHt,
        pctAvancementCumule: '0',
        notes: null,
        lignePrecedenteId: null,
      }));
      if (remplacer) {
        replace(nouvelles);
      } else {
        for (const l of nouvelles) append(l);
      }
      form.setValue('devisId', devisId);
      // Reprend la remise globale du devis (normalisée en %), sur un
      // « remplacer » uniquement — un ajout ne doit pas écraser la remise déjà
      // saisie sur la situation en cours.
      if (remplacer && res.remiseGlobale) {
        form.setValue('remiseGlobaleType', res.remiseGlobale.type, { shouldDirty: true });
        form.setValue('remiseGlobaleValeur', res.remiseGlobale.valeur, { shouldDirty: true });
      }
      toast.success(
        `${nouvelles.length} ligne${nouvelles.length > 1 ? 's' : ''} reprise${nouvelles.length > 1 ? 's' : ''} du devis ${res.devisNumero}` +
          (remplacer && res.remiseGlobale
            ? ` · remise globale ${res.remiseGlobale.valeur} % reprise`
            : ''),
      );
    } finally {
      setChargerDevisEnCours(false);
    }
  }

  // Calcule l'aperçu live pour chaque ligne
  const apercus = useMemo(() => {
    return lignesLive.map((l) => {
      const precCumule =
        l.lignePrecedenteId && cumulesPrecedents.has(l.lignePrecedenteId)
          ? cumulesPrecedents.get(l.lignePrecedenteId)!
          : '0';
      return calculerLigneSituation(l, precCumule);
    });
  }, [lignesLive, cumulesPrecedents]);

  const totauxApercu = useMemo(() => {
    const valides = apercus.filter((a): a is NonNullable<typeof a> => a !== null);
    if (valides.length === 0) return null;
    return calculerTotauxSituation(valides);
  }, [apercus]);

  // Remise globale appliquée sur le « à facturer HT » de la situation.
  const montantRemiseSituation = totauxApercu
    ? calculerMontantRemiseGlobale(Number(totauxApercu.montantAFacturerHt), {
        type: remiseGlobaleType,
        valeur: remiseGlobaleValeur,
      })
    : 0;
  const aRemiseSituation = montantRemiseSituation > 0;
  const aFacturerNet = totauxApercu
    ? (Number(totauxApercu.montantAFacturerHt) - montantRemiseSituation).toFixed(2)
    : '0.00';

  async function appliquerLignesPrecedentes() {
    if (!chantierId) {
      toast.error('Choisis d’abord un chantier.');
      return;
    }
    setReprendreEnCours(true);
    try {
      const res = await chargerLignesPrecedentesAction(chantierId);
      if (!res || res.lignes.length === 0) {
        toast.error('Aucune situation précédente trouvée pour ce chantier.');
        return;
      }
      const newCumules = new Map<string, string>();
      const nouvelles: LigneSituationInput[] = res.lignes.map((l) => {
        newCumules.set(l.lignePrecedenteId, l.montantCumuleHt);
        return {
          designation: l.designation,
          articleId: l.articleId,
          quantite: l.quantite,
          unite: l.unite,
          prixUnitaireHt: l.prixUnitaireHt,
          montantMarcheHt: l.montantMarcheHt,
          pctAvancementCumule: l.pctAvancementCumule, // pré-rempli, l'utilisateur ajuste
          notes: l.notes,
          lignePrecedenteId: l.lignePrecedenteId,
        };
      });
      setCumulesPrecedents(newCumules);
      replace(nouvelles);
      toast.success(`Lignes reprises de la situation n°${res.situationNumero}`);
    } finally {
      setReprendreEnCours(false);
    }
  }

  async function importerFichier(file: File) {
    setImportEnCours(true);
    try {
      const buffer = await file.arrayBuffer();
      const bytes = new Uint8Array(buffer);
      // Conversion bytes → base64 (sans dépendance externe)
      let binary = '';
      for (let i = 0; i < bytes.byteLength; i++) {
        binary += String.fromCharCode(bytes[i]!);
      }
      const base64 = btoa(binary);
      const res = await parserFichierAction(base64, file.name);
      if (!res.ok) {
        toast.error(res.error);
        setImportPreview(null);
        return;
      }
      setImportPreview({
        lignes: res.data.lignes,
        nbValides: res.data.nbLignesValides,
        nbErreurs: res.data.nbLignesErreurs,
      });
    } finally {
      setImportEnCours(false);
    }
  }

  function confirmerImport(remplacer: boolean) {
    if (!importPreview) return;
    const nouvelles: LigneSituationInput[] = importPreview.lignes
      .filter((l) => l.erreurs.length === 0)
      .map((l) => ({
        designation: l.designation,
        articleId: null,
        quantite: l.quantite,
        unite: l.unite,
        prixUnitaireHt: l.prixUnitaireHt,
        montantMarcheHt: l.montantMarcheHt,
        pctAvancementCumule: l.pctAvancementCumule ?? '0',
        notes: l.notes,
        lignePrecedenteId: null,
      }));
    if (nouvelles.length === 0) {
      toast.error('Aucune ligne valide à importer.');
      return;
    }
    if (remplacer) {
      replace(nouvelles);
    } else {
      for (const l of nouvelles) append(l);
    }
    setImportPreview(null);
    setImportOuvert(false);
    toast.success(
      `${nouvelles.length} ligne${nouvelles.length > 1 ? 's' : ''} importée${nouvelles.length > 1 ? 's' : ''}`,
    );
  }

  function appliquerArticle(idx: number, articleId: string) {
    const a = articles.find((x) => x.id === articleId);
    if (!a) return;
    const actuelle = form.getValues(`lignes.${idx}`);
    form.setValue(`lignes.${idx}`, {
      ...actuelle,
      articleId,
      designation: actuelle.designation || a.libelle,
      unite: actuelle.unite ?? a.uniteVenteSymbole,
      prixUnitaireHt: actuelle.prixUnitaireHt ?? a.prixCourant,
    });
  }

  async function handleSubmit(values: SituationTravauxInput) {
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
        ? `Situation n°${result.data.numero} créée`
        : 'Situation créée',
    );
    router.push(successRedirect);
    router.refresh();
  }

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
        <FormSection number={1} title="Chantier et devis" storageKey="situation:chantier">
          <div className="grid gap-4">
            <FormField
              control={form.control}
              name="chantierId"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Chantier</FormLabel>
                  {chantierFige ? (
                    <div className="rounded-md border bg-muted/40 px-3 py-2 text-sm">
                      <span className="font-mono text-xs text-muted-foreground">
                        {chantierFige.numero}
                      </span>{' '}
                      {chantierFige.libelle} —{' '}
                      <span className="text-xs text-muted-foreground">
                        {chantierFige.clientNom}
                      </span>
                    </div>
                  ) : (
                    <Select value={field.value} onValueChange={(v) => v && field.onChange(v)}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Choisir un chantier">
                            {(v) => {
                              if (!v) return 'Choisir un chantier';
                              const c = chantiers.find((x) => x.id === v);
                              return c ? `${c.numero} — ${c.libelle}` : String(v);
                            }}
                          </SelectValue>
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {chantiers.map((c) => (
                          <SelectItem key={c.id} value={c.id}>
                            {c.numero} — {c.libelle}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                  {chantierChoisi && (
                    <FormDescription>
                      Prochaine situation : <strong>n°{chantierChoisi.prochainNumero}</strong> ·
                      cumulé précédent : {formatMontant(chantierChoisi.dernierMontantCumuleHt)} € (
                      {Number(chantierChoisi.dernierPctCumule)
                        .toFixed(2)
                        .replace(/\.?0+$/, '')}{' '}
                      %)
                    </FormDescription>
                  )}
                  <FormMessage />
                </FormItem>
              )}
            />
            {chantierId && (
              <FormField
                control={form.control}
                name="devisId"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Devis source (optionnel)</FormLabel>
                    <div className="flex flex-wrap gap-2">
                      <Select
                        value={field.value ?? '__none__'}
                        onValueChange={(v) => field.onChange(v === '__none__' ? null : v)}
                      >
                        <FormControl>
                          <SelectTrigger className="flex-1">
                            <SelectValue placeholder="Aucun devis lié">
                              {(v) => {
                                if (!v || v === '__none__') return 'Aucun devis lié';
                                const d = devisFacturables.find((x) => x.id === v);
                                return d
                                  ? `${d.numero} — ${d.dateDevis} (${Number(d.totalHt).toLocaleString('fr-FR')} € HT)`
                                  : String(v);
                              }}
                            </SelectValue>
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="__none__">Aucun devis lié</SelectItem>
                          {devisFacturables.map((d) => (
                            <SelectItem key={d.id} value={d.id}>
                              {d.numero} — {d.dateDevis} (
                              {Number(d.totalHt).toLocaleString('fr-FR')} € HT)
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      {field.value && (
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          disabled={chargerDevisEnCours}
                          onClick={() => chargerDepuisDevis(field.value!, true)}
                        >
                          <FileTextIcon className="size-4" />
                          Charger lignes
                        </Button>
                      )}
                    </div>
                    <FormDescription>
                      Seuls les devis acceptés du client de ce chantier apparaissent. Cliquez sur «
                      Charger lignes » pour pré-remplir les postes.
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
            )}
          </div>
        </FormSection>

        <FormSection number={2} title="Date, TVA et remise" storageKey="situation:date-tva">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <FormField
              control={form.control}
              name="dateSituation"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Date de la situation</FormLabel>
                  <FormControl>
                    <Input type="date" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="tauxTva"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Taux TVA (%)</FormLabel>
                  <FormControl>
                    <Input
                      inputMode="decimal"
                      placeholder="20.00"
                      {...field}
                      value={field.value ?? '20.00'}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
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
                  <FormDescription>
                    Appliquée sur le « à facturer HT » de cette situation.
                  </FormDescription>
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
                    {remiseGlobaleType === 'montant' ? 'Montant de la remise (€)' : 'Remise (%)'}
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
        </FormSection>

        {/* Actions sur les lignes */}
        <div className="flex flex-wrap items-center gap-2 rounded-md border bg-muted/20 p-3 text-sm">
          <span className="font-medium">Lignes ({fields.length})</span>
          <div className="ml-auto flex flex-wrap gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={appliquerLignesPrecedentes}
              disabled={!chantierId || reprendreEnCours}
            >
              {reprendreEnCours ? 'Chargement…' : 'Reprendre situation précédente'}
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setImportOuvert((v) => !v)}
            >
              <UploadIcon className="size-4" />
              Importer Excel/CSV
            </Button>
            <Button type="button" variant="outline" size="sm" onClick={() => append(ligneVide())}>
              + Ligne
            </Button>
          </div>
        </div>

        {/* Zone d'import */}
        {importOuvert && (
          <div className="space-y-3 rounded-md border p-4">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-medium">Importer un fichier client</h3>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => {
                  setImportOuvert(false);
                  setImportPreview(null);
                }}
              >
                Fermer
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              Formats acceptés : <strong>.xlsx</strong>, <strong>.csv</strong>. Colonnes reconnues :
              Désignation, Quantité, Unité, PU HT, Montant HT, % avancement, Notes (insensible à la
              casse et aux accents).
            </p>
            <Input
              type="file"
              accept=".xlsx,.csv"
              disabled={importEnCours}
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) void importerFichier(file);
              }}
            />
            {importEnCours && <p className="text-xs text-muted-foreground">Analyse du fichier…</p>}
            {importPreview && (
              <div className="space-y-2">
                <div className="flex items-center justify-between text-xs">
                  <span>
                    <strong>{importPreview.nbValides}</strong> ligne
                    {importPreview.nbValides > 1 ? 's' : ''} valide
                    {importPreview.nbValides > 1 ? 's' : ''}
                    {importPreview.nbErreurs > 0 && (
                      <>
                        {' · '}
                        <span className="text-destructive">
                          {importPreview.nbErreurs} en erreur (ignorée
                          {importPreview.nbErreurs > 1 ? 's' : ''})
                        </span>
                      </>
                    )}
                  </span>
                </div>
                <div className="max-h-64 overflow-auto rounded border">
                  <table className="w-full text-xs">
                    <thead className="bg-muted/40">
                      <tr>
                        <th className="px-2 py-1 text-left">Désignation</th>
                        <th className="px-2 py-1 text-right">Qté</th>
                        <th className="px-2 py-1">U</th>
                        <th className="px-2 py-1 text-right">PU HT</th>
                        <th className="px-2 py-1 text-right">Montant HT</th>
                        <th className="px-2 py-1 text-right">%</th>
                        <th className="px-2 py-1">Erreurs</th>
                      </tr>
                    </thead>
                    <tbody>
                      {importPreview.lignes.map((l, i) => (
                        <tr key={i} className={l.erreurs.length > 0 ? 'bg-destructive/5' : ''}>
                          <td className="px-2 py-1">{l.designation}</td>
                          <td className="px-2 py-1 text-right tabular-nums">{l.quantite ?? '—'}</td>
                          <td className="px-2 py-1">{l.unite ?? '—'}</td>
                          <td className="px-2 py-1 text-right tabular-nums">
                            {l.prixUnitaireHt ?? '—'}
                          </td>
                          <td className="px-2 py-1 text-right tabular-nums">
                            {l.montantMarcheHt ?? '—'}
                          </td>
                          <td className="px-2 py-1 text-right tabular-nums">
                            {l.pctAvancementCumule ?? '—'}
                          </td>
                          <td className="px-2 py-1 text-destructive">
                            {l.erreurs.join('; ') || '—'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div className="flex gap-2">
                  <Button
                    type="button"
                    size="sm"
                    onClick={() => confirmerImport(true)}
                    disabled={importPreview.nbValides === 0}
                  >
                    Remplacer toutes les lignes
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => confirmerImport(false)}
                    disabled={importPreview.nbValides === 0}
                  >
                    Ajouter au tableau existant
                  </Button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Tableau des lignes */}
        <FormSection
          number={3}
          title={`Avancement par poste (${fields.length})`}
          storageKey="situation:avancement"
          rightSlot={
            totauxApercu ? (
              <SectionTotal
                label="À facturer HT"
                value={`${formatMontant(totauxApercu.montantAFacturerHt)} €`}
              />
            ) : undefined
          }
        >
          <div className="space-y-3">
            {fields.map((field, idx) => {
              const ligne = lignesLive[idx]!;
              const apercu = apercus[idx] ?? null;
              const articleSel = ligne.articleId
                ? articles.find((a) => a.id === ligne.articleId)
                : null;
              const aPrecedent = !!ligne.lignePrecedenteId;
              return (
                <LigneRow
                  key={field.id}
                  idx={idx}
                  form={form}
                  ligne={ligne}
                  apercu={apercu}
                  articles={articles}
                  articleSel={articleSel}
                  aPrecedent={aPrecedent}
                  onRemove={() => remove(idx)}
                  onChangerArticle={(aid) => appliquerArticle(idx, aid)}
                  disableRemove={fields.length <= 1}
                />
              );
            })}
          </div>
        </FormSection>

        {/* Totaux récap */}
        {totauxApercu && (
          <FormSection number={4} title="Récapitulatif" storageKey="situation:recap">
            <div className="grid gap-1 text-sm">
              <div className="flex justify-between">
                <span>Total marché HT</span>
                <span className="tabular-nums">
                  {formatMontant(totauxApercu.montantMarcheHt)} €
                </span>
              </div>
              <div className="flex justify-between text-muted-foreground">
                <span>
                  Cumulé HT (
                  {Number(totauxApercu.pctAvancementCumule)
                    .toFixed(2)
                    .replace(/\.?0+$/, '')}{' '}
                  %)
                </span>
                <span className="tabular-nums">
                  {formatMontant(totauxApercu.montantCumuleHt)} €
                </span>
              </div>
              <div className="flex justify-between text-muted-foreground">
                <span>Cumulé précédent</span>
                <span className="tabular-nums">
                  − {formatMontant(totauxApercu.montantSituationPrecedenteHt)} €
                </span>
              </div>
              <div className="flex justify-between border-t pt-1 text-base font-semibold">
                <span>À facturer HT{aRemiseSituation ? ' brut' : ''}</span>
                <span className="tabular-nums">
                  {formatMontant(totauxApercu.montantAFacturerHt)} €
                </span>
              </div>
              {aRemiseSituation && (
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
                      − {formatMontant(montantRemiseSituation.toFixed(2))} €
                    </span>
                  </div>
                  <div className="flex justify-between text-base font-semibold">
                    <span>À facturer net HT</span>
                    <span className="tabular-nums">{formatMontant(aFacturerNet)} €</span>
                  </div>
                </>
              )}
            </div>
          </FormSection>
        )}

        <FormSection number={5} title="Notes" storageKey="situation:notes">
          <FormField
            control={form.control}
            name="notes"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Notes (optionnel)</FormLabel>
                <FormControl>
                  <Textarea rows={2} {...field} value={field.value ?? ''} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </FormSection>

        <div className="flex justify-end gap-2 border-t pt-4">
          <Button
            variant="ghost"
            type="button"
            onClick={() => guardedRouter.back()}
            disabled={isSubmitting}
          >
            Annuler
          </Button>
          <Button type="submit" disabled={isSubmitting}>
            {isSubmitting ? 'Création…' : 'Créer la situation'}
          </Button>
        </div>
      </form>
    </Form>
  );
}

// ─────────────────────────────────────────────────────────────
// Sous-composant : ligne d'éditeur (avec collapse "détail saisie")
// ─────────────────────────────────────────────────────────────

type LigneRowProps = {
  idx: number;
  form: ReturnType<typeof useForm<SituationTravauxInput>>;
  ligne: LigneSituationInput;
  apercu: ReturnType<typeof calculerLigneSituation>;
  articles: ArticleOption[];
  articleSel: ArticleOption | null | undefined;
  aPrecedent: boolean;
  onRemove: () => void;
  onChangerArticle: (id: string) => void;
  disableRemove: boolean;
};

function LigneRow({
  idx,
  form,
  ligne,
  apercu,
  articles,
  articleSel,
  aPrecedent,
  onRemove,
  onChangerArticle,
  disableRemove,
}: LigneRowProps) {
  const [detailOuvert, setDetailOuvert] = useState(true);

  return (
    <div className="rounded-md border p-3">
      <div className="flex flex-wrap items-start gap-2">
        <button
          type="button"
          onClick={() => setDetailOuvert((v) => !v)}
          className="mt-1 inline-flex size-5 items-center justify-center rounded text-muted-foreground hover:bg-muted hover:text-foreground"
          aria-label={detailOuvert ? 'Replier' : 'Déplier'}
        >
          {detailOuvert ? (
            <ChevronDownIcon className="size-4" />
          ) : (
            <ChevronRightIcon className="size-4" />
          )}
        </button>
        <div className="flex-1 space-y-2">
          <div className="grid gap-2 sm:grid-cols-[1fr_auto_auto]">
            <Input
              placeholder="Désignation du poste"
              {...form.register(`lignes.${idx}.designation` as const)}
              defaultValue={ligne.designation}
            />
            <Input
              type="number"
              step="0.01"
              min={0}
              max={100}
              placeholder="% avancement"
              className="w-32"
              {...form.register(`lignes.${idx}.pctAvancementCumule` as const)}
              defaultValue={ligne.pctAvancementCumule}
            />
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              onClick={onRemove}
              disabled={disableRemove}
              aria-label="Supprimer la ligne"
            >
              <Trash2Icon />
            </Button>
          </div>

          {detailOuvert && (
            <div className="space-y-2 rounded-md border bg-muted/10 p-2">
              {/* Sélecteur article */}
              <div className="grid gap-2 sm:grid-cols-[1fr_auto]">
                <Select
                  value={ligne.articleId ?? SENTINEL_NO_ARTICLE}
                  onValueChange={(v) => {
                    if (!v) return;
                    if (v === SENTINEL_NO_ARTICLE) {
                      form.setValue(`lignes.${idx}.articleId`, null);
                    } else {
                      onChangerArticle(v);
                    }
                  }}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Aucun article catalogue">
                      {(v) => {
                        if (!v || v === SENTINEL_NO_ARTICLE) return 'Aucun article catalogue';
                        const a = articles.find((x) => x.id === v);
                        return a ? `${a.code} — ${a.libelle}` : String(v);
                      }}
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={SENTINEL_NO_ARTICLE}>Aucun article catalogue</SelectItem>
                    {articles.map((a) => (
                      <SelectItem key={a.id} value={a.id}>
                        {a.code} — {a.libelle}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {articleSel?.prixCourant && (
                  <span className="self-center text-xs text-muted-foreground">
                    PU courant : {formatMontant(articleSel.prixCourant)} €
                  </span>
                )}
              </div>

              {/* Mode hybride : qté+PU OU montant direct */}
              <div className="grid gap-2 sm:grid-cols-4">
                <Input
                  inputMode="decimal"
                  placeholder="Qté"
                  {...form.register(`lignes.${idx}.quantite` as const)}
                  defaultValue={ligne.quantite ?? ''}
                />
                <Input
                  placeholder="Unité"
                  maxLength={20}
                  {...form.register(`lignes.${idx}.unite` as const)}
                  defaultValue={ligne.unite ?? ''}
                />
                <Input
                  inputMode="decimal"
                  placeholder="PU HT (€)"
                  {...form.register(`lignes.${idx}.prixUnitaireHt` as const)}
                  defaultValue={ligne.prixUnitaireHt ?? ''}
                />
                <Input
                  inputMode="decimal"
                  placeholder="OU Montant HT (€)"
                  {...form.register(`lignes.${idx}.montantMarcheHt` as const)}
                  defaultValue={ligne.montantMarcheHt ?? ''}
                />
              </div>
              <p className="text-[11px] text-muted-foreground">
                Saisir soit « Quantité + PU », soit « Montant HT » directement. Si les deux, le
                montant direct prime.
              </p>
              <Input
                placeholder="Notes (optionnel)"
                {...form.register(`lignes.${idx}.notes` as const)}
                defaultValue={ligne.notes ?? ''}
              />
            </div>
          )}

          {/* Aperçu calcul live */}
          {apercu && (
            <div className="grid grid-cols-2 gap-2 text-xs sm:grid-cols-4">
              <div className="rounded bg-muted/30 p-2">
                <div className="text-muted-foreground">Marché HT</div>
                <div className="tabular-nums">{formatMontant(apercu.montantMarcheHt)} €</div>
              </div>
              <div className="rounded bg-muted/30 p-2">
                <div className="text-muted-foreground">Cumulé HT</div>
                <div className="tabular-nums">{formatMontant(apercu.montantCumuleHt)} €</div>
              </div>
              <div className="rounded bg-muted/30 p-2">
                <div className="text-muted-foreground">Précédent{aPrecedent ? '' : ' (—)'}</div>
                <div className="tabular-nums">
                  − {formatMontant(apercu.montantSituationPrecedenteHt)} €
                </div>
              </div>
              <div className="rounded border bg-background p-2 font-semibold">
                <div className="text-muted-foreground">À facturer</div>
                <div className="tabular-nums">{formatMontant(apercu.montantAFacturerHt)} €</div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
