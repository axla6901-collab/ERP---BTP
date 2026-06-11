'use client';

import { UploadIcon } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useRef, useState, useTransition } from 'react';
import { toast } from 'sonner';

import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { detectFormatImport, type ImportStats } from '@/lib/rh/import-export-types';

type ServerActionResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: string; fieldErrors?: Record<string, string[]> };

type Props = {
  onJson: (jsonText: string) => Promise<ServerActionResult<ImportStats>>;
  onExcel: (bytes: ArrayBuffer) => Promise<ServerActionResult<ImportStats>>;
};

export function ImportForm({ onJson, onExcel }: Props) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [stats, setStats] = useState<ImportStats | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [fileName, setFileName] = useState<string | null>(null);

  function handleFile(file: File) {
    setErreur(null);
    setStats(null);
    setFileName(file.name);
    const format = detectFormatImport(file.name);
    if (!format) {
      setErreur('Format non supporté. Utilise un fichier .json, .xlsx ou .csv.');
      return;
    }
    startTransition(async () => {
      try {
        if (format === 'json') {
          const text = await file.text();
          const r = await onJson(text);
          if (r.ok) {
            setStats(r.data);
            toast.success(`${r.data.inserted} pointages importés.`);
            router.refresh();
          } else {
            setErreur(r.error);
            toast.error(r.error);
          }
        } else {
          const buf = await file.arrayBuffer();
          const r = await onExcel(buf);
          if (r.ok) {
            setStats(r.data);
            toast.success(`${r.data.inserted} pointages importés.`);
            router.refresh();
          } else {
            setErreur(r.error);
            toast.error(r.error);
          }
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Erreur inconnue';
        setErreur(msg);
        toast.error(msg);
      }
    });
  }

  return (
    <div className="grid max-w-2xl gap-4">
      <div
        onClick={() => inputRef.current?.click()}
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          e.preventDefault();
          const f = e.dataTransfer.files?.[0];
          if (f) handleFile(f);
        }}
        className="cursor-pointer rounded-lg border-2 border-dashed border-muted-foreground/30 p-8 text-center transition hover:border-foreground/50 hover:bg-muted/30"
      >
        <UploadIcon className="mx-auto mb-3 size-8 text-muted-foreground" />
        <p className="text-sm">
          Glisse un fichier ici ou{' '}
          <span className="text-foreground underline">clique pour parcourir</span>
        </p>
        <p className="mt-1 text-xs text-muted-foreground">
          Formats acceptés : .json (export Pointage), .xlsx, .csv
        </p>
        <input
          ref={inputRef}
          type="file"
          accept=".json,.xlsx,.csv"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) handleFile(f);
            e.target.value = '';
          }}
        />
      </div>

      {fileName && (
        <p className="text-xs text-muted-foreground">
          Fichier : <span className="font-mono">{fileName}</span>
          {isPending && ' — Traitement en cours…'}
        </p>
      )}

      {erreur && (
        <Alert variant="destructive">
          <AlertTitle>Erreur</AlertTitle>
          <AlertDescription>{erreur}</AlertDescription>
        </Alert>
      )}

      {stats && !erreur && (
        <Alert>
          <AlertTitle>Import terminé</AlertTitle>
          <AlertDescription>
            <ul className="mt-2 list-disc pl-5 text-sm">
              <li>
                <span className="font-semibold">{stats.inserted}</span> pointages insérés
              </li>
              <li>
                {stats.newEmployes} nouvel(s) employé(s), {stats.newChantiers} nouveau(x)
                chantier(s)
              </li>
              <li>{stats.skipped} ligne(s) ignorée(s) (sans collab/quantité/chantier)</li>
              {stats.invalidEmp > 0 && (
                <li className="text-amber-700">
                  ⚠ {stats.invalidEmp} ligne(s) sans employé mappable
                </li>
              )}
            </ul>
          </AlertDescription>
        </Alert>
      )}

      <div className="flex gap-2">
        <Button variant="outline" onClick={() => router.push('/rh/pointages')} disabled={isPending}>
          Voir les pointages
        </Button>
      </div>
    </div>
  );
}
