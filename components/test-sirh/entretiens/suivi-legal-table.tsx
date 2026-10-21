'use client';

import { PlusIcon } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useMemo, useState, useTransition } from 'react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { DataTable, type DataTableColumn } from '@/components/ui/data-table';
import { FilterPills } from '@/components/ui/filter-pills';
import type { ActionResult } from '@/lib/common/action-result';
import type { StatutEcheanceEntretien } from '@/lib/test-sirh/entretiens/echeances';
import { formatDateFr } from '@/lib/test-sirh/format';
import type { NouvelEntretienInput } from '@/lib/validation/test-sirh/entretiens';
import type { TypeEntretien } from '@/lib/validation/test-sirh/enums';

import { LIBELLES_COURTS_TYPE_ENTRETIEN, StatutEcheanceBadge } from './badges';

/** Ligne du suivi légal (sérialisable, calculée côté serveur). */
export type SuiviLigneUI = {
  employeId: string;
  /** « Prénom Nom ». */
  employeNom: string;
  employeTri: string;
  matricule: string | null;
  managerId: string | null;
  managerNom: string | null;
  dateEntree: string | null;
  dernierEntretien: string | null;
  dernierEntretienId: string | null;
  prochaineEcheance: string | null;
  joursRestants: number | null;
  statut: StatutEcheanceEntretien;
  echeanceBilan: string | null;
  statutBilan: StatutEcheanceEntretien | null;
  entretienPlanifie: {
    id: string;
    typeEntretien: TypeEntretien;
    datePrevue: string | null;
  } | null;
};

type FiltreSuivi = 'tous' | StatutEcheanceEntretien;

type Props = {
  lignes: SuiviLigneUI[];
  /** Préfixe `/<slug>/test-sirh`. */
  base: string;
  peutGerer: boolean;
  creerEntretien: (input: NouvelEntretienInput) => Promise<ActionResult<{ id: string }>>;
};

/** `-12` → `12 j de retard`, `30` → `dans 30 j`. */
function libelleJours(j: number | null): string | null {
  if (j === null) return null;
  if (j < 0) return `${-j} j de retard`;
  if (j === 0) return 'aujourd’hui';
  return `dans ${j} j`;
}

/**
 * Suivi de l'obligation d'entretien professionnel (art. L6315-1 C. trav.) :
 * dernier entretien, prochaine échéance (2 ans), état des lieux à 6 ans, et
 * création directe de l'entretien manquant (RH).
 */
