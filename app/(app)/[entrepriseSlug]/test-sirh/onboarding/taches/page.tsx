import { PageToolbar } from '@/components/layout/page-toolbar';
import { OngletsOnboarding } from '@/components/test-sirh/onboarding/onglets-onboarding';
import { TachesListe } from '@/components/test-sirh/onboarding/taches-liste';
import { aujourdhuiIso } from '@/lib/test-sirh/calendrier';
import { baseSirh, exigerContexteSirhPage } from '@/lib/test-sirh/contexte';
import { listerTachesOnboarding } from '@/lib/test-sirh/onboarding/queries';
import {
  basculerTache,
  changerStatutTache,
  enregistrerTache,
  supprimerTache,
} from '@/lib/test-sirh/onboarding/taches';
import { peutGererSirh, ROLES_SIRH_LECTURE } from '@/lib/test-sirh/permissions';
import {
  listerEmployesOptions,
  listerUtilisateursOptions,
  type OptionEmploye,
  type OptionSirh,
} from '@/lib/test-sirh/referentiels';

/** Test SIRH › Onboarding & tâches › Tâches (Factorial tasks) : « Mes tâches » ou « Toutes ». */
export default async function OnboardingTachesPage({
  searchParams,
}: {
  searchParams: Promise<{ vue?: string }>;
}) {
  const ctx = await exigerContexteSirhPage(ROLES_SIRH_LECTURE);
  const { vue: vueDemandee } = await searchParams;
  const peutGerer = peutGererSirh(ctx.utilisateur.role);
  const vue = peutGerer && vueDemandee === 'toutes' ? 'toutes' : 'mes';
  const [taches, utilisateurs, employes] = await Promise.all([
    listerTachesOnboarding({ vue }),
    peutGerer ? listerUtilisateursOptions() : Promise.resolve<OptionSirh[]>([]),
    peutGerer
      ? listerEmployesOptions({ inclureInactifs: true })
      : Promise.resolve<OptionEmploye[]>([]),
  ]);
  const base = baseSirh(ctx);
  const ouvertes = taches.filter((t) => t.statut === 'a_faire' || t.statut === 'en_cours').length;

  return (
    <div className="space-y-4">
      <PageToolbar
        title="Onboarding & tâches"
        subtitle={`${vue === 'mes' ? 'Mes tâches' : 'Toutes les tâches'} · ${ouvertes} ouverte${ouvertes > 1 ? 's' : ''}`}
        backHref={base}
        backLabel="Test SIRH"
      />
      <OngletsOnboarding base={base} actif="taches" peutGerer={peutGerer} />
      <TachesListe
        taches={taches}
        vue={vue}
        peutGerer={peutGerer}
        utilisateurId={ctx.utilisateur.id}
        today={aujourdhuiIso()}
        baseOnboarding={`${base}/onboarding`}
        utilisateurs={utilisateurs}
        employes={employes}
        actions={{
          basculer: async (id, faite) => {
            'use server';
            return basculerTache(id, faite);
          },
          changerStatut: async (input) => {
            'use server';
            return changerStatutTache(input);
          },
          enregistrer: async (input) => {
            'use server';
            return enregistrerTache(input);
          },
          supprimer: async (id) => {
            'use server';
            return supprimerTache(id);
          },
        }}
      />
    </div>
  );
}
