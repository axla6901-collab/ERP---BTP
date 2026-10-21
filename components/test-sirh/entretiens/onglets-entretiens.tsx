import { SousNavigationSirh } from '@/components/test-sirh/sous-navigation';

export type OngletEntretiens = 'campagnes' | 'entretiens' | 'suivi';

/** Onglets de la rubrique Entretiens & objectifs (pilotés par l'URL). */
export function OngletsEntretiens({ base, actif }: { base: string; actif: OngletEntretiens }) {
  return (
    <SousNavigationSirh
      actif={actif}
      onglets={[
        { cle: 'campagnes', label: 'Campagnes', href: `${base}/entretiens` },
        { cle: 'entretiens', label: 'Entretiens', href: `${base}/entretiens/liste` },
        { cle: 'suivi', label: 'Suivi légal', href: `${base}/entretiens/suivi` },
      ]}
    />
  );
}
