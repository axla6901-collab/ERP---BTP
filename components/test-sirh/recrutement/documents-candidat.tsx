'use client';

import { FileTextIcon } from 'lucide-react';
import { toast } from 'sonner';

import { BoutonConfirmation } from '@/components/test-sirh/bouton-confirmation';
import { SirhVide } from '@/components/test-sirh/sirh-bloc';
import { TelechargementDocument } from '@/components/test-sirh/telechargement-document';
import {
  TeleversementDocument,
  type ActionsTeleversement,
} from '@/components/test-sirh/televersement-document';
import type { ActionResult } from '@/lib/common/action-result';
import { formatDateFr, formatTaille } from '@/lib/test-sirh/format';
import type { CandidatFiche } from '@/lib/test-sirh/recrutement/queries';

/** Formats acceptés pour un CV / une pièce de candidature. */
const FORMATS_CV =
  'application/pdf,image/*,.doc,.docx,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document';

type Props = {
  candidatId: string;
  documents: CandidatFiche['documents'];
  /** Dépôt / suppression (gestion RH). */
  peutGerer: boolean;
  /** Téléchargement (contrôlé côté serveur : gestion RH et paie). */
  peutTelecharger: boolean;
  actions: ActionsTeleversement & {
    obtenirUrl: (
      id: string,
    ) => Promise<{ ok: true; url: string; titre: string } | { ok: false; error: string }>;
    supprimer: (id: string) => Promise<ActionResult>;
  };
};

/** CV et pièces d'un candidat (stockage MinIO du SIRH, cible « candidat »). */
export function DocumentsCandidat({
  candidatId,
  documents,
  peutGerer,
  peutTelecharger,
  actions,
}: Props) {
  return (
    <div className="space-y-3">
      {documents.length === 0 ? (
        <SirhVide>Aucun CV ni pièce jointe.</SirhVide>
      ) : (
        <ul className="divide-y rounded-lg border">
          {documents.map((d) => (
            <li key={d.id} className="flex flex-wrap items-center justify-between gap-2 p-2">
              <div className="flex min-w-0 items-center gap-2">
                <FileTextIcon className="size-4 shrink-0 text-orange-700" aria-hidden="true" />
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">{d.titre}</p>
                  <p className="text-xs text-muted-foreground">
                    {formatTaille(d.tailleBytes)} · ajouté le {formatDateFr(d.createdAt)}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-1">
                {peutTelecharger && (
                  <TelechargementDocument
                    documentId={d.id}
                    obtenirUrl={actions.obtenirUrl}
                    libelle={`Télécharger ${d.titre}`}
                    compact
                  />
                )}
                {peutGerer && (
                  <BoutonConfirmation
                    libelle="Supprimer"
                    question="Supprimer ce document ?"
                    libelleConfirmer="Supprimer"
                    messageSucces="Document supprimé"
                    onConfirm={() => actions.supprimer(d.id)}
                  />
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
      {peutGerer && (
        <TeleversementDocument
          cible={{ type: 'candidat', id: candidatId }}
          actions={{ preparerUpload: actions.preparerUpload, creerDocument: actions.creerDocument }}
          libelleBouton="Joindre un CV / une pièce"
          accept={FORMATS_CV}
          onTeleverse={(doc) => {
            toast.success(`« ${doc.titre} » ajouté`);
          }}
        />
      )}
    </div>
  );
}
