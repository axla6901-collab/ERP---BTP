'use client';

import { PlusIcon } from 'lucide-react';
import { useRef, useState, useTransition, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';

import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  LIBELLES_TYPE_DOCUMENT_TIER,
  TYPES_DOCUMENT_TIER,
  type DocumentTierInput,
  type TypeDocumentTier,
} from '@/lib/validation/tiers';

type Doc = {
  id: string;
  type: TypeDocumentTier;
  libelle: string;
  mimeType: string;
  tailleBytes: number | null;
  dateValidite: string | null;
  createdAt: string;
};

type ServerActionResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: string; fieldErrors?: Record<string, string[]> };

type Props = {
  items: Doc[];
  peutEcrire: boolean;
  /** Date du jour (YYYY-MM-DD) calculée côté serveur — pour le statut d'expiration. */
  today: string;
  /**
   * En-tête de la zone (gabarit « Vigilance & pièces ») : titre + sous-titre à
   * gauche, bouton « Téléverser un document » à droite. Fourni → le composant
   * rend lui-même l'en-tête et un tableau bord-à-bord (border-t). Absent → mode
   * autonome : pas d'en-tête, et le déclencheur d'ajout reste sous le tableau.
   */
  entete?: { titre: ReactNode; description: ReactNode };
  actions: {
    preparerUpload: (
      contentType: string,
      filename: string,
      tailleBytes: number,
    ) => Promise<
      { ok: true; data: { uploadUrl: string; minioKey: string } } | { ok: false; error: string }
    >;
    enregistrer: (input: DocumentTierInput) => Promise<ServerActionResult<{ id: string }>>;
    getDownloadUrl: (
      id: string,
    ) => Promise<{ ok: true; url: string; libelle: string } | { ok: false; error: string }>;
    supprimer: (id: string) => Promise<ServerActionResult<void>>;
  };
};

function tailleHumaine(bytes: number | null): string {
  if (!bytes) return '—';
  const units = ['o', 'Ko', 'Mo', 'Go'];
  let i = 0;
  let v = bytes;
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i++;
  }
  return `${v.toFixed(v >= 10 || i === 0 ? 0 : 1)} ${units[i]}`;
}

