'use client';

import { ChevronDownIcon, ChevronRightIcon, XIcon } from 'lucide-react';
import { forwardRef, useCallback, useImperativeHandle, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { cn } from '@/lib/utils';
import type {
  DpgfAnalyse,
  DpgfImportResult,
  LigneDpgfPreview,
  MappingDpgf,
} from '@/lib/commercial/import-dpgf';

type ActionResult<T> = { ok: true; data: T } | { ok: false; error: string };

type Props = {
  /** Server action étape 1 : ouvre le fichier et renvoie aperçu + suggestion. */
  analyserAction: (base64: string, nomFichier: string) => Promise<ActionResult<DpgfAnalyse>>;
  /** Server action étape 2 : applique un mapping et renvoie la preview. */
  importerAction: (
    base64: string,
    nomFichier: string,
    mapping: MappingDpgf,
  ) => Promise<ActionResult<DpgfImportResult>>;
  /** Callback final : injecte les lignes dans le formulaire devis. */
  onConfirm: (lignes: LigneDpgfPreview[], mode: 'remplacer' | 'ajouter') => void;
};

const SENTINEL_VIDE = '__vide__';

async function fileToBase64(file: File): Promise<string> {
  const buffer = await file.arrayBuffer();
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]!);
  }
  return btoa(binary);
}

function libelleColonne(idx: number, headers: (string | number | null)[]): string {
  const lettre = excelColumnName(idx);
  const h = headers[idx];
  const t = h === null || h === undefined || h === '' ? '' : String(h).trim();
  return t === '' ? lettre : `${lettre} — ${t}`;
}

function excelColumnName(idx: number): string {
  let n = idx;
  let s = '';
  do {
    s = String.fromCharCode(65 + (n % 26)) + s;
    n = Math.floor(n / 26) - 1;
  } while (n >= 0);
  return s;
}

function previewCellule(v: string | number | null): string {
  if (v === null || v === undefined) return '';
  const s = String(v);
  return s.length > 40 ? `${s.slice(0, 37)}…` : s;
}

function profondeurPosition(position: string): number {
  if (!position) return 1;
  return position.split('.').filter((s) => s !== '').length;
}

export type DpgfImportZoneHandle = {
  /** Ouvre le sélecteur de fichier. Si un import est déjà en cours, le réinitialise d'abord. */
  ouvrir: () => void;
};

