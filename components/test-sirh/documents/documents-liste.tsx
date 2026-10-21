'use client';

import { FileTextIcon, PenLineIcon } from 'lucide-react';
import { useTransition } from 'react';
import { toast } from 'sonner';

import { SirhVide } from '@/components/test-sirh/sirh-bloc';
import { TelechargementDocument } from '@/components/test-sirh/telechargement-document';
import { Button } from '@/components/ui/button';
import type { ActionResult } from '@/lib/common/action-result';
import { statutSignature } from '@/lib/test-sirh/documents/regles';
import { formatDateFr, formatTaille } from '@/lib/test-sirh/format';

import { ExpirationDocument, SignatureDocument } from './badges-document';

/**
 * Document affiché (structure commune à `listerDocumentsEmployeSirh`,
 * `listerDocumentsEntrepriseVisibles` et la GED).
 */
export type DocumentListeItem = {
  id: string;
  titre: string;
  dossierId: string | null;
  /** Nom du dossier ; sinon résolu via `dossiers`. */
  dossierNom?: string | null | undefined;
  mimeType: string;
  tailleBytes: number | null;
  dateDocument: string | null;
  dateExpiration: string | null;
  signatureRequise: boolean;
  signeLe: string | null;
  createdAt: string;
};

export type ResultatUrlDocumentSirh =
  | { ok: true; url: string; titre: string }
  | { ok: false; error: string };

type Props = {
  documents: readonly DocumentListeItem[];
  /** Date du jour (serveur) pour les badges d'expiration. */
  today: string;
  /** `urlTelechargementDocumentSirh` (wrapper `'use server'`). */
  obtenirUrl: (id: string) => Promise<ResultatUrlDocumentSirh>;
  /** Dossiers (`listerDossiersDocumentsOptions`) pour afficher le nom du dossier. */
  dossiers?: readonly { id: string; label: string }[];
  /** Accusé de signature (`marquerDocumentSigne`) : bouton « Signer » sur les documents à signer. */
  onSigner?: (id: string) => Promise<ActionResult>;
  emptyMessage?: string;
};

function BoutonSigner({
  id,
  onSigner,
}: {
  id: string;
  onSigner: (id: string) => Promise<ActionResult>;
}) {
  const [isPending, startTransition] = useTransition();
  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      disabled={isPending}
      onClick={() =>
        startTransition(async () => {
          const r = await onSigner(id);
          if (r.ok) {
            toast.success('Document marqué signé');
          } else {
            toast.error(r.error);
          }
        })
      }
    >
      <PenLineIcon className="size-3.5" /> {isPending ? 'En cours…' : 'Signer'}
    </Button>
  );
}

/**
 * Liste de documents en LECTURE (titre, dossier, dates, signature, taille) avec
 * téléchargement — réutilisable dans Mon espace et le dossier collaborateur.
 */
export function DocumentsListe({
  documents,
  today,
  obtenirUrl,
  dossiers = [],
  onSigner,
  emptyMessage = 'Aucun document.',
}: Props) {
  if (documents.length === 0) return <SirhVide>{emptyMessage}</SirhVide>;
  const nomsDossiers = new Map(dossiers.map((d) => [d.id, d.label]));

  return (
    <ul className="divide-y rounded-md border">
      {documents.map((d) => {
        const dossier =
          d.dossierNom ?? (d.dossierId ? nomsDossiers.get(d.dossierId) : null) ?? null;
        const aSigner = statutSignature(d) === 'a_signer';
        return (
          <li key={d.id} className="flex flex-wrap items-center gap-3 px-4 py-2.5 text-sm">
            <FileTextIcon className="size-4 shrink-0 text-orange-700" aria-hidden="true" />
            <div className="min-w-0 flex-1">
              <span className="block truncate font-medium">{d.titre}</span>
              <span className="block text-xs text-muted-foreground">
                {[
                  dossier,
                  d.dateDocument
                    ? `du ${formatDateFr(d.dateDocument)}`
                    : `déposé le ${formatDateFr(d.createdAt)}`,
                  formatTaille(d.tailleBytes) !== '—' ? formatTaille(d.tailleBytes) : null,
                ]
                  .filter(Boolean)
                  .join(' · ')}
              </span>
            </div>
            {d.dateExpiration && (
              <span className="text-xs">
                <ExpirationDocument dateExpiration={d.dateExpiration} today={today} />
              </span>
            )}
            {(d.signatureRequise || d.signeLe) && (
              <SignatureDocument signatureRequise={d.signatureRequise} signeLe={d.signeLe} />
            )}
            {aSigner && onSigner && <BoutonSigner id={d.id} onSigner={onSigner} />}
            <TelechargementDocument
              documentId={d.id}
              obtenirUrl={obtenirUrl}
              libelle={d.titre}
              compact
            />
          </li>
        );
      })}
    </ul>
  );
}
