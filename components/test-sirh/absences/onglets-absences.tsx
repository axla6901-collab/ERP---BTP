import { SousNavigationSirh } from '@/components/test-sirh/sous-navigation';

export type OngletAbsences = 'demandes' | 'calendrier' | 'compteurs' | 'parametres';

/** Onglets de la rubrique Absences (pilotés par l'URL). `base` = `/<slug>/test-sirh`. */
export function OngletsAbsences({
  base,
  actif,
  enAttente,
}: {
  base: string;
  actif: OngletAbsences;
  /** Nombre de demandes en attente, affiché sur l'onglet « Demandes ». */
  enAttente?: number;
}) {
  return (
    <SousNavigationSirh
      actif={actif}
      onglets={[
        {
          cle: 'demandes',
          label: 'Demandes',
          href: `${base}/absences`,
          ...(enAttente !== undefined ? { compteur: enAttente } : {}),
        },
        { cle: 'calendrier', label: 'Calendrier', href: `${base}/absences/calendrier` },
        { cle: 'compteurs', label: 'Compteurs', href: `${base}/absences/compteurs` },
        { cle: 'parametres', label: 'Paramètres', href: `${base}/absences/parametres` },
      ]}
    />
  );
}
