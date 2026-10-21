'use client';

import { RefreshCwIcon } from 'lucide-react';
import Link from 'next/link';
import { useMemo, useState } from 'react';

import { OptionSelect, type OptionListe } from '@/components/test-sirh/option-select';
import { Button } from '@/components/ui/button';
import { DataTable, type DataTableColumn } from '@/components/ui/data-table';
import { FilterPills } from '@/components/ui/filter-pills';
import type { ActionResult } from '@/lib/common/action-result';
import type { StatutQualification } from '@/lib/test-sirh/formation/validite';
import { formatDateFr } from '@/lib/test-sirh/format';
import type { CategorieFormation } from '@/lib/validation/test-sirh/enums';
import type { InscriptionsInput } from '@/lib/validation/test-sirh/formation';

import { LIBELLES_COURTS_CATEGORIE_FORMATION, StatutQualificationBadge } from './badges';
import {
  InscrireSessionDialog,
  type CibleRecyclage,
  type SessionAVenirUI,
} from './inscrire-session-dialog';

/** Ligne affichée (sérialisable, calculée côté serveur). */
export type QualificationLigneUI = {
  inscriptionId: string;
  sessionId: string;
  employeId: string;
  /** « Prénom Nom ». */
  employeNom: string;
  employeTri: string;
  matricule: string | null;
  formationId: string;
  formationIntitule: string;
  formationCode: string | null;
  categorie: CategorieFormation;
  dateObtention: string;
  dateValidite: string | null;
  statut: StatutQualification;
  joursRestants: number | null;
  recyclagePlanifie: { sessionId: string; dateDebut: string } | null;
  equipeIds: string[];
};

type FiltreStatut = 'tous' | StatutQualification;

type Props = {
  qualifications: QualificationLigneUI[];
  /** Formations présentes dans les qualifications (filtre). */
  formations: OptionListe[];
  equipes: OptionListe[];
  sessionsAVenir: SessionAVenirUI[];
  /** Préfixe `/<slug>/test-sirh`. */
  base: string;
  peutGerer: boolean;
  inscrire: (
    input: InscriptionsInput,
  ) => Promise<ActionResult<{ inscrits: number; dejaInscrits: number }>>;
};

/** `-5` → `expirée depuis 5 j`, `12` → `dans 12 j`. */
function libelleEcheance(j: number | null): string | null {
  if (j === null) return null;
  if (j < 0) return `expirée depuis ${-j} j`;
  if (j === 0) return 'expire aujourd’hui';
  return `dans ${j} j`;
}

/**
 * Habilitations & recyclages : dernière qualification obtenue par salarié et
 * formation, statut de validité (valide / à recycler ≤ 90 j / expirée), filtres
 * formation / équipe / statut, inscription à une session de recyclage.
 */
