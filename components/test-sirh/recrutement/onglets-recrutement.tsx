import { SousNavigationSirh } from '@/components/test-sirh/sous-navigation';

export type OngletRecrutement = 'offres' | 'candidats';

/** Onglets de la rubrique Recrutement (pilotés par l'URL). */
export function OngletsRecrutement({
  base,
  actif,
  compteurs,
}: {
  base: string;
  actif: OngletRecrutement;
  compteurs?: { offres?: number; candidats?: number };
}) {
  return (
    <SousNavigationSirh
      actif={actif}
      onglets={[
        {
          cle: 'offres',
          label: 'Offres',
          href: `${base}/recrutement`,
          ...(compteurs?.offres !== undefined ? { compteur: compteurs.offres } : {}),
        },
        {
          cle: 'candidats',
          label: 'Vivier de candidats',
          href: `${base}/recrutement/candidats`,
          ...(compteurs?.candidats !== undefined ? { compteur: compteurs.candidats } : {}),
        },
      ]}
    />
  );
}
