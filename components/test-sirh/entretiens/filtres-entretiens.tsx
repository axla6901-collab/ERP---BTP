'use client';

import { useRouter } from 'next/navigation';

import { OptionSelect, type OptionListe } from '@/components/test-sirh/option-select';
import { FilterPills } from '@/components/ui/filter-pills';
import {
  LIBELLES_STATUT_ENTRETIEN,
  STATUTS_ENTRETIEN,
  type StatutEntretien,
} from '@/lib/validation/test-sirh/enums';

export type FiltresEntretiensCourants = {
  campagneId: string | null;
  statut: StatutEntretien | null;
  evaluateurId: string | null;
};

/** URL de la liste des entretiens pour un jeu de filtres (paramètres vides omis). */
export function urlFiltresEntretiens(base: string, f: FiltresEntretiensCourants): string {
  const params = new URLSearchParams();
  if (f.campagneId) params.set('campagne', f.campagneId);
  if (f.statut) params.set('statut', f.statut);
  if (f.evaluateurId) params.set('evaluateur', f.evaluateurId);
  const qs = params.toString();
  return `${base}/entretiens/liste${qs ? `?${qs}` : ''}`;
}

/** Filtres de la liste des entretiens, portés par l'URL (campagne, statut, évaluateur). */
export function FiltresEntretiens({
  base,
  campagnes,
  evaluateurs,
  courant,
  compteurs,
}: {
  /** Préfixe `/<slug>/test-sirh`. */
  base: string;
  campagnes: readonly OptionListe[];
  evaluateurs: readonly OptionListe[];
  courant: FiltresEntretiensCourants;
  /** Nombre d'entretiens par statut (pour les filtres campagne / évaluateur courants). */
  compteurs?: Partial<Record<StatutEntretien, number>>;
}) {
  const router = useRouter();

  return (
    <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
      <FilterPills
        aria-label="Filtrer par statut"
        items={[
          {
            key: 'tous',
            label: 'Tous',
            active: courant.statut === null,
            href: urlFiltresEntretiens(base, { ...courant, statut: null }),
          },
          ...STATUTS_ENTRETIEN.map((s) => {
            const n = compteurs?.[s];
            return {
              key: s,
              label: LIBELLES_STATUT_ENTRETIEN[s],
              active: courant.statut === s,
              href: urlFiltresEntretiens(base, { ...courant, statut: s }),
              ...(n !== undefined ? { count: n } : {}),
            };
          }),
        ]}
      />
      <div className="flex flex-col gap-2 sm:flex-row">
        <OptionSelect
          options={campagnes}
          value={courant.campagneId}
          onChange={(v) => router.push(urlFiltresEntretiens(base, { ...courant, campagneId: v }))}
          libelleAucune="Toutes les campagnes"
          aria-label="Filtrer par campagne"
          className="sm:w-56"
        />
        <OptionSelect
          options={evaluateurs}
          value={courant.evaluateurId}
          onChange={(v) => router.push(urlFiltresEntretiens(base, { ...courant, evaluateurId: v }))}
          libelleAucune="Tous les évaluateurs"
          aria-label="Filtrer par évaluateur"
          className="sm:w-56"
        />
      </div>
    </div>
  );
}
