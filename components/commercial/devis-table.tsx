'use client';

import { CopyIcon } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';

import {
  DupliquerDevisDialog,
  type DupliquerMode,
} from '@/components/commercial/dupliquer-devis-dialog';
import { Button } from '@/components/ui/button';
import { DataTable, type DataTableColumn } from '@/components/ui/data-table';
import type { DevisAvecClient } from '@/lib/commercial/devis';
import { LIBELLES_STATUT_DEVIS, type StatutDevis } from '@/lib/validation/commercial';

function formatMontant(m: string): string {
  const n = Number(m);
  if (Number.isNaN(n)) return m;
  return n.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function classesPill(statut: StatutDevis): string {
  switch (statut) {
    case 'brouillon':
      return 'bg-muted text-muted-foreground';
    case 'en_validation':
      return 'bg-indigo-100 text-indigo-900';
    case 'refuse':
      return 'bg-orange-100 text-orange-900';
    case 'valide':
      return 'bg-sky-100 text-sky-900';
    case 'envoye':
      return 'bg-amber-100 text-amber-900';
    case 'gagne':
      return 'bg-emerald-100 text-emerald-900';
    case 'perdu':
      return 'bg-rose-100 text-rose-900';
    case 'annule':
      return 'bg-slate-200 text-slate-700';
  }
}

type Props = {
  items: DevisAvecClient[];
  rightActions?: React.ReactNode;
  peutEcrire: boolean;
  /** Server action qui duplique un devis (source id + mode). Si fourni et que
   *  `peutEcrire` est vrai, un bouton « Dupliquer » s'affiche dans la colonne
   *  Actions de chaque ligne, ouvrant <DupliquerDevisDialog>. */
  dupliquerAction?:
    | ((
        sourceId: string,
        mode: DupliquerMode,
      ) => Promise<{
        ok: boolean;
        error?: string;
        data?: { id: string; numero: string };
      }>)
    | undefined;
  /** Permission COMMERCIAL_DEVIS_VERSION : autorise « Nouvelle version pour ce
   *  client » dans le dialog de duplication. */
  peutVersionner?: boolean | undefined;
};

export function DevisTable({
  items,
  rightActions,
  peutEcrire,
  dupliquerAction,
  peutVersionner = false,
}: Props) {
  const router = useRouter();
  const [source, setSource] = useState<DevisAvecClient | null>(null);
  const peutDupliquer = peutEcrire && Boolean(dupliquerAction);
  const columns: DataTableColumn<DevisAvecClient>[] = [
    {
      id: 'numero',
      header: 'Numéro',
      cell: (d) => <span className="font-mono text-xs">{d.numero}</span>,
      sortAccessor: (d) => d.numero,
      searchAccessor: (d) => d.numero,
    },
    {
      id: 'date',
      header: 'Date',
      cell: (d) => <span className="text-xs">{d.dateDevis}</span>,
      sortAccessor: (d) => d.dateDevis,
    },
    {
      id: 'client',
      header: 'Client',
      cell: (d) => (
        <>
          <span className="text-xs text-muted-foreground">{d.clientCode}</span> {d.clientNom}
        </>
      ),
      sortAccessor: (d) => d.clientNom,
      searchAccessor: (d) => `${d.clientCode} ${d.clientNom}`,
    },
    {
      id: 'objet',
      header: 'Objet',
      cell: (d) => <span className="text-xs text-muted-foreground">{d.objet ?? '—'}</span>,
      sortAccessor: (d) => d.objet,
      searchAccessor: (d) => d.objet ?? '',
    },
    {
      id: 'statut',
      header: 'Statut',
      cell: (d) => (
        <span className={`rounded-full px-2 py-0.5 text-xs ${classesPill(d.statut as StatutDevis)}`}>
          {LIBELLES_STATUT_DEVIS[d.statut as StatutDevis]}
        </span>
      ),
      sortAccessor: (d) => LIBELLES_STATUT_DEVIS[d.statut as StatutDevis],
      searchAccessor: (d) => LIBELLES_STATUT_DEVIS[d.statut as StatutDevis],
    },
    {
      id: 'total',
      header: 'Total TTC (€)',
      align: 'right',
      cell: (d) => <span className="tabular-nums">{formatMontant(d.totalTtc)}</span>,
      sortAccessor: (d) => Number(d.totalTtc),
    },
    {
      id: 'actions',
      header: 'Actions',
      align: 'right',
      cell: (d) => (
        <div className="flex items-center justify-end gap-3">
          {peutDupliquer && (
            <Button
              variant="ghost"
              size="sm"
              type="button"
              onClick={() => setSource(d)}
              aria-label={`Dupliquer ${d.numero}`}
              className="h-7 gap-1.5 px-2 text-xs"
            >
              <CopyIcon className="size-3.5" aria-hidden="true" />
              Dupliquer
            </Button>
          )}
          <Link href={`/commercial/devis/${d.id}`} className="text-sm underline underline-offset-4">
            {peutEcrire ? 'Ouvrir' : 'Voir'}
          </Link>
        </div>
      ),
    },
  ];

  return (
    <>
      <DataTable
        columns={columns}
        rows={items}
        rowKey={(d) => d.id}
        rowHref={(d) => `/commercial/devis/${d.id}`}
        searchPlaceholder="Rechercher un devis…"
        emptyMessage={
          peutEcrire ? 'Aucun devis. Crée le premier via le bouton ci-dessus.' : 'Aucun devis.'
        }
        rightActions={rightActions}
        defaultSort={{ id: 'date', dir: 'desc' }}
      />
      {peutDupliquer && source && (
        <DupliquerDevisDialog
          open
          onClose={() => setSource(null)}
          action={(mode) => dupliquerAction!(source.id, mode)}
          peutVersionner={peutVersionner}
          onSuccess={() => {
            router.refresh();
          }}
        />
      )}
    </>
  );
}
