import { PageToolbar } from '@/components/layout/page-toolbar';
import {
  CompteursTable,
  type ActionsCompteurs,
} from '@/components/test-sirh/absences/compteurs-table';
import { InitialiserCompteurs } from '@/components/test-sirh/absences/initialiser-compteurs';
import { OngletsAbsences } from '@/components/test-sirh/absences/onglets-absences';
import { FilterPills, type FilterPillItem } from '@/components/ui/filter-pills';
import { StatCard, StatGrid } from '@/components/ui/stat-card';
import {
  ajouterAjustement,
  enregistrerCompteur,
  initialiserCompteurs,
  supprimerAjustement,
  supprimerCompteur,
} from '@/lib/test-sirh/absences/compteurs';
import {
  hrefCompteurs,
  lireFiltresCompteurs,
  periodesProposees,
  type ParametresUrl,
  type PeriodeFiltre,
} from '@/lib/test-sirh/absences/filtres';
import { listerCompteurs, listerTypesAbsenceSolde } from '@/lib/test-sirh/absences/queries';
import { aujourdhuiIso } from '@/lib/test-sirh/calendrier';
import { baseSirh, exigerContexteSirhPage } from '@/lib/test-sirh/contexte';
import { formatDateFr } from '@/lib/test-sirh/format';
import { peutGererSirh, ROLES_SIRH_LECTURE } from '@/lib/test-sirh/permissions';
import { listerEmployesOptions } from '@/lib/test-sirh/referentiels';

function libellePeriode(p: PeriodeFiltre): string {
  return `${p.debut.slice(0, 4)}–${p.fin.slice(0, 4)}`;
}

/** Test SIRH › Absences › Compteurs (Factorial Allowance / AllowanceStat). */
export default async function CompteursAbsencesPage({
  searchParams,
}: {
  searchParams: Promise<ParametresUrl>;
}) {
  const ctx = await exigerContexteSirhPage(ROLES_SIRH_LECTURE);
  const today = aujourdhuiIso();
  const filtres = lireFiltresCompteurs(await searchParams, today);
  const gestionnaire = peutGererSirh(ctx.utilisateur.role);
  const base = baseSirh(ctx);
  const baseCompteurs = `${base}/absences/compteurs`;

  const [compteurs, types, employes] = await Promise.all([
    listerCompteurs(filtres),
    listerTypesAbsenceSolde(),
    gestionnaire ? listerEmployesOptions() : Promise.resolve([]),
  ]);

  const proposees = periodesProposees(today);
  if (filtres.periode && !proposees.some((p) => p.debut === filtres.periode?.debut)) {
    proposees.push(filtres.periode);
  }
  const pillsPeriode: FilterPillItem[] = [
    ...proposees.map((p) => ({
      key: p.debut,
      label: libellePeriode(p),
      active: filtres.periode?.debut === p.debut,
      href: hrefCompteurs(baseCompteurs, { ...filtres, periode: p }),
    })),
    {
      key: 'toutes',
      label: 'Toutes les périodes',
      active: filtres.periode === null,
      href: hrefCompteurs(baseCompteurs, { ...filtres, periode: null }),
    },
  ];
  const pillsType: FilterPillItem[] = [
    {
      key: 'tous',
      label: 'Tous les types',
      active: filtres.typeAbsenceId === null,
      href: hrefCompteurs(baseCompteurs, { ...filtres, typeAbsenceId: null }),
    },
    ...types.map((t) => ({
      key: t.id,
      label: t.code,
      active: filtres.typeAbsenceId === t.id,
      href: hrefCompteurs(baseCompteurs, { ...filtres, typeAbsenceId: t.id }),
    })),
  ];

  const negatifs = compteurs.filter((c) => c.solde < 0).length;
  const collaborateurs = new Set(compteurs.map((c) => c.employeId)).size;
  const avecAttente = compteurs.filter((c) => c.enAttente > 0).length;

  const actions: ActionsCompteurs = {
    enregistrer: async (input) => {
      'use server';
      return enregistrerCompteur(input);
    },
    supprimer: async (id) => {
      'use server';
      return supprimerCompteur(id);
    },
    ajouterAjustement: async (input) => {
      'use server';
      return ajouterAjustement(input);
    },
    supprimerAjustement: async (id) => {
      'use server';
      return supprimerAjustement(id);
    },
  };

  return (
    <div className="space-y-4">
      <PageToolbar
        title="Absences"
        subtitle={
          filtres.periode
            ? `Compteurs · période du ${formatDateFr(filtres.periode.debut)} au ${formatDateFr(filtres.periode.fin)}`
            : 'Compteurs · toutes les périodes'
        }
        backHref={base}
        backLabel="Test SIRH"
        actions={
          gestionnaire ? (
            <InitialiserCompteurs
              types={types}
              today={today}
              onInitialiser={async (input) => {
                'use server';
                return initialiserCompteurs(input);
              }}
            />
          ) : null
        }
      />
      <OngletsAbsences base={base} actif="compteurs" />

      <StatGrid>
        <StatCard label="Compteurs" value={compteurs.length} hint="sur la sélection" />
        <StatCard label="Collaborateurs" value={collaborateurs} hint="avec au moins un compteur" />
        <StatCard
          label="Avec demandes en attente"
          value={avecAttente}
          tone={avecAttente > 0 ? 'amber' : 'default'}
          hint="solde prévisionnel affiché"
        />
        <StatCard
          label="Soldes négatifs"
          value={negatifs}
          tone={negatifs > 0 ? 'rose' : 'default'}
          hint="droits dépassés"
        />
      </StatGrid>

      <div className="flex flex-col gap-2 rounded-xl border bg-card p-4">
        <FilterPills items={pillsPeriode} aria-label="Période de référence" />
        <FilterPills items={pillsType} aria-label="Type d’absence" />
      </div>

      <CompteursTable
        compteurs={compteurs}
        today={today}
        gestion={gestionnaire ? { employes, types, actions } : null}
        emptyMessage={
          gestionnaire
            ? 'Aucun compteur sur cette sélection. Utilisez « Initialiser les compteurs ».'
            : 'Aucun compteur sur cette sélection.'
        }
      />
    </div>
  );
}
