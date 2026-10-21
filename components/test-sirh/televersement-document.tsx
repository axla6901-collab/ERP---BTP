'use client';

import { PaperclipIcon } from 'lucide-react';
import { useRef, useState, useTransition } from 'react';

import { Button } from '@/components/ui/button';
import type { CibleDocumentSirh, DocumentSirhInput } from '@/lib/test-sirh/stockage';

export type ActionsTeleversement = {
  preparerUpload: (
    cible: CibleDocumentSirh,
    contentType: string,
    filename: string,
    tailleBytes: number,
  ) => Promise<
    { ok: true; data: { uploadUrl: string; minioKey: string } } | { ok: false; error: string }
  >;
  creerDocument: (
    input: DocumentSirhInput,
  ) => Promise<
    | { ok: true; data: { id: string; titre: string } }
    | { ok: false; error: string; fieldErrors?: Record<string, string[]> }
  >;
};

type Props = {
  cible: CibleDocumentSirh;
  actions: ActionsTeleversement;
  /** Appelé avec le document créé (id + titre) une fois l'upload terminé. */
  onTeleverse: (doc: { id: string; titre: string }) => void;
  /** Métadonnées optionnelles du document créé. */
  dossierId?: string | null;
  visibleSalarie?: boolean;
  titre?: string;
  libelleBouton?: string;
  accept?: string;
  disabled?: boolean;
};

/**
 * Téléversement d'un fichier vers MinIO en 2 étapes (URL présignée → PUT →
 * métadonnées), réutilisable pour les justificatifs (absence, note de frais),
 * les CV et la GED. Le titre par défaut est le nom du fichier sans extension.
 */
export function TeleversementDocument({
  cible,
  actions,
  onTeleverse,
  dossierId = null,
  visibleSalarie = false,
  titre,
  libelleBouton = 'Joindre un fichier',
  accept = 'application/pdf,image/*',
  disabled,
}: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [isPending, startTransition] = useTransition();
  const [erreur, setErreur] = useState<string | null>(null);

  function televerser(fichier: File) {
    setErreur(null);
    startTransition(async () => {
      const type = fichier.type || 'application/octet-stream';
      const prep = await actions.preparerUpload(cible, type, fichier.name, fichier.size);
      if (!prep.ok) {
        setErreur(prep.error);
        return;
      }
      try {
        const res = await fetch(prep.data.uploadUrl, {
          method: 'PUT',
          body: fichier,
          headers: { 'Content-Type': type },
        });
        if (!res.ok) {
          setErreur(`Envoi du fichier en échec (HTTP ${res.status}).`);
          return;
        }
      } catch (err) {
        setErreur(
          'Envoi du fichier impossible : ' + (err instanceof Error ? err.message : 'erreur'),
        );
        return;
      }
      const r = await actions.creerDocument({
        cible,
        titre: (titre ?? fichier.name.replace(/\.[^.]+$/, '')).slice(0, 200) || 'Document',
        minioKey: prep.data.minioKey,
        mimeType: type,
        tailleBytes: fichier.size,
        dossierId,
        dateDocument: null,
        dateExpiration: null,
        visibleSalarie,
        signatureRequise: false,
        notes: null,
      });
      if (!r.ok) {
        setErreur(r.error);
        return;
      }
      onTeleverse(r.data);
      if (inputRef.current) inputRef.current.value = '';
    });
  }

  return (
    <div className="space-y-1">
      <input
        ref={inputRef}
        type="file"
        accept={accept}
        className="hidden"
        data-testid="televersement-input"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) televerser(f);
        }}
      />
      <Button
        type="button"
        variant="outline"
        size="sm"
        disabled={disabled || isPending}
        onClick={() => inputRef.current?.click()}
      >
        <PaperclipIcon className="mr-1 size-4" />
        {isPending ? 'Envoi…' : libelleBouton}
      </Button>
      {erreur && <p className="text-xs text-destructive">{erreur}</p>}
    </div>
  );
}
