'use client';

import { UploadIcon, XIcon } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { forwardRef, useCallback, useImperativeHandle, useRef, useState } from 'react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  analyserClasseurCatalogue,
  executerImportCatalogue,
  previewImportCatalogue,
  type CatalogueAnalyse,
  type CataloguePreviewResult,
  type MappingCatalogue,
} from '@/lib/catalogue/import-catalogue-fournisseur';

export type ImportCatalogueDialogHandle = {
  /** Ouvre le sélecteur de fichier (réinitialise un import déjà en cours). */
  ouvrir: () => void;
};

type Props = {
  fournisseurId: string;
  fournisseurNom: string;
  /** Masque le bouton déclencheur interne « Importer un catalogue ». Utile quand
   *  l'ouverture est pilotée depuis une barre d'actions externe via la ref. */
  hideTrigger?: boolean;
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

function excelColumnName(idx: number): string {
  let n = idx;
  let s = '';
  do {
    s = String.fromCharCode(65 + (n % 26)) + s;
    n = Math.floor(n / 26) - 1;
  } while (n >= 0);
  return s;
}

function libelleColonne(idx: number, headers: (string | number | null)[]): string {
  const lettre = excelColumnName(idx);
  const h = headers[idx];
  const t = h === null || h === undefined || h === '' ? '' : String(h).trim();
  return t === '' ? lettre : `${lettre} — ${t}`;
}

function previewCellule(v: string | number | null): string {
  if (v === null || v === undefined) return '';
  const s = String(v);
  return s.length > 40 ? `${s.slice(0, 37)}…` : s;
}

export const ImportCatalogueDialog = forwardRef<ImportCatalogueDialogHandle, Props>(function ImportCatalogueDialog(
  { fournisseurId, fournisseurNom, hideTrigger = false },
  ref,
) {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [chargement, setChargement] = useState(false);
  const [enregistrement, setEnregistrement] = useState(false);
  const [fichier, setFichier] = useState<{ base64: string; nom: string } | null>(null);
  const [analyse, setAnalyse] = useState<CatalogueAnalyse | null>(null);
  const [mapping, setMapping] = useState<MappingCatalogue | null>(null);
  const [preview, setPreview] = useState<CataloguePreviewResult | null>(null);
  const [modifierSource, setModifierSource] = useState(false);

  const anneeCourante = new Date().getFullYear();
  const [libelleGrille, setLibelleGrille] = useState(
    `Tarif ${fournisseurNom} ${anneeCourante}`,
  );
  const [validFrom, setValidFrom] = useState(new Date().toISOString().slice(0, 10));
  const [validTo, setValidTo] = useState('');

  const importActif = chargement || fichier !== null || analyse !== null;

  const feuilleCourante =
    analyse?.feuilles.find((f) => f.nom === mapping?.feuille) ?? null;
  const headers =
    feuilleCourante && mapping ? feuilleCourante.apercu[mapping.headerRow] ?? [] : [];

  const reset = useCallback(() => {
    setFichier(null);
    setAnalyse(null);
    setMapping(null);
    setPreview(null);
    setModifierSource(false);
    setLibelleGrille(`Tarif ${fournisseurNom} ${anneeCourante}`);
    setValidFrom(new Date().toISOString().slice(0, 10));
    setValidTo('');
  }, [fournisseurNom, anneeCourante]);

  const declencherChoixFichier = useCallback(() => {
    reset();
    fileInputRef.current?.click();
  }, [reset]);

  useImperativeHandle(ref, () => ({ ouvrir: declencherChoixFichier }), [declencherChoixFichier]);

  async function onFileChange(file: File) {
    setChargement(true);
    setPreview(null);
    try {
      const base64 = await fileToBase64(file);
      const res = await analyserClasseurCatalogue(base64, file.name);
      if (!res.ok) {
        toast.error(res.error);
        reset();
        return;
      }
      setFichier({ base64, nom: file.name });
      setAnalyse(res.data);
      if (res.data.suggestion) {
        setMapping(res.data.suggestion);
        const apercuRes = await previewImportCatalogue(
          base64,
          file.name,
          res.data.suggestion,
        );
        if (apercuRes.ok) setPreview(apercuRes.data);
        else toast.warning(`Auto-détection partielle : ${apercuRes.error}`);
      } else {
        const f0 = res.data.feuilles[0];
        if (f0) {
          setMapping({
            feuille: f0.nom,
            headerRow: 0,
            idxCode: 0,
            idxLibelle: 1,
            idxFamille: null,
            idxUnite: null,
            idxPrix: null,
            idxReferenceFournisseur: null,
            idxDescription: null,
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

  async function rafraichirApercu(m: MappingCatalogue) {
    if (!fichier) return;
    setChargement(true);
    try {
      const res = await previewImportCatalogue(fichier.base64, fichier.nom, m);
      if (!res.ok) {
        toast.error(res.error);
        setPreview(null);
        return;
      }
      setPreview(res.data);
    } finally {
      setChargement(false);
    }
  }

  function changerMapping(patch: Partial<MappingCatalogue>) {
    if (!mapping) return;
    const nouveau: MappingCatalogue = { ...mapping, ...patch };
    if (patch.feuille && patch.feuille !== mapping.feuille) {
      nouveau.headerRow = 0;
      nouveau.idxCode = 0;
      nouveau.idxLibelle = 1;
      nouveau.idxFamille = null;
      nouveau.idxUnite = null;
      nouveau.idxPrix = null;
      nouveau.idxReferenceFournisseur = null;
      nouveau.idxDescription = null;
    }
    setMapping(nouveau);
  }

  async function confirmerImport() {
    if (!fichier || !mapping || !preview) return;
    const nbImportables = preview.nbNouveaux + preview.nbDoublons;
    if (nbImportables === 0) {
      toast.error('Aucune ligne valide à importer.');
      return;
    }
    setEnregistrement(true);
    try {
      const res = await executerImportCatalogue(
        fichier.base64,
        fichier.nom,
        mapping,
        fournisseurId,
        {
          libelle: libelleGrille,
          validFrom,
          validTo: validTo.trim() === '' ? null : validTo,
        },
      );
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      const d = res.data;
      toast.success(
        `Import réussi : ${d.nbLignesGrille} ligne(s) tarifaire(s), ` +
          `${d.nbArticlesCrees} article(s) créé(s)` +
          (d.nbFamillesCreees > 0 ? `, ${d.nbFamillesCreees} famille(s)` : '') +
          (d.nbUnitesCreees > 0 ? `, ${d.nbUnitesCreees} unité(s)` : '') +
          '.',
      );
      reset();
      router.refresh();
    } finally {
      setEnregistrement(false);
    }
  }

  const plusieursFeuilles = (analyse?.feuilles.length ?? 0) > 1;

  return (
    <>
      <input
        ref={fileInputRef}
        type="file"
        accept=".xlsx,.xls"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) void onFileChange(file);
          e.target.value = '';
        }}
      />

      {!importActif && !hideTrigger && (
        <Button type="button" variant="outline" onClick={declencherChoixFichier}>
          <UploadIcon className="size-4" />
          Importer un catalogue
        </Button>
      )}

      {importActif && (
        <div className="min-w-0 space-y-3 rounded-md border bg-muted/10 p-3">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm font-medium">
              Importer un catalogue fournisseur
            </span>
            <span className="text-xs text-muted-foreground">
              xlsx — l’outil détecte les colonnes, vous pouvez les corriger.
            </span>
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              className="ml-auto"
              disabled={chargement || enregistrement}
              onClick={reset}
              aria-label="Annuler l’import"
              title="Annuler l’import"
            >
              <XIcon className="size-4" />
            </Button>
          </div>

          {chargement && !preview && (
            <p className="text-xs text-muted-foreground">
              {fichier ? `Analyse de « ${fichier.nom} »…` : 'Analyse du fichier…'}
            </p>
          )}

          {analyse && mapping && feuilleCourante && (
            <div className="min-w-0 space-y-3 rounded-md border bg-background p-3">
              {analyse.suggestion !== null && !modifierSource ? (
                <div className="flex flex-wrap items-center gap-2 rounded-md bg-muted/40 px-3 py-2 text-xs">
                  <span>
                    <span className="text-muted-foreground">Source détectée :</span>{' '}
                    {plusieursFeuilles && (
                      <>
                        onglet <strong>« {mapping.feuille} »</strong>,{' '}
                      </>
                    )}
                    titres en ligne <strong>{mapping.headerRow + 1}</strong>
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
              ) : (
                <>
                  <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    1. Où sont les titres de colonnes ?
                  </h4>
                  <div
                    className={`grid grid-cols-1 gap-2 ${
                      plusieursFeuilles ? 'sm:grid-cols-2' : ''
                    }`}
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
                            const ap = row
                              .map((v) => previewCellule(v))
                              .filter((s) => s !== '')
                              .slice(0, 4)
                              .join(' · ');
                            return (
                              <SelectItem key={i} value={String(i)}>
                                Ligne {i + 1}
                                {ap ? ` — ${ap}` : ''}
                              </SelectItem>
                            );
                          })}
                        </SelectContent>
                      </Select>
                    </label>
                  </div>
                </>
              )}

              <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                2. Colonnes
              </h4>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
                <ColonneSelector
                  label="Code *"
                  nbColonnes={feuilleCourante.nbColonnes}
                  headers={headers}
                  valeur={mapping.idxCode}
                  onChange={(idx) => idx !== null && changerMapping({ idxCode: idx })}
                />
                <ColonneSelector
                  label="Désignation *"
                  nbColonnes={feuilleCourante.nbColonnes}
                  headers={headers}
                  valeur={mapping.idxLibelle}
                  onChange={(idx) => idx !== null && changerMapping({ idxLibelle: idx })}
                />
                <ColonneSelector
                  label="Prix unitaire HT"
                  optionnel
                  nbColonnes={feuilleCourante.nbColonnes}
                  headers={headers}
                  valeur={mapping.idxPrix}
                  onChange={(idx) => changerMapping({ idxPrix: idx })}
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
                  label="Famille (code)"
                  optionnel
                  nbColonnes={feuilleCourante.nbColonnes}
                  headers={headers}
                  valeur={mapping.idxFamille}
                  onChange={(idx) => changerMapping({ idxFamille: idx })}
                />
                <ColonneSelector
                  label="Réf. fournisseur"
                  optionnel
                  nbColonnes={feuilleCourante.nbColonnes}
                  headers={headers}
                  valeur={mapping.idxReferenceFournisseur}
                  onChange={(idx) => changerMapping({ idxReferenceFournisseur: idx })}
                />
                <ColonneSelector
                  label="Description"
                  optionnel
                  nbColonnes={feuilleCourante.nbColonnes}
                  headers={headers}
                  valeur={mapping.idxDescription}
                  onChange={(idx) => changerMapping({ idxDescription: idx })}
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
                  Les articles déjà connus (même code) ne sont pas recréés, mais leur
                  prix est ajouté à la grille. Familles et unités absentes sont créées
                  automatiquement.
                </p>
              </div>

              {preview && (
                <div className="space-y-3 border-t pt-3">
                  <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    3. Aperçu ({preview.lignes.length} lignes)
                  </h4>
                  <p className="text-xs">
                    <strong>{preview.nbNouveaux}</strong> nouvel(s) article(s) ·{' '}
                    <strong>{preview.nbDoublons}</strong> déjà connu(s)
                    {preview.nbErreurs > 0 && (
                      <>
                        {' · '}
                        <span className="text-destructive">
                          {preview.nbErreurs} ignoré(s) (erreur)
                        </span>
                      </>
                    )}
                    {preview.famillesACreer.length > 0 && (
                      <>
                        {' · '}
                        {preview.famillesACreer.length} famille(s) à créer
                      </>
                    )}
                    {preview.unitesACreer.length > 0 && (
                      <>
                        {' · '}
                        {preview.unitesACreer.length} unité(s) à créer
                      </>
                    )}
                  </p>

                  <div className="max-h-64 overflow-auto rounded border">
                    <table className="w-full text-xs">
                      <thead className="bg-muted/40">
                        <tr>
                          <th className="px-2 py-1 text-left">Code</th>
                          <th className="px-2 py-1 text-left">Désignation</th>
                          <th className="px-2 py-1 text-left">Famille</th>
                          <th className="px-2 py-1 text-right">Prix HT</th>
                          <th className="px-2 py-1">U</th>
                          <th className="px-2 py-1">État</th>
                        </tr>
                      </thead>
                      <tbody>
                        {preview.lignes.slice(0, 200).map((l) => (
                          <tr
                            key={`${l.ordre}-${l.code}`}
                            className={l.erreurs.length > 0 ? 'bg-destructive/5' : ''}
                          >
                            <td className="px-2 py-1 font-mono text-[10px]">{l.code}</td>
                            <td className="px-2 py-1">{l.libelle}</td>
                            <td className="px-2 py-1">{l.famille ?? '—'}</td>
                            <td className="px-2 py-1 text-right tabular-nums">
                              {l.prix ?? '—'}
                            </td>
                            <td className="px-2 py-1">{l.unite ?? '—'}</td>
                            <td className="px-2 py-1">
                              {l.erreurs.length > 0 ? (
                                <span className="text-destructive">
                                  {l.erreurs.join('; ')}
                                </span>
                              ) : l.doublon ? (
                                <span className="text-muted-foreground">existant</span>
                              ) : (
                                <span className="text-emerald-600">nouveau</span>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    {preview.lignes.length > 200 && (
                      <p className="px-2 py-1 text-[10px] text-muted-foreground">
                        Affichage des 200 premières lignes (sur {preview.lignes.length}).
                      </p>
                    )}
                  </div>

                  <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    4. Grille tarifaire à créer
                  </h4>
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                    <div className="flex flex-col gap-1 sm:col-span-3">
                      <Label htmlFor="import-grille-libelle" className="text-xs">
                        Libellé de la grille
                      </Label>
                      <Input
                        id="import-grille-libelle"
                        value={libelleGrille}
                        onChange={(e) => setLibelleGrille(e.target.value)}
                      />
                    </div>
                    <div className="flex flex-col gap-1">
                      <Label htmlFor="import-grille-from" className="text-xs">
                        Valide à partir du
                      </Label>
                      <Input
                        id="import-grille-from"
                        type="date"
                        value={validFrom}
                        onChange={(e) => setValidFrom(e.target.value)}
                      />
                    </div>
                    <div className="flex flex-col gap-1">
                      <Label htmlFor="import-grille-to" className="text-xs">
                        Jusqu’au (optionnel)
                      </Label>
                      <Input
                        id="import-grille-to"
                        type="date"
                        value={validTo}
                        onChange={(e) => setValidTo(e.target.value)}
                      />
                    </div>
                  </div>

                  <div className="flex flex-wrap gap-2">
                    <Button
                      type="button"
                      onClick={() => void confirmerImport()}
                      disabled={
                        enregistrement ||
                        chargement ||
                        preview.nbNouveaux + preview.nbDoublons === 0
                      }
                    >
                      {enregistrement
                        ? 'Import en cours…'
                        : `Importer ${preview.nbNouveaux + preview.nbDoublons} ligne(s)`}
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      onClick={reset}
                      disabled={enregistrement}
                    >
                      Annuler
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