export const DpgfImportZone = forwardRef<DpgfImportZoneHandle, Props>(function DpgfImportZone(
  { analyserAction, importerAction, onConfirm },
  ref,
) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [chargement, setChargement] = useState(false);

  const [fichier, setFichier] = useState<{ base64: string; nom: string } | null>(null);
  const [analyse, setAnalyse] = useState<DpgfAnalyse | null>(null);
  const [mapping, setMapping] = useState<MappingDpgf | null>(null);
  const [preview, setPreview] = useState<DpgfImportResult | null>(null);
  const [modifierSource, setModifierSource] = useState(false);
  const [sectionsRepliees, setSectionsRepliees] = useState<Set<string>>(new Set());

  const importActif = chargement || fichier !== null || analyse !== null;

  const feuilleCourante = analyse?.feuilles.find((f) => f.nom === mapping?.feuille) ?? null;
  const headers =
    feuilleCourante && mapping ? (feuilleCourante.apercu[mapping.headerRow] ?? []) : [];

  const sectionsAvecEnfants = useMemo(() => {
    const set = new Set<string>();
    const lignes = preview?.lignes ?? [];
    for (let i = 0; i < lignes.length; i++) {
      const l = lignes[i]!;
      if (l.type !== 'section' || !l.position) continue;
      const prefixe = l.position + '.';
      for (let j = i + 1; j < lignes.length; j++) {
        if (lignes[j]!.position.startsWith(prefixe)) {
          set.add(l.position);
          break;
        }
      }
    }
    return set;
  }, [preview]);

  const lignesVisibles = useMemo(() => {
    if (!preview) return [];
    return preview.lignes.filter((l) => {
      if (!l.position) return true;
      const parts = l.position.split('.');
      for (let i = 1; i < parts.length; i++) {
        const prefixeAncetre = parts.slice(0, i).join('.');
        if (sectionsRepliees.has(prefixeAncetre)) return false;
      }
      return true;
    });
  }, [preview, sectionsRepliees]);

  const reset = useCallback(() => {
    setFichier(null);
    setAnalyse(null);
    setMapping(null);
    setPreview(null);
    setModifierSource(false);
    setSectionsRepliees(new Set());
  }, []);

  function repliesParDefaut(lignes: LigneDpgfPreview[]): Set<string> {
    const set = new Set<string>();
    for (const l of lignes) {
      if (l.type === 'section' && profondeurPosition(l.position) >= 2) {
        set.add(l.position);
      }
    }
    return set;
  }

  function posePreview(data: DpgfImportResult) {
    setPreview(data);
    setSectionsRepliees(repliesParDefaut(data.lignes));
  }

  function basculerSection(position: string) {
    setSectionsRepliees((prev) => {
      const next = new Set(prev);
      if (next.has(position)) next.delete(position);
      else next.add(position);
      return next;
    });
  }

  function toutDeplier() {
    setSectionsRepliees(new Set());
  }

  function toutReplier() {
    if (!preview) return;
    const set = new Set<string>();
    for (const l of preview.lignes) {
      if (l.type === 'section' && sectionsAvecEnfants.has(l.position)) {
        set.add(l.position);
      }
    }
    setSectionsRepliees(set);
  }

  async function onFileChange(file: File) {
    setChargement(true);
    setPreview(null);
    try {
      const base64 = await fileToBase64(file);
      const res = await analyserAction(base64, file.name);
      if (!res.ok) {
        toast.error(res.error);
        reset();
        return;
      }
      setFichier({ base64, nom: file.name });
      setAnalyse(res.data);
      if (res.data.suggestion) {
        setMapping(res.data.suggestion);
        // Auto-aperçu immédiat avec la suggestion
        const apercuRes = await importerAction(base64, file.name, res.data.suggestion);
        if (apercuRes.ok) {
          posePreview(apercuRes.data);
        } else {
          toast.warning(`Auto-détection partielle : ${apercuRes.error}`);
        }
      } else {
        // Pas de suggestion → l'utilisateur doit choisir manuellement
        const f0 = res.data.feuilles[0];
        if (f0) {
          setMapping({
            feuille: f0.nom,
            headerRow: 0,
            idxPosition: null,
            idxDesignation: 0,
            idxUnite: null,
            idxQuantite: null,
          });
        }
      }
    } catch {
      toast.error('Lecture du fichier impossible.');
      reset();
    } finally {
      setChargement(false);
    }
  }

  async function rafraichirApercu(m: MappingDpgf) {
    if (!fichier) return;
    setChargement(true);
    try {
      const res = await importerAction(fichier.base64, fichier.nom, m);
      if (!res.ok) {
        toast.error(res.error);
        setPreview(null);
        return;
      }
      posePreview(res.data);
    } finally {
      setChargement(false);
    }
  }

  function changerMapping(patch: Partial<MappingDpgf>) {
    if (!mapping) return;
    const nouveau: MappingDpgf = { ...mapping, ...patch };
    // Si on change de feuille, on remet le header à 0 et on relance la
    // détection (mapping suggéré ne s'applique pas forcément).
    if (patch.feuille && patch.feuille !== mapping.feuille) {
      nouveau.headerRow = 0;
      nouveau.idxPosition = null;
      nouveau.idxDesignation = 0;
      nouveau.idxUnite = null;
      nouveau.idxQuantite = null;
    }
    setMapping(nouveau);
  }

  function confirmer(mode: 'remplacer' | 'ajouter') {
    if (!preview) return;
    const valides = preview.lignes.filter((l) => l.erreurs.length === 0);
    if (valides.length === 0) {
      toast.error('Aucune ligne valide à importer.');
      return;
    }
    onConfirm(valides, mode);
    reset();
  }

  const declencherChoixFichier = useCallback(() => {
    reset();
    fileInputRef.current?.click();
  }, [reset]);

  useImperativeHandle(ref, () => ({ ouvrir: declencherChoixFichier }), [declencherChoixFichier]);

  return (
    <>
      <input
        ref={fileInputRef}
        type="file"
        accept=".xlsx"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) void onFileChange(file);
          // Permet de re-sélectionner le même fichier après une annulation.
          e.target.value = '';
        }}
      />

      {importActif && (
        <div className="min-w-0 space-y-3 rounded-md border bg-muted/10 p-3">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm font-medium">Importer un DPGF du prospect</span>
            <span className="text-xs text-muted-foreground">
              xlsx — l’outil détecte les colonnes mais vous pouvez les corriger.
            </span>
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              className="ml-auto"
              disabled={chargement}
              onClick={() => reset()}
              aria-label="Annuler l’import DPGF"
              title="Annuler l’import"
            >
              <XIcon className="size-4" />
            </Button>
          </div>
          <div className="space-y-3">
            {chargement && !preview && (
              <p className="text-xs text-muted-foreground">
                {fichier ? `Analyse de « ${fichier.nom} »…` : 'Analyse du fichier…'}
              </p>
            )}

            {analyse && mapping && feuilleCourante && (
              <div className="min-w-0 space-y-3 rounded-md border bg-background p-3">
                {(() => {
                  const sourceDetectee = analyse.suggestion !== null && !modifierSource;
                  const plusieursFeuilles = analyse.feuilles.length > 1;
                  const apercuTitres = headers
                    .map((v) => (v === null || v === undefined ? '' : String(v).trim()))
                    .filter((s) => s !== '')
                    .slice(0, 4)
                    .join(' · ');

                  if (sourceDetectee) {
                    return (
                      <div className="flex flex-wrap items-center gap-2 rounded-md bg-muted/40 px-3 py-2 text-xs">
                        <span>
                          <span className="text-muted-foreground">Source détectée :</span>{' '}
                          {plusieursFeuilles && (
                            <>
                              onglet <strong>« {mapping.feuille} »</strong>,{' '}
                            </>
                          )}
                          titres en ligne <strong>{mapping.headerRow + 1}</strong>
                          {apercuTitres && (
                            <span className="text-muted-foreground"> ({apercuTitres})</span>
                          )}
                        </span>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="ml-auto h-7 px-2 text-xs"
                          onClick={() => setModifierSource(true)}
                        >
                          Changer
                        </Button>
                      </div>
                    );
                  }

                  return (
                    <>
                      <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                        1. Où sont les titres de colonnes dans le fichier ?
                      </h4>
                      <div
                        className={`grid grid-cols-1 gap-2 ${plusieursFeuilles ? 'md:grid-cols-2' : ''}`}
                      >
                        {plusieursFeuilles && (
                          <label className="flex flex-col gap-1">
                            <span className="text-xs">Onglet Excel</span>
                            <Select
                              value={mapping.feuille}
                              onValueChange={(v) => v && changerMapping({ feuille: v })}
                            >
                              <SelectTrigger className="h-9">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                {analyse.feuilles.map((f) => (
                                  <SelectItem key={f.nom} value={f.nom}>
                                    {f.nom} ({f.nbLignes} lignes)
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                            <span className="text-[10px] text-muted-foreground">
                              L’onglet du classeur qui contient le DPGF.
                            </span>
                          </label>
                        )}
                        <label className="flex flex-col gap-1">
                          <span className="text-xs">Ligne des titres de colonnes</span>
                          <Select
                            value={String(mapping.headerRow)}
                            onValueChange={(v) => v && changerMapping({ headerRow: Number(v) })}
                          >
                            <SelectTrigger className="h-9">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {feuilleCourante.apercu.map((row, i) => {
                                const aperçu = row
                                  .map((v) => previewCellule(v))
                                  .filter((s) => s !== '')
                                  .slice(0, 4)
                                  .join(' · ');
                                return (
                                  <SelectItem key={i} value={String(i)}>
                                    Ligne {i + 1}
                                    {aperçu ? ` — ${aperçu}` : ''}
                                  </SelectItem>
                                );
                              })}
                            </SelectContent>
                          </Select>
                          <span className="text-[10px] text-muted-foreground">
                            La ligne contenant « Désignation », « Unité », « Quantité »…
                          </span>
                        </label>
                      </div>
                    </>
                  );
                })()}

                <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  2. Colonnes
                </h4>
                <div className="grid grid-cols-1 gap-2 md:grid-cols-2 lg:grid-cols-4">
                  <ColonneSelector
                    label="Position"
                    optionnel
                    nbColonnes={feuilleCourante.nbColonnes}
                    headers={headers}
                    valeur={mapping.idxPosition}
                    onChange={(idx) => changerMapping({ idxPosition: idx })}
                  />
                  <ColonneSelector
                    label="Désignation *"
                    nbColonnes={feuilleCourante.nbColonnes}
                    headers={headers}
                    valeur={mapping.idxDesignation}
                    onChange={(idx) => idx !== null && changerMapping({ idxDesignation: idx })}
                  />
                  <ColonneSelector
                    label="Unité"
                    optionnel
                    nbColonnes={feuilleCourante.nbColonnes}
                    headers={headers}
                    valeur={mapping.idxUnite}
                    onChange={(idx) => changerMapping({ idxUnite: idx })}
                  />
                  <ColonneSelector
                    label="Quantité"
                    optionnel
                    nbColonnes={feuilleCourante.nbColonnes}
                    headers={headers}
                    valeur={mapping.idxQuantite}
                    onChange={(idx) => changerMapping({ idxQuantite: idx })}
                  />
                </div>

                <div className="flex flex-wrap gap-2">
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    disabled={chargement}
                    onClick={() => void rafraichirApercu(mapping)}
                  >
                    {chargement ? 'Aperçu…' : 'Mettre à jour l’aperçu'}
                  </Button>
                  <p className="text-xs text-muted-foreground">
                    Astuce : sans unité ou quantité, la ligne devient une section. Vous pourrez la
                    transformer en article catalogue ou libre depuis l’éditeur.
                  </p>
                </div>

                {preview && (
                  <div className="space-y-2 border-t pt-3">
                    <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      3. Aperçu ({preview.lignes.length} lignes)
                    </h4>
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="text-xs">
                        <strong>{preview.nbSections}</strong> section
                        {preview.nbSections > 1 ? 's' : ''} · <strong>{preview.nbArticles}</strong>{' '}
                        article
                        {preview.nbArticles > 1 ? 's' : ''}
                        {preview.nbErreurs > 0 && (
                          <>
                            {' · '}
                            <span className="text-destructive">{preview.nbErreurs} en erreur</span>
                          </>
                        )}
                      </p>
                      {sectionsAvecEnfants.size > 0 && (
                        <div className="ml-auto flex gap-2 text-[10px]">
                          <button
                            type="button"
                            className="text-muted-foreground underline-offset-2 hover:underline"
                            onClick={toutDeplier}
                          >
                            Tout déplier
                          </button>
                          <span className="text-muted-foreground">·</span>
                          <button
                            type="button"
                            className="text-muted-foreground underline-offset-2 hover:underline"
                            onClick={toutReplier}
                          >
                            Tout replier
                          </button>
                        </div>
                      )}
                    </div>
                    <div className="max-h-64 overflow-auto rounded border">
                      <table className="w-full text-xs">
                        <thead className="bg-muted/40">
                          <tr>
                            <th className="px-2 py-1 text-left">Pos.</th>
                            <th className="px-2 py-1 text-left">Désignation</th>
                            <th className="px-2 py-1">Type</th>
                            <th className="px-2 py-1 text-right">Qté</th>
                            <th className="px-2 py-1">U</th>
                            <th className="px-2 py-1">Erreurs</th>
                          </tr>
                        </thead>
                        <tbody>
                          {lignesVisibles.slice(0, 200).map((l) => {
                            const profondeur = profondeurPosition(l.position);
                            const aEnfants =
                              l.type === 'section' && sectionsAvecEnfants.has(l.position);
                            const replie = aEnfants && sectionsRepliees.has(l.position);
                            return (
                              <tr
                                key={`${l.ordre}-${l.position}`}
                                className={l.erreurs.length > 0 ? 'bg-destructive/5' : ''}
                              >
                                <td className="px-2 py-1 font-mono text-[10px]">{l.position}</td>
                                <td className="px-2 py-1">
                                  <div
                                    className="flex items-start gap-1"
                                    style={{ paddingLeft: `${(profondeur - 1) * 12}px` }}
                                  >
                                    {aEnfants ? (
                                      <button
                                        type="button"
                                        onClick={() => basculerSection(l.position)}
                                        className="inline-flex size-4 shrink-0 items-center justify-center text-muted-foreground hover:text-foreground"
                                        aria-label={replie ? 'Déplier' : 'Replier'}
                                      >
                                        {replie ? (
                                          <ChevronRightIcon className="size-3" />
                                        ) : (
                                          <ChevronDownIcon className="size-3" />
                                        )}
                                      </button>
                                    ) : (
                                      <span className="inline-block size-4 shrink-0" />
                                    )}
                                    <span
                                      className={cn(
                                        'min-w-0 break-words',
                                        l.type === 'section' && 'font-medium',
                                      )}
                                    >
                                      {l.designation}
                                    </span>
                                  </div>
                                </td>
                                <td className="px-2 py-1">
                                  {l.type === 'section' ? 'Section' : 'Article'}
                                </td>
                                <td className="px-2 py-1 text-right tabular-nums">
                                  {l.type === 'libre' ? l.quantite : '—'}
                                </td>
                                <td className="px-2 py-1">{l.type === 'libre' ? l.unite : '—'}</td>
                                <td className="px-2 py-1 text-destructive">
                                  {l.erreurs.join('; ') || '—'}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                      {lignesVisibles.length > 200 && (
                        <p className="px-2 py-1 text-[10px] text-muted-foreground">
                          Affichage des 200 premières lignes visibles (sur {lignesVisibles.length} ;{' '}
                          {preview.lignes.length} au total).
                        </p>
                      )}
                    </div>
                    <div className="flex gap-2">
                      <Button type="button" size="sm" onClick={() => confirmer('remplacer')}>
                        Remplacer toutes les lignes
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => confirmer('ajouter')}
                      >
                        Ajouter au tableau existant
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            )}

            {fichier && !analyse && !chargement && (
              <p className="text-xs text-destructive">
                Fichier illisible. Vérifiez qu’il s’agit bien d’un xlsx valide.
              </p>
            )}
          </div>
        </div>
      )}
    </>
  );
});

function ColonneSelector({
  label,
  optionnel,
  nbColonnes,
  headers,
  valeur,
  onChange,
}: {
  label: string;
  optionnel?: boolean;
  nbColonnes: number;
  headers: (string | number | null)[];
  valeur: number | null;
  onChange: (idx: number | null) => void;
}) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-xs">{label}</span>
      <Select
        value={valeur === null ? SENTINEL_VIDE : String(valeur)}
        onValueChange={(v) => {
          if (!v) return;
          if (v === SENTINEL_VIDE) onChange(null);
          else onChange(Number(v));
        }}
      >
        <SelectTrigger className="h-9">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {optionnel && <SelectItem value={SENTINEL_VIDE}>— Aucune —</SelectItem>}
          {Array.from({ length: nbColonnes }, (_, i) => (
            <SelectItem key={i} value={String(i)}>
              {libelleColonne(i, headers)}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </label>
  );
}
