import { PageToolbar } from '@/components/layout/page-toolbar';
import { ModelesSection } from '@/components/test-sirh/onboarding/modeles-section';
import { OngletsOnboarding } from '@/components/test-sirh/onboarding/onglets-onboarding';
import { baseSirh, exigerContexteSirhPage } from '@/lib/test-sirh/contexte';
import {
  deplacerModeleTache,
  enregistrerModele,
  enregistrerModeleTache,
  supprimerModele,
  supprimerModeleTache,
} from '@/lib/test-sirh/onboarding/modeles';
import { listerModelesProcessus } from '@/lib/test-sirh/onboarding/queries';
import { ROLES_SIRH_GESTION } from '@/lib/test-sirh/permissions';

/** Test SIRH › Onboarding & tâches › Modèles de processus (gestionnaires RH). */
export default async function OnboardingModelesPage() {
  const ctx = await exigerContexteSirhPage(ROLES_SIRH_GESTION);
  const modeles = await listerModelesProcessus();
  const base = baseSirh(ctx);
  const actifs = modeles.filter((m) => m.actif).length;

  return (
    <div className="space-y-4">
      <PageToolbar
        title="Onboarding & tâches"
        subtitle={`${modeles.length} modèle${modeles.length > 1 ? 's' : ''} · ${actifs} actif${actifs > 1 ? 's' : ''}`}
        backHref={base}
        backLabel="Test SIRH"
      />
      <OngletsOnboarding base={base} actif="modeles" peutGerer />
      <ModelesSection
        modeles={modeles}
        actions={{
          enregistrerModele: async (input) => {
            'use server';
            return enregistrerModele(input);
          },
          supprimerModele: async (id) => {
            'use server';
            return supprimerModele(id);
          },
          enregistrerTache: async (input) => {
            'use server';
            return enregistrerModeleTache(input);
          },
          supprimerTache: async (id) => {
            'use server';
            return supprimerModeleTache(id);
          },
          deplacerTache: async (input) => {
            'use server';
            return deplacerModeleTache(input);
          },
        }}
      />
    </div>
  );
}
