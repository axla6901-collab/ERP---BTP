'use client';

import { Badge, type BadgeTone } from '@/components/ui/badge';
import { DataTable, type DataTableColumn } from '@/components/ui/data-table';
import type { CompteProrataSommaire } from '@/lib/chantiers/compte-prorata-actions';

type Statut = CompteProrataSommaire['statut'];

const STATUT_LABEL: Record<Statut, string> = {
  ouvert: 'Ouvert',
  cloture: 'Clôturé',
  arrete: 'Arrêté',
};
const STATUT_TONE: Record<Statut, BadgeTone> = {
  ouvert: 'amber',
  cloture: 'neutral',
  arrete: 'emerald',
};

function fmtEur(s: string): string {
  const n = Number(s);
  if (!Number.isFinite(n)) return s;
  return `${n.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €`;
}

type Props = {
  comptes: CompteProrataSommaire[];
  entrepriseSlug: string;
};

export function ComptesProrataListe({ comptes, entrepriseSlug }: Props) {
  const columns: DataTableColumn<CompteProrataSommaire>[] = [
    {
      id: 'numero',
      header: 'Chantier',
      searchAccessor: (c) => `${c.chantierNumero} ${c.chantierLibelle}`,
      sortAccessor: (c) => c.chantierNumero,
      cell: (c) => (
        <div className="flex flex-col">
          <span className="font-mono text-xs text-muted-foreground">{c.chantierNumero}</span>
          <span className="font-medium">{c.chantierLibelle}</span>
        </div>
      ),
    },
    {
      id: 'statut',
      header: 'Statut',
      sortAccessor: (c) => c.statut,
      cell: (c) => <Badge tone={STATUT_TONE[c.statut]}>{STATUT_LABEL[c.statut]}</Badge>,
    },
    {
      id: 'participants',
      header: 'Participants',
      align: 'right',
      sortAccessor: (c) => c.nbParticipants,
      cell: (c) => <span className="tabular-nums">{c.nbParticipants}</span>,
    },
    {
      id: 'depenses',
      header: 'Dépenses communes',
      align: 'right',
      sortAccessor: (c) => Number(c.totalDepensesHt),
      cell: (c) => <span className="tabular-nums">{fmtEur(c.totalDepensesHt)}</span>,
    },
  ];

  return (
    <DataTable
      columns={columns}
      rows={comptes}
      rowKey={(c) => c.id}
      searchPlaceholder="Rechercher un chantier…"
      emptyMessage="Aucun compte prorata. Ouvrez-en un depuis l'onglet « Compte prorata » d'une fiche chantier."
      defaultSort={{ id: 'numero', dir: 'asc' }}
      rowHref={(c) => `/${entrepriseSlug}/chantiers/${c.chantierId}?tab=compte-prorata`}
    />
  );
}
