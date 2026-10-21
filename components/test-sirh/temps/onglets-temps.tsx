import { SousNavigationSirh } from '@/components/test-sirh/sous-navigation';

export type OngletTemps = 'badgeages' | 'heures-sup' | 'horaires';

/** Onglets de la rubrique Temps de travail (pilotés par l'URL). */
export function OngletsTemps({
  base,
  actif,
  heuresSupEnAttente,
}: {
  base: string;
  actif: OngletTemps;
  /** Compteur de demandes en attente affiché sur l'onglet Heures sup. */
  heuresSupEnAttente?: number;
}) {
  return (
    <SousNavigationSirh
      actif={actif}
      onglets={[
        { cle: 'badgeages', label: 'Badgeages', href: `${base}/temps` },
        {
          cle: 'heures-sup',
          label: 'Heures sup.',
          href: `${base}/temps/heures-sup`,
          ...(heuresSupEnAttente ? { compteur: heuresSupEnAttente } : {}),
        },
        { cle: 'horaires', label: 'Horaires', href: `${base}/temps/horaires` },
      ]}
    />
  );
}