export function HabilitationsTable({
  qualifications,
  formations,
  equipes,
  sessionsAVenir,
  base,
  peutGerer,
  inscrire,
}: Props) {
  const [formationId, setFormationId] = useState<string | null>(null);
  const [equipeId, setEquipeId] = useState<string | null>(null);
  const [statut, setStatut] = useState<FiltreStatut>('tous');
  const [cible, setCible] = useState<CibleRecyclage | null>(null);

  const filtrees = useMemo(
    () =>
      qualifications.filter(
        (q) =>
          (!formationId || q.formationId === formationId) &&
          (!equipeId || q.equipeIds.includes(equipeId)),
      ),
    [qualifications, formationId, equipeId],
  );
  const compteurs = useMemo(() => {
    const c: Record<StatutQualification, number> = { valide: 0, a_recycler: 0, expiree: 0 };
    for (const q of filtrees) c[q.statut] += 1;
    return c;
  }, [filtrees]);
  const affichees = statut === 'tous' ? filtrees : filtrees.filter((q) => q.statut === statut);

  const colonnes: DataTableColumn<QualificationLigneUI>[] = [
    {
      id: 'employe',
      header: 'Collaborateur',
      cell: (q) => (
        <div className="min-w-0">
          <span className="font-medium">{q.employeNom}</span>
          {q.matricule && <span className="ml-2 text-xs text-muted-foreground">{q.matricule}</span>}
        </div>
      ),
      sortAccessor: (q) => q.employeTri,
      searchAccessor: (q) => `${q.employeNom} ${q.matricule ?? ''}`,
    },
    {
      id: 'formation',
      header: 'Formation',
      cell: (q) => (
        <div className="min-w-0">
          <span>{q.formationIntitule}</span>
          <span className="block text-xs text-muted-foreground">
            {LIBELLES_COURTS_CATEGORIE_FORMATION[q.categorie]}
            {q.formationCode ? ` · ${q.formationCode}` : ''}
          </span>
        </div>
      ),
      sortAccessor: (q) => q.formationIntitule,
      searchAccessor: (q) => `${q.formationIntitule} ${q.formationCode ?? ''}`,
    },
    {
      id: 'obtention',
      header: 'Obtenue le',
      cell: (q) => (
        <Link
          href={`${base}/formation/sessions/${q.sessionId}`}
          className="tabular-nums underline-offset-2 hover:underline"
        >
          {formatDateFr(q.dateObtention)}
        </Link>
      ),
      sortAccessor: (q) => q.dateObtention,
    },
    {
      id: 'validite',
      header: 'Valide jusqu’au',
      cell: (q) =>
        q.dateValidite ? (
          <span className="whitespace-nowrap">
            <span className="tabular-nums">{formatDateFr(q.dateValidite)}</span>
            {q.statut !== 'valide' && libelleEcheance(q.joursRestants) && (
              <span className="block text-xs text-muted-foreground">
                {libelleEcheance(q.joursRestants)}
              </span>
            )}
          </span>
        ) : (
          <span className="text-muted-foreground">Sans échéance</span>
        ),
      sortAccessor: (q) => q.dateValidite,
    },
    {
      id: 'statut',
      header: 'Statut',
      cell: (q) => <StatutQualificationBadge statut={q.statut} />,
      sortAccessor: (q) => (q.statut === 'expiree' ? 0 : q.statut === 'a_recycler' ? 1 : 2),
    },
    {
      id: 'recyclage',
      header: 'Recyclage',
      align: 'right',
      cell: (q) => {
        if (q.recyclagePlanifie) {
          return (
            <Link
              href={`${base}/formation/sessions/${q.recyclagePlanifie.sessionId}`}
              className="whitespace-nowrap text-xs text-orange-700 underline-offset-2 hover:underline"
            >
              Inscrit le {formatDateFr(q.recyclagePlanifie.dateDebut)}
            </Link>
          );
        }
        if (!peutGerer || q.statut === 'valide') return null;
        return (
          <Button
            variant="outline"
            size="sm"
            onClick={() =>
              setCible({
                employeId: q.employeId,
                employeNom: q.employeNom,
                formationId: q.formationId,
                formationIntitule: q.formationIntitule,
              })
            }
            aria-label={`Inscrire ${q.employeNom} à une session de ${q.formationIntitule}`}
          >
            <RefreshCwIcon className="mr-1 size-3.5" /> Inscrire à une session
          </Button>
        );
      },
    },
  ];

  return (
    <div className="space-y-3">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <FilterPills
          aria-label="Filtrer par statut"
          items={[
            {
              key: 'tous',
              label: 'Toutes',
              count: filtrees.length,
              active: statut === 'tous',
              onClick: () => setStatut('tous'),
            },
            {
              key: 'expiree',
              label: 'Expirées',
              count: compteurs.expiree,
              tone: 'danger',
              active: statut === 'expiree',
              onClick: () => setStatut('expiree'),
            },
            {
              key: 'a_recycler',
              label: 'À recycler',
              count: compteurs.a_recycler,
              active: statut === 'a_recycler',
              onClick: () => setStatut('a_recycler'),
            },
            {
              key: 'valide',
              label: 'Valides',
              count: compteurs.valide,
              active: statut === 'valide',
              onClick: () => setStatut('valide'),
            },
          ]}
        />
        <div className="flex flex-col gap-2 sm:flex-row">
          <OptionSelect
            options={formations}
            value={formationId}
            onChange={setFormationId}
            libelleAucune="Toutes les formations"
            aria-label="Filtrer par formation"
            className="sm:w-60"
          />
          <OptionSelect
            options={equipes}
            value={equipeId}
            onChange={setEquipeId}
            libelleAucune="Toutes les équipes"
            aria-label="Filtrer par équipe"
            className="sm:w-52"
          />
        </div>
      </div>

      <DataTable
        columns={colonnes}
        rows={affichees}
        rowKey={(q) => q.inscriptionId}
        searchPlaceholder="Rechercher un collaborateur, une formation…"
        emptyMessage="Aucune qualification pour ces filtres. Les qualifications naissent des inscriptions « réussi »."
        defaultSort={{ id: 'validite', dir: 'asc' }}
        rowClassName={(q) =>
          q.statut === 'expiree' && !q.recyclagePlanifie
            ? 'bg-rose-50/40 dark:bg-rose-950/10'
            : undefined
        }
      />

      {peutGerer && (
        <InscrireSessionDialog
          open={cible !== null}
          onOpenChange={(ouvert) => {
            if (!ouvert) setCible(null);
          }}
          cible={cible}
          sessions={sessionsAVenir}
          base={base}
          inscrire={inscrire}
        />
      )}
    </div>
  );
}
