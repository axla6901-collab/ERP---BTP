import { PageToolbar } from '@/components/layout/page-toolbar';
import { OffresSection } from '@/components/test-sirh/recrutement/offres-section';
import { OngletsRecrutement } from '@/components/test-sirh/recrutement/onglets-recrutement';
import { FilterPills } from '@/components/ui/filter-pills';
import { StatCard, StatGrid } from '@/components/ui/stat-card';
import { baseSirh, exigerContexteSirhPage } from '@/lib/test-sirh/contexte';
import { peutGererSirh, ROLES_SIRH_LECTURE } from '@/lib/test-sirh/permissions';
import {
  changerStatutOffre,
  enregistrerOffre,
  supprimerOffre,
} from '@/lib/test-sirh/recrutement/offres';
import { kpiRecrutement, listerOffres } from '@/lib/test-sirh/recrutement/queries';
import {
  listerEmployesOptions,
  listerPostesOptions,
  listerSitesOptions,
  type OptionEmploye,
  type OptionSirh,
} from '@/lib/test-sirh/referentiels';
import {
  LIBELLES_STATUT_OFFRE,
  STATUTS_OFFRE,
  type StatutOffre,
} from '@/lib/validation/test-sirh/enums';

function estStatutOffre(v: unknown): v is StatutOffre {
  return typeof v === 'string' && (STATUTS_OFFRE as readonly string[]).includes(v);
}

/** Test SIRH › Recrutement › Offres d'emploi (Factorial ats/JobPosting). */
export default async function RecrutementOffresPage({
  searchParams,
}: {
  searchParams: Promise<{ statut?: string | string[] }>;
}) {
  const ctx = await exigerContexteSirhPage(ROLES_SIRH_LECTURE);
  const peutGerer = peutGererSirh(ctx.utilisateur.role);
  const [{ statut }, offres, kpi, postes, sites, employes] = await Promise.all([
    searchParams,
    listerOffres(),
    kpiRecrutement(),
    peutGerer ? listerPostesOptions() : Promise.resolve<OptionSirh[]>([]),
    peutGerer ? listerSitesOptions() : Promise.resolve<OptionSirh[]>([]),
    peutGerer
      ? listerEmployesOptions({ inclureInactifs: true })
      : Promise.resolve<OptionEmploye[]>([]),
  ]);
  const base = baseSirh(ctx);
  const filtre = estStatutOffre(statut) ? statut : null;
  const visibles = filtre ? offres.filter((o) => o.statut === filtre) : offres;
  const compter = (s: StatutOffre) => offres.filter((o) => o.statut === s).length;

  return (
    <div className="space-y-4">
      <PageToolbar
        title="Recrutement"
        subtitle={`${offres.length} offre${offres.length > 1 ? 's' : ''} · ${kpi.candidaturesActives} candidature${kpi.candidaturesActives > 1 ? 's' : ''} en cours`}
        backHref={base}
        backLabel="Test SIRH"
      />
      <OngletsRecrutement base={base} actif="offres" />

      <StatGrid>
        <StatCard
          label="Offres publiées"
          value={kpi.offresPubliees}
          hint="visibles des candidats"
        />
        <StatCard
          label="Candidatures actives"
          value={kpi.candidaturesActives}
          tone="amber"
          hint="de « Nouvelle » à « Proposition »"
        />
        <StatCard
          label="Entretiens à venir"
          value={kpi.entretiensAVenir}
          tone="sky"
          hint="dans les 7 prochains jours"
        />
        <StatCard
          label="Embauches"
          value={kpi.embauches90j}
          tone="emerald"
          hint="sur les 90 derniers jours"
        />
      </StatGrid>

      <FilterPills
        aria-label="Filtrer les offres par statut"
        items={[
          {
            key: 'toutes',
            label: 'Toutes',
            count: offres.length,
            active: filtre === null,
            href: `${base}/recrutement`,
          },
          ...STATUTS_OFFRE.map((s) => ({
            key: s,
            label: LIBELLES_STATUT_OFFRE[s],
            count: compter(s),
            active: filtre === s,
            href: `${base}/recrutement?statut=${s}`,
          })),
        ]}
      />

      <OffresSection
        offres={visibles}
        base={base}
        peutGerer={peutGerer}
        messageVide={
          filtre ? `Aucune offre au statut « ${LIBELLES_STATUT_OFFRE[filtre]} ».` : undefined
        }
        options={{
          postes,
          sites,
          responsables: employes.map((e) => ({
            id: e.id,
            label: e.actif ? e.label : `${e.label} (inactif)`,
            actif: e.actif,
          })),
        }}
        actions={{
          enregistrer: async (input) => {
            'use server';
            return enregistrerOffre(input);
          },
          changerStatut: async (input) => {
            'use server';
            return changerStatutOffre(input);
          },
          supprimer: async (id) => {
            'use server';
            return supprimerOffre(id);
          },
        }}
      />
    </div>
  );
}
