import { SousNavigationSirh, type OngletSirh } from '@/components/test-sirh/sous-navigation';

export type OngletOnboarding = 'processus' | 'taches' | 'modeles';

/**
 * Onglets de la rubrique Onboarding & tâches (pilotés par l'URL). L'onglet
 * Modèles n'est proposé qu'aux gestionnaires RH.
 */
export function OngletsOnboarding({
  base,
  actif,
  peutGerer,
}: {
  /** Préfixe du module : `/<slug>/test-sirh`. */
  base: string;
  actif: OngletOnboarding;
  peutGerer: boolean;
}) {
  const onglets: OngletSirh[] = [
    { cle: 'processus', label: 'Processus', href: `${base}/onboarding` },
    { cle: 'taches', label: 'Tâches', href: `${base}/onboarding/taches` },
  ];
  if (peutGerer) {
    onglets.push({ cle: 'modeles', label: 'Modèles', href: `${base}/onboarding/modeles` });
  }
  return <SousNavigationSirh actif={actif} onglets={onglets} />;
}
