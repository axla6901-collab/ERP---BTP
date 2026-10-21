import { PageToolbar } from '@/components/layout/page-toolbar';
import { LancerProcessusBouton } from '@/components/test-sirh/onboarding/lancer-processus-dialog';
import { OngletsOnboarding } from '@/components/test-sirh/onboarding/onglets-onboarding';
import { ProcessusListe } from '@/components/test-sirh/onboarding/processus-liste';
import { StatCard, StatGrid } from '@/components/ui/stat-card';
import { aujourdhuiIso } from '@/lib/test-sirh/calendrier';
import { baseSirh, exigerContexteSirhPage } from '@/lib/test-sirh/contexte';
import { lancerProcessus } from '@/lib/test-sirh/onboarding/processus';
import {
  kpiOnboarding,
  listerEmployesPourProcessus,
  listerModelesPourLancement,
  listerProcessus,
} from '@/lib/test-sirh/onboarding/queries';
import type { EmployeLancement, ModeleLancement } from '@/lib/test-sirh/onboarding/types';
import { peutGererSirh, ROLES_SIRH_LECTURE } from '@/lib/test-sirh/permissions';

/** Test SIRH › Onboarding & tâches › Processus (Factorial processes / MaterializedProcess). */
export default async function OnboardingProcessusPage() {
  const ctx = await exigerContexteSirhPage(ROLES_SIRH_LECTURE);
  const peutGerer = peutGererSirh(ctx.utilisateur.role);
  const [processus, kpi, modeles, employes] = await Promise.all([
    listerProcessus(),
    kpiOnboarding(),
    peutGerer ? listerModelesPourLancement() : Promise.resolve<ModeleLancement[]>([]),
    peutGerer ? listerEmployesPourProcessus() : Promise.resolve<EmployeLancement[]>([]),
  ]);
  const base = baseSirh(ctx);
  const today = aujourdhuiIso();

  return (
    <div className="space-y-4">
      <PageToolbar
        title="Onboarding & tâches"
        subtitle={`${kpi.processusEnCours} processus en cours`}
        backHref={base}
        backLabel="Test SIRH"
        actions={
          peutGerer ? (
            <LancerProcessusBouton
              modeles={modeles}
              employes={employes}
              today={today}
              baseFiches={`${base}/onboarding`}
              onSubmit={async (input) => {
                'use server';
                return lancerProcessus(input);
              }}
            />
          ) : null
        }
      />
      <OngletsOnboarding base={base} actif="processus" peutGerer={peutGerer} />
      <StatGrid>
        <StatCard
          label="Onboardings en cours"
          value={kpi.onboardingsEnCours}
          tone={kpi.onboardingsEnCours > 0 ? 'sky' : 'default'}
        />
        <StatCard label="Offboardings en cours" value={kpi.offboardingsEnCours} />
        <StatCard
          label="Tâches en retard"
          value={kpi.tachesEnRetard}
          tone={kpi.tachesEnRetard > 0 ? 'rose' : 'default'}
          hint={kpi.tachesEnRetard > 0 ? 'Échéance dépassée' : 'Aucun retard'}
        />
        <StatCard
          label="Tâches de la semaine"
          value={kpi.tachesSemaine}
          tone={kpi.tachesSemaine > 0 ? 'amber' : 'default'}
          hint="Échéance d’ici dimanche"
        />
      </StatGrid>
      <ProcessusListe processus={processus} today={today} baseFiches={`${base}/onboarding`} />
    </div>
  );
}
