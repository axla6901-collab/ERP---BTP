import { PageToolbar } from '@/components/layout/page-toolbar';
import { JoursFeriesSection } from '@/components/test-sirh/absences/jours-feries-section';
import { OngletsAbsences } from '@/components/test-sirh/absences/onglets-absences';
import { PeriodesBloqueesSection } from '@/components/test-sirh/absences/periodes-bloquees-section';
import { TypesAbsenceSection } from '@/components/test-sirh/absences/types-absence-section';
import { SirhBloc } from '@/components/test-sirh/sirh-bloc';
import { lireAnnee, type ParametresUrl } from '@/lib/test-sirh/absences/filtres';
import {
  enregistrerJourFerie,
  genererJoursFeries,
  supprimerJourFerie,
} from '@/lib/test-sirh/absences/jours-feries';
import {
  enregistrerPeriodeBloquee,
  supprimerPeriodeBloquee,
} from '@/lib/test-sirh/absences/periodes-bloquees';
import {
  listerJoursFeries,
  listerPeriodesBloquees,
  listerTypesAbsence,
} from '@/lib/test-sirh/absences/queries';
import {
  enregistrerTypeAbsence,
  supprimerTypeAbsence,
} from '@/lib/test-sirh/absences/types-absence';
import { aujourdhuiIso } from '@/lib/test-sirh/calendrier';
import { baseSirh, exigerContexteSirhPage } from '@/lib/test-sirh/contexte';
import { peutGererSirh, ROLES_SIRH_LECTURE } from '@/lib/test-sirh/permissions';
import { listerEquipesOptions, listerSitesOptions } from '@/lib/test-sirh/referentiels';

/**
 * Test SIRH › Absences › Paramètres : types d'absence, jours fériés, périodes
 * bloquées. Lecture pour les rôles LECTURE, écriture pour la gestion RH.
 */
export default async function ParametresAbsencesPage({
  searchParams,
}: {
  searchParams: Promise<ParametresUrl>;
}) {
  const ctx = await exigerContexteSirhPage(ROLES_SIRH_LECTURE);
  const today = aujourdhuiIso();
  const annee = lireAnnee(await searchParams, today);
  const peutGerer = peutGererSirh(ctx.utilisateur.role);
  const base = baseSirh(ctx);

  const [types, feries, periodes, sites, equipes] = await Promise.all([
    listerTypesAbsence(),
    listerJoursFeries(annee),
    listerPeriodesBloquees(),
    listerSitesOptions(),
    listerEquipesOptions(),
  ]);
  const optionsTypes = types
    .filter((t) => t.actif || periodes.some((p) => p.typeAbsenceId === t.id))
    .map((t) => ({ id: t.id, label: `${t.libelle} (${t.code})` }));

  return (
    <div className="space-y-4">
      <PageToolbar
        title="Absences"
        subtitle="Paramètres · types d’absence, jours fériés, périodes bloquées"
        backHref={base}
        backLabel="Test SIRH"
      />
      <OngletsAbsences base={base} actif="parametres" />

      <SirhBloc
        title="Types d’absence"
        description="Unité de décompte, solde, validation et justificatif de chaque type. Un type utilisé ne se supprime pas : désactivez-le."
      >
        <TypesAbsenceSection
          types={types}
          peutGerer={peutGerer}
          actions={{
            enregistrer: async (input) => {
              'use server';
              return enregistrerTypeAbsence(input);
            },
            supprimer: async (id) => {
              'use server';
              return supprimerTypeAbsence(id);
            },
          }}
        />
      </SirhBloc>

      <SirhBloc
        title="Jours fériés"
        description="Les fériés chômés sont exclus du décompte des absences ; un férié peut être propre à un site (Alsace-Moselle…)."
      >
        <JoursFeriesSection
          annee={annee}
          feries={feries}
          sites={sites}
          baseHref={`${base}/absences/parametres`}
          peutGerer={peutGerer}
          actions={{
            enregistrer: async (input) => {
              'use server';
              return enregistrerJourFerie(input);
            },
            supprimer: async (id) => {
              'use server';
              return supprimerJourFerie(id);
            },
            generer: async (input) => {
              'use server';
              return genererJoursFeries(input);
            },
          }}
        />
      </SirhBloc>

      <SirhBloc
        title="Périodes bloquées"
        description="Aucune demande ne peut chevaucher une période bloquée (fermeture, rush chantier…), pour le type et l’équipe visés."
      >
        <PeriodesBloqueesSection
          periodes={periodes}
          types={optionsTypes}
          equipes={equipes}
          today={today}
          peutGerer={peutGerer}
          actions={{
            enregistrer: async (input) => {
              'use server';
              return enregistrerPeriodeBloquee(input);
            },
            supprimer: async (id) => {
              'use server';
              return supprimerPeriodeBloquee(id);
            },
          }}
        />
      </SirhBloc>
    </div>
  );
}
