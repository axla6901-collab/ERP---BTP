import { BookUserIcon } from 'lucide-react';
import Link from 'next/link';

import { PageToolbar } from '@/components/layout/page-toolbar';
import { CollaborateursTable } from '@/components/test-sirh/collaborateurs/collaborateurs-table';
import { buttonVariants } from '@/components/ui/button';
import { FilterPills, type FilterPillItem } from '@/components/ui/filter-pills';
import { StatCard, StatGrid } from '@/components/ui/stat-card';
import { aujourdhuiIso } from '@/lib/test-sirh/calendrier';
import {
  calculerKpiCollaborateurs,
  correspondAuFiltre,
  FILTRES_COLLABORATEURS,
  HORIZON_FINS_CONTRAT_JOURS,
  LIBELLES_FILTRE_COLLABORATEURS,
  lireFiltreCollaborateurs,
  type FiltreCollaborateurs,
} from '@/lib/test-sirh/collaborateurs/contrats';
import { listerCollaborateurs } from '@/lib/test-sirh/collaborateurs/queries';
import { baseSirh, exigerContexteSirhPage } from '@/lib/test-sirh/contexte';
import { peutVoirPaieSirh, ROLES_SIRH_LECTURE } from '@/lib/test-sirh/permissions';

const VIDE_PAR_FILTRE: Record<FiltreCollaborateurs, string> = {
  actifs: 'Aucun collaborateur actif. Les collaborateurs sont les employés de la fiche RH.',
  sortis: 'Aucun collaborateur sorti.',
  tous: 'Aucun collaborateur. Créez d’abord les employés dans le module RH.',
};

function pluriel(n: number, singulier: string, plurielMot = `${singulier}s`): string {
  return `${n} ${n > 1 ? plurielMot : singulier}`;
}

/** Test SIRH › Collaborateurs (Factorial employees) : liste, filtres et indicateurs. */
export default async function CollaborateursPage({
  searchParams,
}: {
  searchParams: Promise<{ statut?: string | string[] }>;
}) {
  const ctx = await exigerContexteSirhPage(ROLES_SIRH_LECTURE);
  const [{ statut }, lignes] = await Promise.all([searchParams, listerCollaborateurs()]);
  const filtre = lireFiltreCollaborateurs(statut);
  const today = aujourdhuiIso();
  const base = baseSirh(ctx);

  const kpi = calculerKpiCollaborateurs(lignes, today);
  const r = kpi.repartition;
  const visibles = lignes.filter((l) => correspondAuFiltre(l.statut, filtre));
  const pills: FilterPillItem[] = FILTRES_COLLABORATEURS.map((f) => ({
    key: f,
    label: LIBELLES_FILTRE_COLLABORATEURS[f],
    count: lignes.filter((l) => correspondAuFiltre(l.statut, f)).length,
    active: f === filtre,
    href: f === 'actifs' ? `${base}/collaborateurs` : `${base}/collaborateurs?statut=${f}`,
  }));
  const complementRepartition = [
    r.autre > 0 ? `${r.autre} autre${r.autre > 1 ? 's' : ''} (stage…)` : null,
    r.sansContrat > 0 ? `${r.sansContrat} sans contrat SIRH` : null,
  ].filter(Boolean);

  return (
    <div className="space-y-4">
      <PageToolbar
        title="Collaborateurs"
        subtitle={`${pluriel(kpi.effectifActif, 'présent')} · ${pluriel(lignes.length, 'fiche')}`}
        backHref={base}
        backLabel="Test SIRH"
        actions={
          peutVoirPaieSirh(ctx.utilisateur.role) ? (
            <Link
              href={`${base}/collaborateurs/registre`}
              className={buttonVariants({ variant: 'outline', size: 'sm' })}
            >
              <BookUserIcon className="mr-1 size-4" />
              Registre du personnel
            </Link>
          ) : null
        }
      />

      <StatGrid>
        <StatCard
          label="Effectif actif"
          value={kpi.effectifActif}
          hint={
            kpi.arriveesAVenir > 0
              ? `+ ${pluriel(kpi.arriveesAVenir, 'arrivée')} à venir`
              : 'Présents à date'
          }
        />
        <StatCard
          label="CDI / CDD + intérim / alternance"
          value={`${r.cdi} / ${r.cddInterim} / ${r.alternance}`}
          hint={
            complementRepartition.length > 0
              ? complementRepartition.join(' · ')
              : 'Contrats en cours des présents'
          }
        />
        <StatCard
          label="Arrivées (30 j)"
          value={kpi.arrivees30j}
          tone="emerald"
          hint={`${pluriel(kpi.departs30j, 'départ')} sur la période`}
        />
        <StatCard
          label={`Fins de contrat (≤ ${HORIZON_FINS_CONTRAT_JOURS} j)`}
          value={kpi.finsContrat60j}
          tone={kpi.finsContrat60j > 0 ? 'amber' : 'default'}
          hint="CDD, intérim, alternance non renouvelés"
        />
      </StatGrid>

      <FilterPills items={pills} aria-label="Filtrer les collaborateurs" />

      <CollaborateursTable
        collaborateurs={visibles}
        today={today}
        baseHref={`${base}/collaborateurs`}
        emptyMessage={VIDE_PAR_FILTRE[filtre]}
      />
    </div>
  );
}
