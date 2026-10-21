import { PageToolbar } from '@/components/layout/page-toolbar';
import { FeuilleTempsTable } from '@/components/test-sirh/temps/feuille-temps-table';
import { FiltresFeuilleTemps } from '@/components/test-sirh/temps/filtres-feuille-temps';
import { NavigationPeriode } from '@/components/test-sirh/temps/navigation-periode';
import { OngletsTemps } from '@/components/test-sirh/temps/onglets-temps';
import { StatCard, StatGrid } from '@/components/ui/stat-card';
import { ajouterJours, aujourdhuiIso, lundiDeLaSemaine } from '@/lib/test-sirh/calendrier';
import { baseSirh, exigerContexteSirhPage } from '@/lib/test-sirh/contexte';
import { formatMinutes } from '@/lib/test-sirh/format';
import { peutGererSirh, peutValiderSirh, ROLES_SIRH_LECTURE } from '@/lib/test-sirh/permissions';
import {
  listerChantiersOptions,
  listerEmployesOptions,
  listerEquipesOptions,
  listerSitesOptions,
} from '@/lib/test-sirh/referentiels';
import {
  enregistrerBadgeage,
  supprimerBadgeage,
  validerBadgeage,
  validerSemaineBadgeages,
} from '@/lib/test-sirh/temps/badgeages';
import { estUuid } from '@/lib/test-sirh/temps/controles';
import {
  formatEcartMinutes,
  libelleSemaine,
  numeroSemaineIso,
  semaineDepuisParametre,
  urlFeuilleTemps,
} from '@/lib/test-sirh/temps/feuille-temps';
import {
  chargerFeuilleTemps,
  compterHeuresSupEnAttente,
  lireMonEmploye,
} from '@/lib/test-sirh/temps/queries';
import type { BadgeageInput, ValidationSemaineInput } from '@/lib/validation/test-sirh/temps';

/**
 * Test SIRH › Temps de travail › Badgeages : feuille de temps hebdomadaire
 * (Factorial attendance/Shift + WorkedTime) avec saisie et validation.
 */
export default async function TempsBadgeagesPage({
  searchParams,
}: {
  searchParams: Promise<{ semaine?: string; equipe?: string; site?: string }>;
}) {
  const ctx = await exigerContexteSirhPage(ROLES_SIRH_LECTURE);
  const sp = await searchParams;
  const today = aujourdhuiIso();
  const lundi = semaineDepuisParametre(sp.semaine, today);
  const equipeId = estUuid(sp.equipe) ? sp.equipe : null;
  const siteId = estUuid(sp.site) ? sp.site : null;
  const peutValider = peutValiderSirh(ctx.utilisateur.role);
  const peutGerer = peutGererSirh(ctx.utilisateur.role);

  const [feuille, heuresSupEnAttente, equipes, sites, employes, chantiers, monEmploye] =
    await Promise.all([
      chargerFeuilleTemps({ semaine: lundi, equipeId, siteId }),
      compterHeuresSupEnAttente(),
      listerEquipesOptions(),
      listerSitesOptions(),
      peutValider ? listerEmployesOptions() : Promise.resolve([]),
      peutValider ? listerChantiersOptions() : Promise.resolve([]),
      peutValider ? lireMonEmploye() : Promise.resolve(null),
    ]);

  const base = baseSirh(ctx);
  const chemin = `${base}/temps`;
  const lundiCourant = lundiDeLaSemaine(today);
  const url = (semaine: string) => urlFeuilleTemps(chemin, { semaine, equipeId, siteId });
  const t = feuille.totaux;

  const actions = {
    enregistrer: async (input: BadgeageInput) => {
      'use server';
      return enregistrerBadgeage(input);
    },
    supprimer: async (id: string) => {
      'use server';
      return supprimerBadgeage(id);
    },
    valider: async (id: string) => {
      'use server';
      return validerBadgeage(id);
    },
    validerSemaine: async (input: ValidationSemaineInput) => {
      'use server';
      return validerSemaineBadgeages(input);
    },
  };

  return (
    <div className="space-y-4">
      <PageToolbar
        title="Temps de travail"
        subtitle={libelleSemaine(lundi)}
        backHref={base}
        backLabel="Test SIRH"
        actions={
          <NavigationPeriode
            libelle={`Semaine ${numeroSemaineIso(lundi)}`}
            precedent={{ href: url(ajouterJours(lundi, -7)), label: 'Semaine précédente' }}
            suivant={{ href: url(ajouterJours(lundi, 7)), label: 'Semaine suivante' }}
            courant={
              lundi === lundiCourant ? null : { href: url(lundiCourant), label: 'Cette semaine' }
            }
          />
        }
      />
      <OngletsTemps base={base} actif="badgeages" heuresSupEnAttente={heuresSupEnAttente} />

      <StatGrid>
        <StatCard
          label="Heures badgées"
          value={formatMinutes(t.minutesTravaillees)}
          hint={`sur ${formatMinutes(t.minutesTheoriques)} théoriques`}
        />
        <StatCard
          label="Écart vs théorique"
          value={formatEcartMinutes(t.ecartMinutes)}
          tone={t.ecartMinutes < 0 ? 'rose' : t.ecartMinutes > 0 ? 'emerald' : 'default'}
          hint={`${t.nbEmployes} collaborateur${t.nbEmployes > 1 ? 's' : ''}`}
        />
        <StatCard
          label="Badgeages non validés"
          value={t.nbNonValides}
          tone={t.nbNonValides > 0 ? 'amber' : 'default'}
          hint={t.nbEnCours > 0 ? `${t.nbEnCours} en cours` : `${t.nbBadgeages} badgeages`}
        />
        <StatCard
          label="Heures sup. en attente"
          value={heuresSupEnAttente}
          tone={heuresSupEnAttente > 0 ? 'amber' : 'default'}
          hint="demandes à décider"
        />
      </StatGrid>

      <FiltresFeuilleTemps
        chemin={chemin}
        semaine={lundi}
        equipeId={equipeId}
        siteId={siteId}
        equipes={equipes}
        sites={sites}
      />

      <FeuilleTempsTable
        feuille={feuille}
        today={today}
        peutSaisir={peutValider}
        peutValider={peutValider}
        peutGerer={peutGerer}
        monEmployeId={monEmploye?.id ?? null}
        employes={employes}
        chantiers={chantiers}
        {...(peutValider ? { actions } : {})}
      />
    </div>
  );
}