/** Ajoute n jours à une date ISO (YYYY-MM-DD) et renvoie une date ISO. */
function ajouterJours(iso: string, n: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/** Formate une date ISO (YYYY-MM-DD) en JJ/MM/AAAA, « — » si absente. */
function formatDateFr(iso: string | null): string {
  if (!iso) return '—';
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : iso;
}

type StatutPiece = { libelle: string; classe: string; proche: boolean };

/** Statut d'une pièce dérivé de sa date de validité (colonne « Statut » du tableau). */
function statutPiece(dateValidite: string | null, today: string): StatutPiece {
  if (dateValidite && dateValidite < today) {
    return { libelle: 'Expiré', classe: 'bg-rose-100 text-rose-700', proche: true };
  }
  if (dateValidite && dateValidite <= ajouterJours(today, 30)) {
    return { libelle: 'Expire bientôt', classe: 'bg-amber-100 text-amber-800', proche: true };
  }
  return { libelle: 'À jour', classe: 'bg-emerald-100 text-emerald-800', proche: false };
}

export function DocumentsTierList({ items, peutEcrire, today, entete, actions }: Props) {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const [showAdd, setShowAdd] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [erreur, setErreur] = useState<string | null>(null);

  const [file, setFile] = useState<File | null>(null);
  const [type, setType] = useState<TypeDocumentTier>('autre');
  const [libelle, setLibelle] = useState('');
  const [dateValidite, setDateValidite] = useState<string>('');
  const [notes, setNotes] = useState<string>('');

  function reset() {
    setFile(null);
    setType('autre');
    setLibelle('');
    setDateValidite('');
    setNotes('');
    setShowAdd(false);
    setErreur(null);
    if (fileRef.current) fileRef.current.value = '';
  }

  function handleFile(f: File) {
    setFile(f);
    if (!libelle) setLibelle(f.name.replace(/\.[^.]+$/, ''));
  }

  async function handleUpload() {
    setErreur(null);
    if (!file) {
      setErreur('Sélectionnez un fichier.');
      return;
    }
    if (!libelle.trim()) {
      setErreur('Le libellé est requis.');
      return;
    }
    startTransition(async () => {
      const prep = await actions.preparerUpload(
        file.type || 'application/octet-stream',
        file.name,
        file.size,
      );
      if (!prep.ok) {
        setErreur(prep.error);
        return;
      }
      const { uploadUrl, minioKey } = prep.data;
      try {
        const res = await fetch(uploadUrl, {
          method: 'PUT',
          body: file,
          headers: { 'Content-Type': file.type || 'application/octet-stream' },
        });
        if (!res.ok) {
          setErreur('Upload MinIO en échec : HTTP ' + res.status);
          return;
        }
      } catch (err) {
        setErreur('Upload MinIO impossible : ' + (err instanceof Error ? err.message : 'erreur'));
        return;
      }
      const r = await actions.enregistrer({
        type,
        libelle: libelle.trim(),
        mimeType: file.type || 'application/octet-stream',
        tailleBytes: file.size,
        minioKey,
        dateValidite: dateValidite || null,
        notes: notes.trim() || null,
      });
      if (r.ok) {
        toast.success('Document ajouté');
        reset();
        router.refresh();
      } else {
        setErreur(r.error);
      }
    });
  }

  function handleDownload(id: string) {
    startTransition(async () => {
      const r = await actions.getDownloadUrl(id);
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

  function handleDelete(id: string) {
    startTransition(async () => {
      const r = await actions.supprimer(id);
      if (r.ok) {
        toast.success('Document supprimé');
        router.refresh();
      } else {
        toast.error(r.error);
      }
    });
  }

  const th = 'px-4 py-2.5 font-medium sm:px-5';
  const td = 'px-4 py-3 sm:px-5';

  return (
    <div className={entete ? undefined : 'space-y-3'}>
      {entete && (
        <div className="flex flex-wrap items-end justify-between gap-2 px-4 py-3 sm:px-5">
          <div>
            <h3 className="font-heading font-semibold text-orange-700">{entete.titre}</h3>
            <p className="text-xs text-muted-foreground">{entete.description}</p>
          </div>
          {peutEcrire && !showAdd && (
            <Button variant="outline" size="sm" onClick={() => setShowAdd(true)}>
              <PlusIcon className="mr-1 size-4" /> Téléverser un document
            </Button>
          )}
        </div>
      )}

      {items.length === 0 ? (
        <p
          className={cn(
            'text-center text-sm text-muted-foreground',
            entete ? 'border-t px-4 py-6 sm:px-5' : 'rounded border border-dashed p-4',
          )}
        >
          Aucun document.
        </p>
      ) : (
        <div className={entete ? undefined : 'overflow-hidden rounded-md border'}>
          <table className={cn('w-full text-sm', entete && 'border-t')}>
            <thead className="bg-muted/40 text-left text-xs uppercase tracking-widest text-muted-foreground">
              <tr>
                <th className={th}>Document</th>
                <th className={th}>Libellé / référence</th>
                <th className={cn(th, 'text-right')}>Validité</th>
                <th className={th}>Statut</th>
                <th className={cn(th, 'text-right')}>Action</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {items.map((d) => {
                const statut = statutPiece(d.dateValidite, today);
                return (
                  <tr key={d.id} className="hover:bg-muted/40">
                    <td className={td}>{LIBELLES_TYPE_DOCUMENT_TIER[d.type]}</td>
                    <td className={cn(td, 'text-muted-foreground')}>
                      {d.libelle}
                      <span className="block text-xs text-muted-foreground/80">
                        {d.mimeType} · {tailleHumaine(d.tailleBytes)}
                      </span>
                    </td>
                    <td
                      className={cn(
                        td,
                        'text-right tabular-nums',
                        statut.proche && 'text-destructive',
                      )}
                    >
                      {formatDateFr(d.dateValidite)}
                    </td>
                    <td className={td}>
                      <span
                        className={cn('rounded px-2 py-0.5 text-xs font-medium', statut.classe)}
                      >
                        {statut.libelle}
                      </span>
                    </td>
                    <td className={cn(td, 'whitespace-nowrap text-right')}>
                      <button
                        type="button"
                        className="text-sm text-orange-700 hover:underline disabled:opacity-50"
                        disabled={isPending}
                        onClick={() => handleDownload(d.id)}
                      >
                        Voir
                      </button>
                      {peutEcrire && (
                        <button
                          type="button"
                          className="ml-3 text-sm text-destructive hover:underline disabled:opacity-50"
                          disabled={isPending}
                          onClick={() => handleDelete(d.id)}
                        >
                          Supprimer
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {peutEcrire && (
        <>
          {!showAdd ? (
            !entete && (
              <Button variant="outline" size="sm" onClick={() => setShowAdd(true)}>
                <PlusIcon className="mr-1 size-4" /> Ajouter un document
              </Button>
            )
          ) : (
            <div
              className={cn('grid gap-3 p-4', entete ? 'border-t sm:px-5' : 'rounded-md border')}
            >
              {erreur && (
                <Alert variant="destructive">
                  <AlertTitle>Erreur</AlertTitle>
                  <AlertDescription>{erreur}</AlertDescription>
                </Alert>
              )}
              <div>
                <Label>Fichier</Label>
                <Input
                  ref={fileRef}
                  type="file"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) handleFile(f);
                  }}
                />
                {file && (
                  <p className="mt-1 text-xs text-muted-foreground">
                    {file.name} ({tailleHumaine(file.size)})
                  </p>
                )}
              </div>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div>
                  <Label>Type</Label>
                  <Select value={type} onValueChange={(v) => setType(v as TypeDocumentTier)}>
                    <SelectTrigger>
                      <SelectValue>
                        {(v) => LIBELLES_TYPE_DOCUMENT_TIER[v as TypeDocumentTier] ?? v}
                      </SelectValue>
                    </SelectTrigger>
                    <SelectContent>
                      {TYPES_DOCUMENT_TIER.map((t) => (
                        <SelectItem key={t} value={t}>
                          {LIBELLES_TYPE_DOCUMENT_TIER[t]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Date de fin de validité</Label>
                  <Input
                    type="date"
                    value={dateValidite}
                    onChange={(e) => setDateValidite(e.target.value)}
                  />
                </div>
              </div>
              <div>
                <Label>Libellé</Label>
                <Input
                  value={libelle}
                  onChange={(e) => setLibelle(e.target.value)}
                  maxLength={200}
                  required
                />
              </div>
              <div>
                <Label>Notes (optionnel)</Label>
                <Input value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={500} />
              </div>
              <div className="flex justify-end gap-2">
                <Button variant="ghost" size="sm" onClick={reset} disabled={isPending}>
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
