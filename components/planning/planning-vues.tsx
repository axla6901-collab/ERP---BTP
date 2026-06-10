'use client';

import { useState } from 'react';

import { GanttMultiChantier } from '@/components/planning/gantt-multi-chantier';
import { PlanningListeTable } from '@/components/planning/planning-liste-table';
import type { PlanningChantierSommaire, PlanningTacheRow } from '@/lib/planning/planning';
import { cn } from '@/lib/utils';

type Vue = 'ensemble' | 'liste';

const VUES: { cle: Vue; label: string }[] = [
  { cle: 'ensemble', label: "Vue d'ensemble" },
  { cle: 'liste', label: 'Liste' },
];

/**
 * Sélecteur de vue du planning : bascule entre la « Vue d'ensemble »
 * (Gantt multi-chantier dépliable) et la « Liste » (tableau cliquable).
 *
 * La « Vue d'ensemble » est gardée par le droit `PLANNING_VUE_ENSEMBLE`
 * (`peutVueEnsemble`). Sans ce droit, aucune bascule n'est proposée : seule la
 * « Liste » est rendue.
 */
export function PlanningVues({
  chantiers,
  entrepriseSlug,
  today,
  peutVueEnsemble,
  chargerTaches,
}: {
  chantiers: PlanningChantierSommaire[];
  entrepriseSlug: string;
  today: string;
  peutVueEnsemble: boolean;
  chargerTaches: (chantierId: string) => Promise<PlanningTacheRow[] | null>;
}) {
  const [vue, setVue] = useState<Vue>('ensemble');

  // Sans le droit : pas de bascule, uniquement la Liste.
  if (!peutVueEnsemble) {
    return <PlanningListeTable chantiers={chantiers} entrepriseSlug={entrepriseSlug} />;
  }

  return (
    <div className="space-y-3">
      <div
        className="flex w-fit items-center gap-0.5 rounded-lg border p-0.5 text-xs"
        role="group"
        aria-label="Choix de la vue"
      >
        {VUES.map((v) => (
          <button
            key={v.cle}
            type="button"
            onClick={() => setVue(v.cle)}
            aria-pressed={vue === v.cle}
            className={cn(
              'rounded px-2.5 py-1 transition-colors',
              vue === v.cle
                ? 'bg-primary font-medium text-primary-foreground'
                : 'text-muted-foreground hover:bg-muted',
            )}
          >
            {v.label}
          </button>
        ))}
      </div>

      {vue === 'ensemble' ? (
        <GanttMultiChantier
          chantiers={chantiers}
          entrepriseSlug={entrepriseSlug}
          today={today}
          chargerTaches={chargerTaches}
        />
      ) : (
        <PlanningListeTable chantiers={chantiers} entrepriseSlug={entrepriseSlug} />
      )}
    </div>
  );
}
