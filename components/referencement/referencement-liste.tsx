'use client';

import { SendIcon } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useMemo, useState, useTransition } from 'react';
import { toast } from 'sonner';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { DataTable, type DataTableColumn } from '@/components/ui/data-table';
import { FormSection } from '@/components/ui/form-section';
import type { TierConformiteRow } from '@/lib/referencement/registre';
import { relancerTiersEnMasse } from '@/lib/referencement/relances';
import { LIBELLES_NATURE_TIERS } from '@/lib/validation/referencement-tiers';

import { RelanceButton } from './relance-button';
import { StatutAgrementBadge } from './statut-agrement-badge';
import { StatutDocumentPastille } from './statut-document-pastille';

type Props = {
  slug: string;
  tiers: TierConformiteRow[];
  peutRelancer: boolean;
};

function DocumentsCell({ row }: { row: TierConformiteRow }) {
  if (row.nbDocumentsRequis === 0) {
    return <span className="text-xs text-muted-foreground">Aucun document requis</span>;
  }
  const problemes = row.lignes.filter((l) => l.statut !== 'a_jour');
  if (problemes.length === 0) {
    return (
      <Badge tone="emerald" shape="pill">
        Tous à jour ({row.nbDocumentsRequis})
      </Badge>
    );
  }
  const visibles = problemes.slice(0, 4);
  const reste = problemes.length - visibles.length;
  return (
    <div className="flex flex-wrap gap-1">
      {visibles.map((l) => (
        <StatutDocumentPastille key={l.natureDocumentId} statut={l.statut} libelle={l.libelle} />
      ))}
      {reste > 0 && <span className="text-xs text-muted-foreground">+{reste}</span>}
    </div>
  );
}

function colonnesCommunes(): DataTableColumn<TierConformiteRow>[] {
  return [
    {
      id: 'nom',
      header: 'Société',
      cell: (t) => (
        <div className="min-w-0">
          <div className="truncate font-medium">{t.nom}</div>
          <div className="font-mono text-xs text-muted-foreground">{t.code}</div>
        </div>
      ),
      sortAccessor: (t) => t.nom,
      searchAccessor: (t) => `${t.nom} ${t.code}`,
    },
    {
      id: 'nature',
      header: 'Nature',
      cell: (t) => (
        <span className="text-sm text-muted-foreground">
          {LIBELLES_NATURE_TIERS[t.natureTiers]}
        </span>
      ),
      sortAccessor: (t) => t.natureTiers,
    },
    {
      id: 'siren',
      header: 'SIREN',
      cell: (t) =>
        t.siret ? (
          <span className="font-mono text-xs" title={`SIRET ${t.siret}`}>
            {t.siret.slice(0, 9)}
          </span>
        ) : (
          <span className="text-muted-foreground">—</span>
        ),
      searchAccessor: (t) => t.siret,
    },
    {
      id: 'statut',
      header: 'Agrément',
      cell: (t) => <StatutAgrementBadge statut={t.statutAgrement} />,
      sortAccessor: (t) => t.statutAgrement,
    },
    {
      id: 'documents',
      header: 'Documents',
      cell: (t) => <DocumentsCell row={t} />,
    },
  ];
}

