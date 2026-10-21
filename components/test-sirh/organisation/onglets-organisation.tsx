import { SousNavigationSirh } from '@/components/test-sirh/sous-navigation';

export type OngletOrganisation = 'sites' | 'equipes' | 'postes';

/** Onglets de la rubrique Organisation (pilotés par l'URL). */
export function OngletsOrganisation({ base, actif }: { base: string; actif: OngletOrganisation }) {
  return (
    <SousNavigationSirh
      actif={actif}
      onglets={[
        { cle: 'sites', label: 'Sites', href: `${base}/organisation` },
        { cle: 'equipes', label: 'Équipes', href: `${base}/organisation/equipes` },
        { cle: 'postes', label: 'Postes', href: `${base}/organisation/postes` },
      ]}
    />
  );
}
