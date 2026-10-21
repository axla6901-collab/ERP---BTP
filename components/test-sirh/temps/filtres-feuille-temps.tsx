'use client';

import { useRouter } from 'next/navigation';

import { OptionSelect, type OptionListe } from '@/components/test-sirh/option-select';
import { urlFeuilleTemps } from '@/lib/test-sirh/temps/feuille-temps';

type Props = {
  /** Chemin de la page (`/<slug>/test-sirh/temps`). */
  chemin: string;
  /** Lundi de la semaine affichée (conservé dans l'URL). */
  semaine: string;
  equipeId: string | null;
  siteId: string | null;
  equipes: readonly OptionListe[];
  sites: readonly OptionListe[];
};

/** Filtres équipe / site de la feuille de temps (pilotés par l'URL). */
export function FiltresFeuilleTemps({ chemin, semaine, equipeId, siteId, equipes, sites }: Props) {
  const router = useRouter();

  return (
    <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
      <OptionSelect
        options={equipes}
        value={equipeId}
        onChange={(v) => router.push(urlFeuilleTemps(chemin, { semaine, equipeId: v, siteId }))}
        libelleAucune="Toutes les équipes"
        aria-label="Filtrer par équipe"
        className="sm:w-56"
      />
      <OptionSelect
        options={sites}
        value={siteId}
        onChange={(v) => router.push(urlFeuilleTemps(chemin, { semaine, equipeId, siteId: v }))}
        libelleAucune="Tous les sites"
        aria-label="Filtrer par site"
        className="sm:w-56"
      />
    </div>
  );
}
