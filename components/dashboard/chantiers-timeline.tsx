import Link from 'next/link';
import { PlusIcon } from 'lucide-react';

import { couleurBarre, positionBarre, type CouleurBarre, type Frise } from '@/lib/dashboard/compute';
import type { ChantierTimeline } from '@/lib/dashboard/dashboard';
import { cn } from '@/lib/utils';

/** Classes de fond/texte par couleur de barre (énumérées : Tailwind ne tolère
 *  pas les noms de classes construits dynamiquement). */
const BARRE_CLASSES: Record<CouleurBarre, string> = {
  amber: 'bg-amber-200 text-amber-900',
  sky: 'bg-sky-200 text-sky-900',
  orange: 'bg-orange-200 text-orange-900',
  emerald: 'bg-emerald-200 text-emerald-900',
  rose: 'bg-rose-200 text-rose-900',
  neutral: 'bg-neutral-200 text-neutral-700',
};

type Props = {
  chantiers: ChantierTimeline[];
  frise: Frise;
  selectedId: string | null;
  entrepriseSlug: string;
};

/**
 * Timeline « Mes chantiers actifs » (mini-Gantt). Chaque barre est un lien qui
 * sélectionne le chantier via `?chantier=<id>` (la fiche dessous se met à jour
 * côté serveur). Reproduit la maquette M1 chantier-first.
 */
export function ChantiersTimeline({ chantiers, frise, selectedId, entrepriseSlug }: Props) {
  const base = `/${entrepriseSlug}/dashboard`;
  const nbActifs = chantiers.length;

  return (
    <section className="rounded-xl border bg-card shadow-sm">
      <div className="flex items-center justify-between gap-3 border-b px-5 py-3">
        <div>
          <h1 className="text-base font-semibold">Mes chantiers actifs</h1>
          <p className="text-xs text-muted-foreground">
            {nbActifs} chantier{nbActifs > 1 ? 's' : ''} · {frise.mois.length} mois affichés
          </p>
        </div>
        <Link
          href={`/${entrepriseSlug}/chantiers/nouveau`}
          className="inline-flex items-center gap-1 rounded bg-amber-500 px-3 py-1.5 text-xs font-medium text-white hover:bg-amber-600"
        >
          <PlusIcon className="size-3.5" /> Nouveau chantier
        </Link>
      </div>

      {nbActifs === 0 ? (
        <p className="px-5 py-10 text-center text-sm text-muted-foreground">
          Aucun chantier actif. Créez-en un pour le voir apparaître ici.
        </p>
      ) : (
        <div className="overflow-x-auto px-5 py-4">
          <div className="min-w-[840px]">
            {/* En-tête des mois */}
            <div className="relative ml-[140px] h-5 text-[11px] text-muted-foreground">
              {frise.mois.map((m) => (
                <div
                  key={m.cle}
                  className="absolute top-0 border-l border-border pl-2"
                  style={{ left: `${m.leftPct}%`, width: `${m.widthPct}%` }}
                >
                  {m.label}
                </div>
              ))}
            </div>

            {/* Lignes chantiers */}
            <div className="mt-2 space-y-1.5">
              {chantiers.map((c) => {
                const pos = positionBarre(c.dateDebut, c.dateFin, frise.debut, frise.fin);
                const active = c.id === selectedId;
                const couleur = couleurBarre(c.statut, c.enRetard);
                const av = c.avancementPourcent;
                const label = `${c.libelle}${av !== null ? ` · ${av}%` : ''}${c.enRetard ? ' ⚠' : ''}`;
                return (
                  <div key={c.id} className="flex items-center gap-3">
                    <div
                      className={cn(
                        'w-[140px] shrink-0 truncate text-xs',
                        active ? 'font-semibold text-amber-700' : 'font-medium text-foreground',
                      )}
                      title={c.libelle}
                    >
                      {c.libelle}
                    </div>
                    <div className="relative h-7 flex-1">
                      {pos ? (
                        <Link
                          href={`${base}?chantier=${c.id}`}
                          scroll={false}
                          aria-current={active ? 'true' : undefined}
                          title={`${c.libelle} — ${c.clientNom}`}
                          className={cn(
                            'absolute top-0 flex h-7 items-center overflow-hidden rounded-md px-2 text-[11px] transition-transform hover:-translate-y-0.5',
                            active
                              ? 'bg-amber-500 font-medium text-white ring-2 ring-amber-500 ring-offset-2 ring-offset-card'
                              : BARRE_CLASSES[couleur],
                          )}
                          style={{ left: `${pos.leftPct}%`, width: `${pos.widthPct}%` }}
                        >
                          <span className="truncate">{label}</span>
                        </Link>
                      ) : (
                        <Link
                          href={`${base}?chantier=${c.id}`}
                          scroll={false}
                          title={`${c.libelle} — non planifié`}
                          className={cn(
                            'absolute left-0 top-0 flex h-7 items-center rounded-md border border-dashed px-2 text-[11px] text-muted-foreground hover:bg-muted',
                            active && 'border-amber-500 text-amber-700',
                          )}
                        >
                          {c.libelle} · non planifié
                        </Link>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
