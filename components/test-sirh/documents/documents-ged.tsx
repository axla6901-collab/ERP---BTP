'use client';

import { PencilIcon, PenLineIcon, UploadIcon } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useMemo, useState } from 'react';

import { BoutonConfirmation } from '@/components/test-sirh/bouton-confirmation';
import { OptionSelect, type OptionListe } from '@/components/test-sirh/option-select';
import { TelechargementDocument } from '@/components/test-sirh/telechargement-document';
import type { ActionsTeleversement } from '@/components/test-sirh/televersement-document';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { DataTable, type DataTableColumn } from '@/components/ui/data-table';
import type { ActionResult } from '@/lib/common/action-result';
import type { DocumentGedLigne } from '@/lib/test-sirh/documents/queries';
import { statutExpiration, statutSignature, urlDocuments } from '@/lib/test-sirh/documents/regles';
import { formatDateFr, formatTaille } from '@/lib/test-sirh/format';
import type { DocumentMetadonneesInput } from '@/lib/validation/test-sirh/documents';

import { ExpirationDocument, SignatureDocument } from './badges-document';
import { DocumentMetadonneesDialog } from './document-metadonnees-dialog';
import {
  DocumentTeleversementDialog,
  type OptionDossierGed,
} from './document-televersement-dialog';
import type { ResultatUrlDocumentSirh } from './documents-liste';

/** Valeur du filtre « concerné » : uuid d'un employé, `'entreprise'`, ou null (tous). */
const ENTREPRISE = 'entreprise';

export type ActionsDocumentsGed = {
  modifier: (input: DocumentMetadonneesInput) => Promise<ActionResult<{ id: string }>>;
  supprimer: (id: string) => Promise<ActionResult>;
  signer: (id: string) => Promise<ActionResult>;
  urlTelechargement: (id: string) => Promise<ResultatUrlDocumentSirh>;
  televersement: ActionsTeleversement;
};

type Props = {
  documents: DocumentGedLigne[];
  /** Date du jour (serveur). */
  today: string;
  peutGerer: boolean;
  /** URL de la GED (`/<slug>/test-sirh/documents`) et filtres d'URL courants. */
  base: string;
  filtreDossier?: string | undefined;
  filtreConcerne?: string | undefined;
  employes: readonly OptionListe[];
  dossiers: readonly OptionDossierGed[];
  actions: ActionsDocumentsGed;
};

/**
 * Tableau de la GED RH : titre, salarié ou « Entreprise », dossier, dates,
 * expiration (badges), visibilité, signature, taille — et, pour la gestion RH,
 * téléversement, modification des métadonnées, « Marquer signé », suppression.
 */
