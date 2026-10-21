'use client';

import { useRouter } from 'next/navigation';

import { OptionSelect, type OptionListe } from '@/components/test-sirh/option-select';
import { Label } from '@/components/ui/label';
import { hrefCalendrier, type FiltresCalendrier } from '@/lib/test-sirh/absences/filtres';

type Props = {
  /** `/<slug>/test-sirh/absences/calendrier`. */
  base: string;
  filtres: FiltresCalendrier;
  equipes: readonly OptionListe[];
  sites: readonly OptionListe[];
};

/** Filtres équipe / site du planning mensuel (navigation par l'URL, mois conservé). */
export function FiltresCalendrierAbsences({ base, filtres, equipes, sites }: Props) {
  const router = useRouter();
  return (
    <div className="flex flex-wrap items-end gap-3">
      <div className="grid w-full gap-1 sm:w-56">
        <Label htmlFor="filtre-equipe" className="text-xs text-muted-foreground">
          Équipe
        </Label>
        <OptionSelect
          id="filtre-equipe"
          options={equipes}
          value={filtres.equipeId}
          onChange={(v) => router.push(hrefCalendrier(base, { ...filtres, equipeId: v }))}
          libelleAucune="Toutes les équipes"
          aria-label="Filtrer par équipe"
        />
      </div>
      <div className="grid w-full gap-1 sm:w-56">
        <Label htmlFor="filtre-site" className="text-xs text-muted-foreground">
          Site
        </Label>
        <OptionSelect
          id="filtre-site"
          options={sites}
          value={filtres.siteId}
          onChange={(v) => router.push(hrefCalendrier(base, { ...filtres, siteId: v }))}
          libelleAucune="Tous les sites"
          aria-label="Filtrer par site"
        />
      </div>
    </div>
  );
}
