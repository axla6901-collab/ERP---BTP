import { PageToolbar } from '@/components/layout/page-toolbar';
import { HeuresSupSection } from '@/components/test-sirh/temps/heures-sup-section';
import { NavigationPeriode } from '@/components/test-sirh/temps/navigation-periode';
import { OngletsTemps } from '@/components/test-sirh/temps/onglets-temps';
import { TotauxHeuresSupTable } from '@/components/test-sirh/temps/totaux-heures-sup';
import { FilterPills } from '@/components/ui/filter-pills';
import { FilterRailSection } from '@/components/ui/filter-rail-section';
import { ListLayout } from '@/components/ui/list-layout';
import { aujourdhuiIso } from '@/lib/test-sirh/calendrier';
import { baseSirh, exigerContexteSirhPage } from '@/lib/test-sirh/contexte';
import {
  libellePeriode,
  memeMois,
  moisDeLaDate,
  moisDepuisParametre,
  parametreMois,
  periodePrecedente,
  periodeSuivante,
  type MoisPaie,
} from '@/lib/test-sirh/paie/periodes';
import { peutGererSirh, peutValiderSirh, ROLES_SIRH_LECTURE } from '@/lib/test-sirh/permissions';
import { listerChantiersOptions, listerEmployesOptions } from '@/lib/test-sirh/referentiels';
import { compterParStatut, totauxParMajoration } from '@/lib/test-sirh/temps/heures-sup';
import {
  annulerHeuresSup,
  deciderHeuresSup,
  demanderHeuresSup,
} from '@/lib/test-sirh/temps/heures-sup-actions';
import {
  compterHeuresSupEnAttente,
  listerHeuresSupMois,
  lireMonEmploye,
} from '@/lib/test-sirh/temps/queries';
import type { DecisionInput } from '@/lib/validation/test-sirh/commun';
import {
  LIBELLES_STATUT_DEMANDE,
  STATUTS_DEMANDE,
  type StatutDemande,
} from '@/lib/validation/test-sirh/enums';
import type { HeuresSupInput } from '@/lib/validation/test-sirh/temps';

const STATUTS_FILTRES: readonly StatutDemande[] = STATUTS_DEMANDE.filter((s) => s !== 'brouillon');

function estStatut(v: string | undefined): v is StatutDemande {
  return (STATUTS_DEMANDE as readonly string[]).includes(v ?? '');
}

/**
 * Test SIRH › Temps de travail › Heures supplémentaires (Factorial
 * attendance/OvertimeRequest) : demandes du mois, décision, totaux par majoration.
 */
export default async function HeuresSupPage({
  searchParams,
}: {
  searchParams: Promise<{ statut?: string; mois?: string }>;
}) {
  const ctx = await exigerContexteSirhPage(ROLES_SIRH_LECTURE);
  const sp = await searchParams;
  const today = aujourdhuiIso();
  const mois = moisDepuisParametre(sp.mois, today);
  const statut = estStatut(sp.statut) ? sp.statut : null;
  const peutValider = peutValiderSirh(ctx.utilisateur.role);
  const peutGerer = peutGererSirh(ctx.utilisateur.role);

  const [demandes, enAttente, monEmploye, employes, chantiers] = await Promise.all([
    listerHeuresSupMois(mois),
    compterHeuresSupEnAttente(),
    lireMonEmploye(),
    peutValider ? listerEmployesOptions() : Promise.resolve([]),
    listerChantiersOptions(),
  ]);

  const base = baseSirh(ctx);
  const chemin = `${base}/temps/heures-sup`;
  const url = (p: { mois: MoisPaie; statut: StatutDemande | null }) => {
    const params = new URLSearchParams({ mois: parametreMois(p.mois) });
    if (p.statut) params.set('statut', p.statut);
    return `${chemin}?${params.toString()}`;
  };
  const moisCourant = moisDeLaDate(today);
  const comptes = compterParStatut(demandes);
  const totaux = totauxParMajoration(demandes);
  const affichees = statut ? demandes.filter((d) => d.statut === statut) : demandes;

  return (
    <div className="space-y-4">
      <PageToolbar
        title="Temps de travail"
        subtitle={`Heures supplémentaires — ${libellePeriode(mois)}`}
        backHref={base}
        backLabel="Test SIRH"
        actions={
          <NavigationPeriode
            libelle={libellePeriode(mois)}
            precedent={{
              href: url({ mois: periodePrecedente(mois), statut }),
              label: 'Mois précédent',
            }}
            suivant={{ href: url({ mois: periodeSuivante(mois), statut }), label: 'Mois suivant' }}
            courant={
              memeMois(mois, moisCourant)
                ? null
                : { href: url({ mois: moisCourant, statut }), label: 'Ce mois-ci' }
            }
          />
        }
      />
      <OngletsTemps base={base} actif="heures-sup" heuresSupEnAttente={enAttente} />

      <ListLayout
        aside={
          <FilterRailSection title="Totaux du mois">
            <TotauxHeuresSupTable totaux={totaux} />
          </FilterRailSection>
        }
      >
        <div className="space-y-3">
          <FilterPills
            aria-label="Filtrer par statut"
            items={[
              {
                key: 'toutes',
                label: 'Toutes',
                count: demandes.length,
                active: statut === null,
                href: url({ mois, statut: null }),
              },
              ...STATUTS_FILTRES.map((s) => ({
                key: s,
                label: LIBELLES_STATUT_DEMANDE[s],
                count: comptes[s],
                active: statut === s,
                href: url({ mois, statut: s }),
              })),
            ]}
          />
          <HeuresSupSection
            demandes={affichees}
            today={today}
            peutValider={peutValider}
            peutGerer={peutGerer}
            monEmployeId={monEmploye?.id ?? null}
            employeFixe={monEmploye}
            employes={employes}
            chantiers={chantiers}
            emptyMessage={
              statut
                ? `Aucune demande « ${LIBELLES_STATUT_DEMANDE[statut].toLowerCase()} » en ${libellePeriode(mois).toLowerCase()}.`
                : `Aucune demande d’heures supplémentaires en ${libellePeriode(mois).toLowerCase()}.`
            }
            actions={{
              demander: async (input: HeuresSupInput) => {
                'use server';
                return demanderHeuresSup(input);
              },
              annuler: async (id: string) => {
                'use server';
                return annulerHeuresSup(id);
              },
              ...(peutValider
                ? {
                    decider: async (input: DecisionInput) => {
                      'use server';
                      return deciderHeuresSup(input);
                    },
                  }
                : {}),
            }}
          />
        </div>
      </ListLayout>
    </div>
  );
}
