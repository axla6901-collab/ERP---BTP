'use client';

import {
  CheckIcon,
  ChevronDownIcon,
  ChevronRightIcon,
  DownloadIcon,
  PlusIcon,
  Trash2Icon,
  XIcon,
} from 'lucide-react';
import { useRouter } from 'next/navigation';
import { Fragment, useMemo, useState, useTransition } from 'react';
import { toast } from 'sonner';

import { StatutDocumentPastille } from '@/components/referencement/statut-document-pastille';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
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
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import type { LigneConformite } from '@/lib/referencement/conformite';
import {
  enregistrerDocumentTier,
  preparerUploadDocumentTier,
  refuserDocumentTier,
  supprimerDocumentTier,
  urlTelechargementDocumentTier,
  validerDocumentTier,
} from '@/lib/referencement/documents';

type StatutDoc = 'en_attente_validation' | 'valide' | 'expire' | 'a_renouveler' | 'refuse';

type DocItem = {
  id: string;
  natureDocumentId: string;
  nomFichierOrigine: string | null;
  dateFinValidite: string | null;
  statut: StatutDoc;
  motifRefus: string | null;
  createdAt: string;
};

/** Libellés FR du statut workflow d'une version (historique). */
const LIBELLE_STATUT_DOC: Record<StatutDoc, string> = {
  en_attente_validation: 'En attente',
  valide: 'Validé',
  expire: 'Expiré',
  a_renouveler: 'À renouveler',
  refuse: 'Refusé',
};

function formatDateFr(iso: string): string {
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return iso;
  return new Date(t).toLocaleDateString('fr-FR');
}

type NatureItem = {
  id: string;
  code: string;
  libelle: string;
  modeControle: 'duree_jours' | 'date_fin_assurance' | 'case_a_cocher' | 'date_obtention';
};

type Props = {
  tierId: string;
  lignes: LigneConformite[];
  documents: DocItem[];
  natures: NatureItem[];
  peutEcrire: boolean;
};

