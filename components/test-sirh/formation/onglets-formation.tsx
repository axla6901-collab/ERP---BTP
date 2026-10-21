import { SousNavigationSirh } from '@/components/test-sirh/sous-navigation';

export type OngletFormation = 'catalogue' | 'sessions' | 'habilitations';

/** Onglets de la rubrique Formation (pilotés par l'URL). */
export function OngletsFormation({ base, actif }: { base: string; actif: OngletFormation }) {
  return (
    <SousNavigationSirh
      actif={actif}
      onglets={[
        { cle: 'catalogue', label: 'Catalogue', href: `${base}/formation` },
        { cle: 'sessions', label: 'Sessions', href: `${base}/formation/sessions` },
        {
          cle: 'habilitations',
          label: 'Habilitations & recyclages',
          href: `${base}/formation/habilitations`,
        },
      ]}
    />
  );
}