export function SuiviLegalTable({ lignes, base, peutGerer, creerEntretien }: Props) {
  const router = useRouter();
  const [filtre, setFiltre] = useState<FiltreSuivi>('tous');
  const [enCours, setEnCours] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const compteurs = useMemo(() => {
    const c: Record<StatutEcheanceEntretien, number> = { a_jour: 0, a_planifier: 0, en_retard: 0 };
    for (const l of lignes) c[l.statut] += 1;
    return c;
  }, [lignes]);
  const affichees = filtre === 'tous' ? lignes : lignes.filter((l) => l.statut === filtre);

  function creer(l: SuiviLigneUI) {
    // Bilan à 6 ans dû (ou proche) : l'entretien fait l'état des lieux récapitulatif.
    const bilanDu = l.statutBilan !== null && l.statutBilan !== 'a_jour';
    setEnCours(l.employeId);
    startTransition(async () => {
      const r = await creerEntretien({
        campagneId: null,
        employeId: l.employeId,
        evaluateurId: l.managerId,
        typeEntretien: bilanDu ? 'bilan_6_ans' : 'professionnel',
        datePrevue: null,
      });
      setEnCours(null);
      if (r.ok) {
        toast.success('Entretien créé');
        router.push(`${base}/entretiens/${r.data.id}`);
      } else {
        toast.error(r.error);
      }
    });
  }

  const colonnes: DataTableColumn<SuiviLigneUI>[] = [
    {
      id: 'employe',
      header: 'Collaborateur',
      cell: (l) => (
        <div className="min-w-0">
          <span className="font-medium">{l.employeNom}</span>
          {l.managerNom && (
            <span className="block text-xs text-muted-foreground">Manager : {l.managerNom}</span>
          )}
        </div>
      ),
      sortAccessor: (l) => l.employeTri,
      searchAccessor: (l) => `${l.employeNom} ${l.matricule ?? ''} ${l.managerNom ?? ''}`,
    },
    {
      id: 'entree',
      header: 'Entrée',
      cell: (l) => <span className="tabular-nums">{formatDateFr(l.dateEntree)}</span>,
      sortAccessor: (l) => l.dateEntree,
    },
    {
      id: 'dernier',
      header: 'Dernier entretien pro.',
      cell: (l) =>
        l.dernierEntretien && l.dernierEntretienId ? (
          <Link
            href={`${base}/entretiens/${l.dernierEntretienId}`}
            className="tabular-nums underline-offset-2 hover:underline"
          >
            {formatDateFr(l.dernierEntretien)}
          </Link>
        ) : (
          <span className="text-muted-foreground">Aucun</span>
        ),
      sortAccessor: (l) => l.dernierEntretien,
    },
    {
      id: 'echeance',
      header: 'Prochaine échéance',
      cell: (l) => (
        <span className="whitespace-nowrap">
          <span className="tabular-nums">{formatDateFr(l.prochaineEcheance)}</span>
          {libelleJours(l.joursRestants) && (
            <span className="block text-xs text-muted-foreground">
              {libelleJours(l.joursRestants)}
            </span>
          )}
        </span>
      ),
      sortAccessor: (l) => l.prochaineEcheance,
    },
    {
      id: 'statut',
      header: 'Statut',
      cell: (l) => <StatutEcheanceBadge statut={l.statut} />,
      sortAccessor: (l) => (l.statut === 'en_retard' ? 0 : l.statut === 'a_planifier' ? 1 : 2),
    },
    {
      id: 'bilan',
      header: 'État des lieux 6 ans',
      cell: (l) =>
        l.echeanceBilan ? (
          <span className="flex flex-wrap items-center gap-2">
            <span className="tabular-nums">{formatDateFr(l.echeanceBilan)}</span>
            {l.statutBilan && l.statutBilan !== 'a_jour' && (
              <StatutEcheanceBadge statut={l.statutBilan} />
            )}
          </span>
        ) : (
          <span className="text-muted-foreground">—</span>
        ),
      sortAccessor: (l) => l.echeanceBilan,
    },
    {
      id: 'action',
      header: '',
      align: 'right',
      cell: (l) => {
        if (l.entretienPlanifie) {
          return (
            <Link
              href={`${base}/entretiens/${l.entretienPlanifie.id}`}
              className="whitespace-nowrap text-xs text-orange-700 underline-offset-2 hover:underline"
            >
              {LIBELLES_COURTS_TYPE_ENTRETIEN[l.entretienPlanifie.typeEntretien]}{' '}
              {l.entretienPlanifie.datePrevue
                ? `prévu le ${formatDateFr(l.entretienPlanifie.datePrevue)}`
                : 'à planifier'}
            </Link>
          );
        }
        if (!peutGerer || l.statut === 'a_jour') return null;
        return (
          <Button
            variant="outline"
            size="sm"
            disabled={isPending}
            onClick={() => creer(l)}
            aria-label={`Créer l’entretien de ${l.employeNom}`}
          >
            <PlusIcon className="mr-1 size-3.5" />
            {isPending && enCours === l.employeId ? 'Création…' : 'Créer l’entretien'}
          </Button>
        );
      },
    },
  ];

  return (
    <div className="space-y-3">
      <FilterPills
        aria-label="Filtrer par statut"
        items={[
          {
            key: 'tous',
            label: 'Tous',
            count: lignes.length,
            active: filtre === 'tous',
            onClick: () => setFiltre('tous'),
          },
          {
            key: 'en_retard',
            label: 'En retard',
            count: compteurs.en_retard,
            tone: 'danger',
            active: filtre === 'en_retard',
            onClick: () => setFiltre('en_retard'),
          },
          {
            key: 'a_planifier',
            label: 'À planifier',
            count: compteurs.a_planifier,
            active: filtre === 'a_planifier',
            onClick: () => setFiltre('a_planifier'),
          },
          {
            key: 'a_jour',
            label: 'À jour',
            count: compteurs.a_jour,
            active: filtre === 'a_jour',
            onClick: () => setFiltre('a_jour'),
          },
        ]}
      />
      <DataTable
        columns={colonnes}
        rows={affichees}
        rowKey={(l) => l.employeId}
        searchPlaceholder="Rechercher un collaborateur, un manager…"
        emptyMessage="Aucun collaborateur actif dans ce filtre."
        defaultSort={{ id: 'echeance', dir: 'asc' }}
        rowClassName={(l) =>
          l.statut === 'en_retard' ? 'bg-rose-50/40 dark:bg-rose-950/10' : undefined
        }
      />
    </div>
  );
}