export function ReferencementListe({ slug, tiers, peutRelancer }: Props) {
  const router = useRouter();
  const [selection, setSelection] = useState<Set<string>>(new Set());
  const [pending, startTransition] = useTransition();

  const aRelancer = useMemo(() => tiers.filter((t) => t.classe === 'a_relancer'), [tiers]);
  const aJour = useMemo(() => tiers.filter((t) => t.classe === 'a_jour'), [tiers]);

  function toggle(id: string) {
    setSelection((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }
  function toggleTous() {
    setSelection((prev) =>
      prev.size === aRelancer.length ? new Set() : new Set(aRelancer.map((t) => t.id)),
    );
  }

  function relancerSelection() {
    const ids = [...selection];
    if (ids.length === 0) return;
    startTransition(async () => {
      const res = await relancerTiersEnMasse(ids);
      if (res.ok) {
        toast.success(
          `${res.data.envoyees} relance(s) enregistrée(s)` +
            (res.data.ignores > 0 ? `, ${res.data.ignores} ignorée(s).` : '.'),
        );
        setSelection(new Set());
        router.refresh();
      } else {
        toast.error(res.error);
      }
    });
  }

  const colonnesARelancer: DataTableColumn<TierConformiteRow>[] = [
    ...(peutRelancer
      ? [
          {
            id: 'select',
            header: (
              <input
                type="checkbox"
                aria-label="Tout sélectionner"
                checked={aRelancer.length > 0 && selection.size === aRelancer.length}
                onChange={toggleTous}
                className="size-4 accent-amber-600"
              />
            ),
            cell: (t: TierConformiteRow) => (
              <input
                type="checkbox"
                aria-label={`Sélectionner ${t.nom}`}
                checked={selection.has(t.id)}
                onChange={() => toggle(t.id)}
                className="size-4 accent-amber-600"
              />
            ),
            className: 'w-8',
            headerClassName: 'w-8',
          } satisfies DataTableColumn<TierConformiteRow>,
        ]
      : []),
    ...colonnesCommunes(),
    {
      id: 'derniere_relance',
      header: 'Dernière relance',
      cell: (t) =>
        t.derniereRelanceLe ? (
          <span className="text-xs text-muted-foreground">
            {new Date(t.derniereRelanceLe).toLocaleDateString('fr-FR')}
          </span>
        ) : (
          <span className="text-xs text-muted-foreground">Jamais</span>
        ),
      sortAccessor: (t) => t.derniereRelanceLe ?? '',
    },
    ...(peutRelancer
      ? [
          {
            id: 'actions',
            header: '',
            cell: (t: TierConformiteRow) => <RelanceButton tierId={t.id} size="xs" />,
            align: 'right',
          } satisfies DataTableColumn<TierConformiteRow>,
        ]
      : []),
  ];

  const colonnesAJour: DataTableColumn<TierConformiteRow>[] = [
    ...colonnesCommunes(),
    {
      id: 'derniere_relance',
      header: 'Dernière relance',
      cell: (t) =>
        t.derniereRelanceLe ? (
          <span className="text-xs text-muted-foreground">
            {new Date(t.derniereRelanceLe).toLocaleDateString('fr-FR')}
          </span>
        ) : (
          <span className="text-xs text-muted-foreground">—</span>
        ),
      sortAccessor: (t) => t.derniereRelanceLe ?? '',
    },
  ];

  const rowHref = (t: TierConformiteRow) => `/${slug}/tiers/referencement/${t.id}`;

  return (
    <div className="space-y-6">
      <FormSection
        title={`À relancer (${aRelancer.length})`}
        description="Tiers ayant au moins un document manquant, expiré, bientôt expiré, refusé ou en attente de validation."
        defaultOpen
        storageKey="referencement-a-relancer"
        rightSlot={
          peutRelancer && selection.size > 0 ? (
            <Button
              type="button"
              size="sm"
              disabled={pending}
              onClick={relancerSelection}
              data-no-row-nav
            >
              <SendIcon className="mr-1 size-4" />
              {pending ? 'Relance…' : `Relancer la sélection (${selection.size})`}
            </Button>
          ) : null
        }
      >
        <DataTable
          columns={colonnesARelancer}
          rows={aRelancer}
          rowKey={(t) => t.id}
          rowHref={rowHref}
          rowClassName={() => 'bg-rose-50/30 hover:bg-rose-50/60 dark:bg-rose-950/10'}
          defaultSort={{ id: 'nom', dir: 'asc' }}
          searchPlaceholder="Rechercher un tier…"
          emptyMessage="Aucun tier à relancer 🎉"
        />
      </FormSection>

      <FormSection
        title={`À jour (${aJour.length})`}
        description="Tiers dont tous les documents requis sont valides."
        defaultOpen={false}
        storageKey="referencement-a-jour"
      >
        <DataTable
          columns={colonnesAJour}
          rows={aJour}
          rowKey={(t) => t.id}
          rowHref={rowHref}
          defaultSort={{ id: 'nom', dir: 'asc' }}
          searchPlaceholder="Rechercher un tier…"
          emptyMessage="Aucun tier à jour pour le moment."
        />
      </FormSection>
    </div>
  );
}
