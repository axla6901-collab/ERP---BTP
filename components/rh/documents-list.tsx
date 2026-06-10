'use client';

import { DownloadIcon, PlusIcon, Trash2Icon } from 'lucide-react';
import { useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';

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
  LIBELLES_TYPE_DOCUMENT,
  TYPES_DOCUMENT_EMPLOYE,
  type DocumentInput,
  type TypeDocumentEmploye,
} from '@/lib/validation/rh';

type Doc = {
  id: string;
  type: TypeDocumentEmploye;
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
  actions: {
    preparerUpload: (
      contentType: string,
      filename: string,
      tailleBytes: number,
    ) => Promise<
      | { ok: true; data: { uploadUrl: string; minioKey: string } }
      | { ok: false; error: string }
    >;
    enregistrer: (input: DocumentInput) => Promise<ServerActionResult<{ id: string }>>;
    getDownloadUrl: (id: string) => Promise<
      { ok: true; url: string; libelle: string } | { ok: false; error: string }
    >;
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

export function DocumentsList({ items, peutEcrire, actions }: Props) {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const [showAdd, setShowAdd] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [erreur, setErreur] = useState<string | null>(null);

  const [file, setFile] = useState<File | null>(null);
  const [type, setType] = useState<TypeDocumentEmploye>('autre');
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
      setErreur('Sélectionne un fichier.');
      return;
    }
    if (!libelle.trim()) {
      setErreur('Le libellé est requis.');
      return;
    }
    startTransition(async () => {
      const prep = await actions.preparerUpload(file.type || 'application/octet-stream', file.name, file.size);
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

  return (
    <div className="space-y-3">
      {items.length === 0 ? (
        <p className="rounded border border-dashed p-4 text-center text-sm text-muted-foreground">
          Aucun document.
        </p>
      ) : (
        <ul className="divide-y rounded-md border">
          {items.map((d) => (
            <li key={d.id} className="flex items-start gap-3 p-3">
              <div className="grow space-y-0.5">
                <div className="flex flex-wrap items-baseline gap-2">
                  <span className="font-medium">{d.libelle}</span>
                  <span className="rounded-full bg-muted px-2 py-0.5 text-xs">
                    {LIBELLES_TYPE_DOCUMENT[d.type]}
                  </span>
                </div>
                <div className="text-xs text-muted-foreground">
                  {d.mimeType} · {tailleHumaine(d.tailleBytes)}
                  {d.dateValidite && <> · valide jusqu&apos;au {d.dateValidite}</>}
                </div>
              </div>
              <div className="flex items-center gap-1">
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 w-7 p-0"
                  disabled={isPending}
                  onClick={() => handleDownload(d.id)}
                  title="Télécharger"
                >
                  <DownloadIcon className="size-3.5" />
                </Button>
                {peutEcrire && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 w-7 p-0 text-destructive hover:text-destructive"
                    disabled={isPending}
                    onClick={() => handleDelete(d.id)}
                    title="Supprimer"
                  >
                    <Trash2Icon className="size-3.5" />
                  </Button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}

      {peutEcrire && (
        <>
          {!showAdd ? (
            <Button variant="outline" size="sm" onClick={() => setShowAdd(true)}>
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
                  <Select
                    value={type}
                    onValueChange={(v) => setType(v as TypeDocumentEmploye)}
                  >
                    <SelectTrigger>
                      <SelectValue>
                        {(v) => LIBELLES_TYPE_DOCUMENT[v as TypeDocumentEmploye] ?? v}
                      </SelectValue>
                    </SelectTrigger>
                    <SelectContent>
                      {TYPES_DOCUMENT_EMPLOYE.map((t) => (
                        <SelectItem key={t} value={t}>
                          {LIBELLES_TYPE_DOCUMENT[t]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Date de validité</Label>
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