export function DocumentsGed({
  documents,
  today,
  peutGerer,
  base,
  filtreDossier,
  filtreConcerne,
  employes,
  dossiers,
  actions,
}: Props) {
  const router = useRouter();
  const [televersementOuvert, setTeleversementOuvert] = useState(false);
  const [edite, setEdite] = useState<DocumentGedLigne | null>(null);

  const optionsConcerne = useMemo(
    () => [{ id: ENTREPRISE, label: 'Documents d’entreprise' }, ...employes],
    [employes],
  );
  const dossierCourant = dossiers.some((d) => d.id === filtreDossier) ? filtreDossier : null;
  const employeCourant = filtreConcerne && filtreConcerne !== ENTREPRISE ? filtreConcerne : null;
  const initiales = useMemo(
    () => ({
      cibleType: filtreConcerne === ENTREPRISE ? ('entreprise' as const) : ('employe' as const),
      employeId: employeCourant,
      dossierId: dossierCourant ?? null,
    }),
    [filtreConcerne, employeCourant, dossierCourant],
  );

  const colonnes: DataTableColumn<DocumentGedLigne>[] = [
    {
      id: 'titre',
      header: 'Document',
      cell: (d) => (
        <div className="min-w-0">
          <span className="block font-medium">{d.titre}</span>
          {d.notes && (
            <span className="block max-w-xs truncate text-xs text-muted-foreground" title={d.notes}>
              {d.notes}
            </span>
          )}
        </div>
      ),
      sortAccessor: (d) => d.titre,
      searchAccessor: (d) => `${d.titre} ${d.notes ?? ''}`,
    },
    {
      id: 'concerne',
      header: 'Concerne',
      cell: (d) =>
        d.employeNom ? (
          <span>{d.employeNom}</span>
        ) : (
          <Badge tone="violet" shape="pill">
            Entreprise
          </Badge>
        ),
      sortAccessor: (d) => d.employeNom ?? '',
      searchAccessor: (d) => d.employeNom ?? 'Entreprise',
    },
    {
      id: 'dossier',
      header: 'Dossier',
      cell: (d) => d.dossierNom ?? <span className="text-muted-foreground">—</span>,
      sortAccessor: (d) => d.dossierNom,
      searchAccessor: (d) => d.dossierNom,
    },
    {
      id: 'date',
      header: 'Date',
      cell: (d) => (
        <span className="tabular-nums">{formatDateFr(d.dateDocument ?? d.createdAt)}</span>
      ),
      sortAccessor: (d) => d.dateDocument ?? d.createdAt.slice(0, 10),
    },
    {
      id: 'expiration',
      header: 'Expiration',
      cell: (d) => <ExpirationDocument dateExpiration={d.dateExpiration} today={today} />,
      sortAccessor: (d) => d.dateExpiration,
    },
    {
      id: 'visible',
      header: 'Salarié',
      cell: (d) =>
        d.visibleSalarie ? (
          <Badge tone="emerald" shape="pill">
            Visible
          </Badge>
        ) : (
          <Badge tone="neutral" shape="pill">
            Masqué
          </Badge>
        ),
      sortAccessor: (d) => (d.visibleSalarie ? 0 : 1),
    },
    {
      id: 'signature',
      header: 'Signature',
      cell: (d) => <SignatureDocument signatureRequise={d.signatureRequise} signeLe={d.signeLe} />,
      sortAccessor: (d) => statutSignature(d),
    },
    {
      id: 'taille',
      header: 'Taille',
      align: 'right',
      cell: (d) => <span className="tabular-nums">{formatTaille(d.tailleBytes)}</span>,
      sortAccessor: (d) => d.tailleBytes,
    },
    {
      id: 'actions',
      header: '',
      align: 'right',
      cell: (d) => (
        <div className="flex items-center justify-end gap-1">
          <TelechargementDocument
            documentId={d.id}
            obtenirUrl={actions.urlTelechargement}
            libelle={`Télécharger ${d.titre}`}
            compact
          />
          {peutGerer && statutSignature(d) === 'a_signer' && (
            <BoutonConfirmation
              libelle={
                <>
                  <PenLineIcon className="size-3.5" /> Signé
                </>
              }
              question="Marquer signé aujourd’hui ?"
              libelleConfirmer="Marquer signé"
              messageSucces="Document marqué signé"
              variante="default"
              title="Marquer signé"
              onConfirm={() => actions.signer(d.id)}
            />
          )}
          {peutGerer && (
            <>
              <Button
                variant="ghost"
                size="sm"
                className="h-7 w-7 p-0"
                onClick={() => setEdite(d)}
                title="Modifier"
                aria-label={`Modifier ${d.titre}`}
              >
                <PencilIcon className="size-3.5" />
              </Button>
              <BoutonConfirmation
                libelle="Supprimer"
                question="Supprimer ce document ?"
                libelleConfirmer="Supprimer"
                messageSucces="Document supprimé"
                onConfirm={() => actions.supprimer(d.id)}
              />
            </>
          )}
        </div>
      ),
    },
  ];

  return (
    <>
      <DataTable
        columns={colonnes}
        rows={documents}
        rowKey={(d) => d.id}
        searchPlaceholder="Rechercher un document…"
        emptyMessage="Aucun document pour ces critères."
        defaultSort={{ id: 'date', dir: 'desc' }}
        rowClassName={(d) =>
          statutExpiration(d.dateExpiration, today) === 'expire'
            ? 'bg-rose-50/40 dark:bg-rose-950/10'
            : undefined
        }
        rightActions={
          <>
            <div className="w-56">
              <OptionSelect
                options={optionsConcerne}
                value={filtreConcerne ?? null}
                onChange={(v) =>
                  router.push(
                    urlDocuments(base, { dossier: filtreDossier, employe: v ?? undefined }),
                  )
                }
                libelleAucune="Tous les documents"
                aria-label="Filtrer par collaborateur"
              />
            </div>
            {peutGerer && (
              <Button size="sm" onClick={() => setTeleversementOuvert(true)}>
                <UploadIcon className="mr-1 size-4" /> Téléverser
              </Button>
            )}
          </>
        }
      />
      {peutGerer && (
        <>
          <DocumentTeleversementDialog
            open={televersementOuvert}
            onOpenChange={setTeleversementOuvert}
            employes={employes}
            dossiers={dossiers}
            initiales={initiales}
            actions={actions.televersement}
          />
          <DocumentMetadonneesDialog
            documentEdite={edite}
            onClose={() => setEdite(null)}
            dossiers={dossiers}
            onSubmit={actions.modifier}
          />
        </>
      )}
    </>
  );
}