export function TierDocumentsList({ tierId, lignes, documents, natures, peutEcrire }: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [erreur, setErreur] = useState<string | null>(null);
  const [showAdd, setShowAdd] = useState(false);

  const [file, setFile] = useState<File | null>(null);
  const [natureId, setNatureId] = useState<string>(natures[0]?.id ?? '');
  const [dateObtention, setDateObtention] = useState('');
  const [dateFinValidite, setDateFinValidite] = useState('');
  const [notes, setNotes] = useState('');
  const [historiqueOuvert, setHistoriqueOuvert] = useState<Set<string>>(new Set());

  const natureChoisie = useMemo(
    () => natures.find((n) => n.id === natureId) ?? null,
    [natures, natureId],
  );

  // Toutes les versions par nature, triées de la plus récente à la plus ancienne.
  // versions[0] = pièce courante affichée ; le reste = historique conservé.
  const versionsParNature = useMemo(() => {
    const m = new Map<string, DocItem[]>();
    for (const d of documents) {
      const arr = m.get(d.natureDocumentId);
      if (arr) arr.push(d);
      else m.set(d.natureDocumentId, [d]);
    }
    for (const arr of m.values()) {
      arr.sort((a, b) => (a.createdAt < b.createdAt ? 1 : a.createdAt > b.createdAt ? -1 : 0));
    }
    return m;
  }, [documents]);

  function basculerHistorique(natureDocumentId: string) {
    setHistoriqueOuvert((prev) => {
      const next = new Set(prev);
      if (next.has(natureDocumentId)) next.delete(natureDocumentId);
      else next.add(natureDocumentId);
      return next;
    });
  }

  function resetForm() {
    setFile(null);
    setDateObtention('');
    setDateFinValidite('');
    setNotes('');
    setShowAdd(false);
    setErreur(null);
  }

  function ouvrirAjout(prefNatureId?: string) {
    setErreur(null);
    if (prefNatureId) setNatureId(prefNatureId);
    setShowAdd(true);
  }

  function handleUpload() {
    setErreur(null);
    if (!natureId) {
      setErreur('Sélectionnez une nature de document.');
      return;
    }
    if (!file) {
      setErreur('Sélectionnez un fichier.');
      return;
    }
    startTransition(async () => {
      const prep = await preparerUploadDocumentTier(
        tierId,
        file.type || 'application/octet-stream',
        file.name,
        file.size,
      );
      if (!prep.ok) {
        setErreur(prep.error);
        return;
      }
      try {
        const res = await fetch(prep.data.uploadUrl, {
          method: 'PUT',
          body: file,
          headers: { 'Content-Type': file.type || 'application/octet-stream' },
        });
        if (!res.ok) {
          setErreur('Upload MinIO en échec : HTTP ' + res.status);
          return;
        }
      } catch (err) {
        setErreur('Upload impossible : ' + (err instanceof Error ? err.message : 'erreur'));
        return;
      }
      const r = await enregistrerDocumentTier(tierId, {
        natureDocumentId: natureId,
        minioKey: prep.data.minioKey,
        nomFichierOrigine: file.name,
        mimeType: file.type || 'application/octet-stream',
        tailleBytes: file.size,
        dateObtention: dateObtention || null,
        dateFinValidite: dateFinValidite || null,
        notes: notes.trim() || null,
      });
      if (r.ok) {
        toast.success('Document ajouté (en attente de validation)');
        resetForm();
        router.refresh();
      } else {
        setErreur(r.error);
      }
    });
  }

  function telecharger(id: string) {
    startTransition(async () => {
      const r = await urlTelechargementDocumentTier(id);
      if (!r.ok) {
        toast.error(r.error);
        return;
      }
      const a = document.createElement('a');
      a.href = r.url;
      a.target = '_blank';
      a.rel = 'noopener noreferrer';
      a.click();
    });
  }

  function valider(id: string) {
    startTransition(async () => {
      const r = await validerDocumentTier(id);
      if (r.ok) {
        toast.success('Document validé');
        router.refresh();
      } else toast.error(r.error);
    });
  }

  function refuser(id: string) {
    const motif = window.prompt('Motif du refus :');
    if (!motif) return;
    startTransition(async () => {
      const r = await refuserDocumentTier(id, { motif });
      if (r.ok) {
        toast.success('Document refusé');
        router.refresh();
      } else toast.error(r.error);
    });
  }

  function supprimer(id: string) {
    startTransition(async () => {
      const r = await supprimerDocumentTier(id);
      if (r.ok) {
        toast.success('Document supprimé');
        router.refresh();
      } else toast.error(r.error);
    });
  }

  return (
    <div className="space-y-4">
      {lignes.length === 0 ? (
        <p className="rounded border border-dashed p-4 text-center text-sm text-muted-foreground">
          Aucun document requis (le tier n&apos;a pas de corps d&apos;état rattaché).
        </p>
      ) : (
        <div className="overflow-hidden rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Document</TableHead>
                <TableHead>Fin de validité</TableHead>
                <TableHead>Statut</TableHead>
                {peutEcrire && <TableHead className="text-right">Actions</TableHead>}
              </TableRow>
            </TableHeader>
            <TableBody>
              {lignes.map((ligne) => {
                const versions = versionsParNature.get(ligne.natureDocumentId) ?? [];
                const doc = versions[0];
                const historique = versions.slice(1);
                const estOuvert = historiqueOuvert.has(ligne.natureDocumentId);
                return (
                  <Fragment key={ligne.natureDocumentId}>
                    <TableRow>
                      <TableCell className="whitespace-normal">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-medium">{ligne.libelle}</span>
                          {ligne.estBloquant && (
                            <span className="rounded bg-rose-100 px-1.5 py-0.5 text-[10px] font-medium text-rose-700">
                              bloquant
                            </span>
                          )}
                        </div>
                        <div className="text-xs text-muted-foreground">
                          {doc?.nomFichierOrigine ?? 'Aucun fichier'}
                          {doc?.motifRefus && <> · refus : {doc.motifRefus}</>}
                        </div>
                        {historique.length > 0 && (
                          <button
                            type="button"
                            onClick={() => basculerHistorique(ligne.natureDocumentId)}
                            aria-expanded={estOuvert}
                            className="mt-1 inline-flex items-center gap-1 text-xs font-medium text-muted-foreground hover:text-foreground"
                          >
                            {estOuvert ? (
                              <ChevronDownIcon className="size-3" />
                            ) : (
                              <ChevronRightIcon className="size-3" />
                            )}
                            {historique.length} version{historique.length > 1 ? 's' : ''} précédente
                            {historique.length > 1 ? 's' : ''}
                          </button>
                        )}
                      </TableCell>
                      <TableCell className="text-sm tabular-nums text-muted-foreground">
                        {ligne.dateFinValidite ?? '—'}
                      </TableCell>
                      <TableCell>
                        <StatutDocumentPastille statut={ligne.statut} />
                      </TableCell>
                      {peutEcrire && (
                        <TableCell className="text-right">
                          <div className="flex shrink-0 items-center justify-end gap-1">
                            {doc && (
                              <>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="h-7 w-7 p-0"
                                  disabled={isPending}
                                  title="Télécharger"
                                  onClick={() => telecharger(doc.id)}
                                >
                                  <DownloadIcon className="size-3.5" />
                                </Button>
                                {doc.statut === 'en_attente_validation' && (
                                  <>
                                    <Button
                                      variant="ghost"
                                      size="sm"
                                      className="h-7 w-7 p-0 text-emerald-700"
                                      disabled={isPending}
                                      title="Valider"
                                      onClick={() => valider(doc.id)}
                                    >
                                      <CheckIcon className="size-3.5" />
                                    </Button>
                                    <Button
                                      variant="ghost"
                                      size="sm"
                                      className="h-7 w-7 p-0 text-rose-700"
                                      disabled={isPending}
                                      title="Refuser"
                                      onClick={() => refuser(doc.id)}
                                    >
                                      <XIcon className="size-3.5" />
                                    </Button>
                                  </>
                                )}
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="h-7 w-7 p-0 text-destructive"
                                  disabled={isPending}
                                  title="Supprimer"
                                  onClick={() => supprimer(doc.id)}
                                >
                                  <Trash2Icon className="size-3.5" />
                                </Button>
                              </>
                            )}
                            <Button
                              variant="outline"
                              size="xs"
                              disabled={isPending}
                              onClick={() => ouvrirAjout(ligne.natureDocumentId)}
                            >
                              {doc ? 'Remplacer' : 'Ajouter'}
                            </Button>
                          </div>
                        </TableCell>
                      )}
                    </TableRow>
                    {estOuvert &&
                      historique.map((v) => (
                        <TableRow key={v.id} className="bg-muted/30">
                          <TableCell className="whitespace-normal pl-6">
                            <div className="text-xs text-muted-foreground">
                              <span className="font-medium text-foreground/70">
                                {v.nomFichierOrigine ?? 'Sans nom'}
                              </span>{' '}
                              · version du {formatDateFr(v.createdAt)}
                              {v.motifRefus && <> · refus : {v.motifRefus}</>}
                            </div>
                          </TableCell>
                          <TableCell className="text-sm tabular-nums text-muted-foreground">
                            {v.dateFinValidite ?? '—'}
                          </TableCell>
                          <TableCell className="text-xs text-muted-foreground">
                            {LIBELLE_STATUT_DOC[v.statut]}
                          </TableCell>
                          {peutEcrire && (
                            <TableCell className="text-right">
                              <div className="flex shrink-0 items-center justify-end gap-1">
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="h-7 w-7 p-0"
                                  disabled={isPending}
                                  title="Télécharger cette version"
                                  onClick={() => telecharger(v.id)}
                                >
                                  <DownloadIcon className="size-3.5" />
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="h-7 w-7 p-0 text-destructive"
                                  disabled={isPending}
                                  title="Supprimer cette version"
                                  onClick={() => supprimer(v.id)}
                                >
                                  <Trash2Icon className="size-3.5" />
                                </Button>
                              </div>
                            </TableCell>
                          )}
                        </TableRow>
                      ))}
                  </Fragment>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}

      {peutEcrire && (
        <>
          {!showAdd ? (
            <Button variant="outline" size="sm" onClick={() => ouvrirAjout()}>
              <PlusIcon className="mr-1 size-4" /> Ajouter un document
            </Button>
          ) : (
            <div className="grid gap-3 rounded-md border p-4">
              {erreur && (
                <Alert variant="destructive">
                  <AlertTitle>Erreur</AlertTitle>
                  <AlertDescription>{erreur}</AlertDescription>
                </Alert>
              )}
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div>
                  <Label>Nature du document</Label>
                  <Select value={natureId} onValueChange={(v) => setNatureId(v ?? '')}>
                    <SelectTrigger>
                      <SelectValue>
                        {(v) => natures.find((n) => n.id === v)?.libelle ?? 'Choisir…'}
                      </SelectValue>
                    </SelectTrigger>
                    <SelectContent>
                      {natures.map((n) => (
                        <SelectItem key={n.id} value={n.id}>
                          {n.libelle}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Fichier</Label>
                  <Input
                    type="file"
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (f) setFile(f);
                    }}
                  />
                </div>
              </div>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div>
                  <Label>Date d&apos;obtention</Label>
                  <Input
                    type="date"
                    value={dateObtention}
                    onChange={(e) => setDateObtention(e.target.value)}
                  />
                </div>
                {natureChoisie?.modeControle === 'date_fin_assurance' && (
                  <div>
                    <Label>Date de fin de validité</Label>
                    <Input
                      type="date"
                      value={dateFinValidite}
                      onChange={(e) => setDateFinValidite(e.target.value)}
                    />
                  </div>
                )}
              </div>
              <div>
                <Label>Notes (optionnel)</Label>
                <Input value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={500} />
              </div>
              <div className="flex justify-end gap-2">
                <Button variant="ghost" size="sm" onClick={resetForm} disabled={isPending}>
                  Annuler
                </Button>
                <Button size="sm" onClick={handleUpload} disabled={isPending}>
                  {isPending ? 'Upload…' : 'Téléverser'}
                </Button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
