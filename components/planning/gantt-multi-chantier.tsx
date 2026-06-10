'use client';

import { ChevronDownIcon, ChevronRightIcon, ExternalLinkIcon } from 'lucide-react';
import Link from 'next/link';
import { useEffect, useMemo, useRef, useState } from 'react';

import { Card } from '@/components/ui/card';
import { GanttHeader } from '@/components/planning/gantt-header';
import {
  HEAD_H,
  PX_PAR_JOUR,
  ROW_H,
  catOf,
  computeRange,
  dnum,
  elargirRange,
  fromN,
  trierNiveaux,
  type Zoom,
} from '@/lib/planning/gantt-utils';
import type { PlanningChantierSommaire, PlanningTacheRow } from '@/lib/planning/planning';
import { STATUT_FILL } from '@/lib/planning/statut-labels';
import { cn } from '@/lib/utils';

/** Hauteur d'une ligne projet (un peu plus haute qu'une ligne tâche). */
const PROJ_H = 40;
/** Épaisseur de la barre projet (fine : c'est un trait de synthèse). */
const PROJ_BAR_H = 8;
/**
 * Largeur de la colonne de libellés (px, inline). En inline et non via une
 * classe Tailwind arbitraire : la colonne n'a aucune largeur intrinsèque (ses
 * enfants sont en `absolute`), et une classe `w-[...]` inédite peut ne pas être
 * régénérée par le JIT en HMR (cf. mémoire HMR/Tailwind).
 */
const LABEL_W = 260;
const ZOOM_LABEL: Record<Zoom, string> = {
  jour: 'Jour',
  semaine: 'Semaine',
  mois: 'Mois',
  annee: 'Année',
};
const ZOOMS: Zoom[] = ['jour', 'semaine', 'mois', 'annee'];

type Rangee =
  | { type: 'projet'; chantier: PlanningChantierSommaire; y: number; h: number }
  | { type: 'tache'; chantierId: string; tache: PlanningTacheRow; y: number; h: number }
  | { type: 'message'; key: string; y: number; h: number; texte: string };

/** Ordonne les tâches par niveau (ordre canonique) puis par `ordre`. */
function trierTaches(taches: ReadonlyArray<PlanningTacheRow>): PlanningTacheRow[] {
  const niveaux = trierNiveaux([...new Set(taches.map((t) => t.niveau ?? '__autres'))]);
  const rang = new Map(niveaux.map((n, i) => [n, i] as const));
  return [...taches].sort((a, b) => {
    const ra = rang.get(a.niveau ?? '__autres') ?? 0;
    const rb = rang.get(b.niveau ?? '__autres') ?? 0;
    if (ra !== rb) return ra - rb;
    return a.ordre - b.ordre;
  });
}

/**
 * Vue d'ensemble multi-chantier (lecture seule). Une barre par projet sur un axe
 * temporel partagé ; déplier un projet révèle ses tâches sur le même axe. Le
 * détail éditable reste accessible via le drill-down `/chantiers/[id]/planning`.
 *
 * Les tâches sont chargées paresseusement au premier dépliage (`chargerTaches`)
 * puis mises en cache. La plage temporelle est ancrée sur aujourd'hui (début à
 * J-15, fenêtre standard de 2 ans, étendue si un chantier va au-delà) et ne
 * dépend pas de l'état déplié/replié : l'axe ne « saute » donc pas au dépliage.
 */
export function GanttMultiChantier({
  chantiers,
  entrepriseSlug,
  today,
  chargerTaches,
}: {
  chantiers: PlanningChantierSommaire[];
  entrepriseSlug: string;
  /** Date du jour (ISO `AAAA-MM-JJ`), calculée côté serveur — ancre la plage à M-1. */
  today: string;
  chargerTaches: (chantierId: string) => Promise<PlanningTacheRow[] | null>;
}) {
  const [zoom, setZoom] = useState<Zoom>('mois');
  const [deplies, setDeplies] = useState<Set<string>>(new Set());
  const [tachesParChantier, setTachesParChantier] = useState<Map<string, PlanningTacheRow[]>>(
    new Map(),
  );
  const [chargement, setChargement] = useState<Set<string>>(new Set());

  const timelineRef = useRef<HTMLDivElement>(null);
  const labelsBodyRef = useRef<HTMLDivElement>(null);

  const px = PX_PAR_JOUR[zoom];

  const range = useMemo(
    () =>
      elargirRange(
        computeRange(
          chantiers.map((c) => ({
            dateDebutPrevue: c.dateMinTaches,
            dateFinPrevue: c.dateMaxTaches,
          })),
        ),
        today,
      ),
    [chantiers, today],
  );
  const W = Math.round(range.totalDays * px);

  const layout = useMemo(() => {
    const rows: Rangee[] = [];
    let y = 0;
    for (const c of chantiers) {
      rows.push({ type: 'projet', chantier: c, y, h: PROJ_H });
      y += PROJ_H;
      if (!deplies.has(c.id)) continue;
      const cached = tachesParChantier.get(c.id);
      if (cached === undefined) {
        rows.push({ type: 'message', key: `load-${c.id}`, y, h: ROW_H, texte: 'Chargement…' });
        y += ROW_H;
      } else if (cached.length === 0) {
        rows.push({
          type: 'message',
          key: `empty-${c.id}`,
          y,
          h: ROW_H,
          texte: 'Aucune tâche planifiée.',
        });
        y += ROW_H;
      } else {
        for (const t of trierTaches(cached)) {
          rows.push({ type: 'tache', chantierId: c.id, tache: t, y, h: ROW_H });
          y += ROW_H;
        }
      }
    }
    return { rows, height: y };
  }, [chantiers, deplies, tachesParChantier]);

  // Hauteur du cadre : ajustée au contenu, plafonnée pour rester scrollable.
  const boxH = Math.min(600, HEAD_H + layout.height + 16);

  // Synchro scroll vertical : timeline → labels (translateY).
  useEffect(() => {
    const ts = timelineRef.current;
    if (!ts) return;
    const onScroll = () => {
      if (labelsBodyRef.current) {
        labelsBodyRef.current.style.transform = `translateY(${-ts.scrollTop}px)`;
      }
    };
    ts.addEventListener('scroll', onScroll);
    return () => ts.removeEventListener('scroll', onScroll);
  }, []);

  async function toggle(id: string) {
    const ouvert = deplies.has(id);
    setDeplies((prev) => {
      const next = new Set(prev);
      if (ouvert) next.delete(id);
      else next.add(id);
      return next;
    });
    // Charge les tâches au premier dépliage seulement (puis cache).
    if (!ouvert && !tachesParChantier.has(id) && !chargement.has(id)) {
      setChargement((prev) => new Set(prev).add(id));
      try {
        const taches = await chargerTaches(id);
        setTachesParChantier((prev) => new Map(prev).set(id, taches ?? []));
      } finally {
        setChargement((prev) => {
          const next = new Set(prev);
          next.delete(id);
          return next;
        });
      }
    }
  }

  function lienChantier(id: string) {
    return `/${entrepriseSlug}/chantiers/${id}/planning`;
  }

  return (
    <Card className="overflow-hidden">
      <div className="flex items-center justify-between border-b px-5 py-3">
        <div className="flex items-center gap-3">
          <h3 className="text-base font-semibold">Vue d&apos;ensemble</h3>
          <span className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
            {chantiers.length} chantier{chantiers.length > 1 ? 's' : ''}
          </span>
        </div>
        <div
          className="flex items-center gap-0.5 rounded-lg border p-0.5 text-xs"
          role="group"
          aria-label="Niveau de zoom"
        >
          {ZOOMS.map((z) => (
            <button
              key={z}
              type="button"
              onClick={() => setZoom(z)}
              aria-pressed={zoom === z}
              className={cn(
                'rounded px-2.5 py-1 transition-colors',
                zoom === z
                  ? 'bg-primary font-medium text-primary-foreground'
                  : 'text-muted-foreground hover:bg-muted',
              )}
            >
              {ZOOM_LABEL[z]}
            </button>
          ))}
        </div>
      </div>

      <div className="flex" style={{ height: boxH }}>
        {/* Colonne fixe : libellés chantier / tâche */}
        <div
          className="relative flex-none overflow-hidden border-r bg-card"
          style={{ width: LABEL_W }}
        >
          <div
            className="absolute inset-x-0 top-0 z-10 flex items-end border-b bg-card px-3 pb-1 text-[11px] font-medium uppercase tracking-wide text-muted-foreground"
            style={{ height: HEAD_H }}
          >
            Chantier / Tâche
          </div>
          <div
            ref={labelsBodyRef}
            className="absolute inset-x-0 will-change-transform"
            style={{ top: HEAD_H }}
          >
            {layout.rows.map((r) => {
              if (r.type === 'projet') {
                const c = r.chantier;
                const ouvert = deplies.has(c.id);
                return (
                  <div
                    key={`l-${c.id}`}
                    className="absolute inset-x-0 flex items-center pr-1"
                    style={{ top: r.y, height: r.h }}
                  >
                    <button
                      type="button"
                      onClick={() => toggle(c.id)}
                      aria-expanded={ouvert}
                      aria-label={`${ouvert ? 'Replier' : 'Déplier'} ${c.libelle}`}
                      className="flex h-full min-w-0 flex-1 items-center gap-1.5 rounded px-2 text-left hover:bg-muted/60"
                    >
                      {ouvert ? (
                        <ChevronDownIcon className="size-4 flex-none text-muted-foreground" />
                      ) : (
                        <ChevronRightIcon className="size-4 flex-none text-muted-foreground" />
                      )}
                      <span
                        className="size-2 flex-none rounded-full"
                        style={{ background: STATUT_FILL[c.statut] }}
                        aria-hidden="true"
                      />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium">{c.libelle}</span>
                        <span className="block truncate font-mono text-[10px] text-muted-foreground">
                          {c.numero}
                        </span>
                      </span>
                      <span className="flex-none pl-1 text-xs font-medium tabular-nums text-muted-foreground">
                        {c.avancementPourcent !== null ? `${c.avancementPourcent}%` : '—'}
                      </span>
                    </button>
                    <Link
                      href={lienChantier(c.id)}
                      title={`Ouvrir le planning de ${c.libelle}`}
                      aria-label={`Ouvrir le planning de ${c.libelle}`}
                      className="flex-none rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
                    >
                      <ExternalLinkIcon className="size-3.5" />
                    </Link>
                  </div>
                );
              }
              if (r.type === 'tache') {
                const t = r.tache;
                const cat = catOf(t.corpsMetier);
                return (
                  <div
                    key={`l-${t.id}`}
                    className="absolute inset-x-0 flex items-center gap-1.5 pl-9 pr-2"
                    style={{ top: r.y, height: r.h }}
                  >
                    <span
                      className={cn('size-2 flex-none', t.estJalon ? 'rotate-45' : 'rounded-sm')}
                      style={{ background: cat.fill }}
                      aria-hidden="true"
                    />
                    <span
                      className="min-w-0 flex-1 truncate text-xs text-muted-foreground"
                      title={t.libelle}
                    >
                      {t.libelle}
                    </span>
                  </div>
                );
              }
              return (
                <div
                  key={r.key}
                  className="absolute inset-x-0 flex items-center pl-9 pr-2 text-xs italic text-muted-foreground"
                  style={{ top: r.y, height: r.h }}
                >
                  {r.texte}
                </div>
              );
            })}
          </div>
        </div>

        {/* Frise scrollable */}
        <div ref={timelineRef} className="relative min-w-0 flex-1 overflow-auto">
          <div
            className="sticky top-0 z-10 border-b bg-card"
            style={{ width: W, height: HEAD_H }}
          >
            <GanttHeader range={range} zoom={zoom} totalWidth={W} />
          </div>
          <div className="relative" style={{ width: W, height: layout.height }}>
            {/* Fond : séparateurs de mois, fonds de rangs, trait « Aujourd'hui » */}
            {(() => {
              const items: React.ReactNode[] = [];
              let d = range.start;
              while (d <= range.end) {
                items.push(
                  <div
                    key={`sep-${d}`}
                    className="absolute bg-border/60"
                    style={{ left: (d - range.start) * px, width: 1, top: 0, height: layout.height }}
                  />,
                );
                const dt = fromN(d);
                d = Math.floor(Date.UTC(dt.getUTCFullYear(), dt.getUTCMonth() + 1, 0) / 86_400_000) + 1;
              }
              for (const r of layout.rows) {
                if (r.type === 'projet') {
                  items.push(
                    <div
                      key={`bg-${r.chantier.id}`}
                      className="absolute border-b bg-muted/30"
                      style={{ left: 0, top: r.y, width: W, height: r.h }}
                    />,
                  );
                } else {
                  items.push(
                    <div
                      key={`bg-${r.type === 'tache' ? r.tache.id : r.key}`}
                      className="absolute border-b border-border/30"
                      style={{ left: 0, top: r.y, width: W, height: r.h }}
                    />,
                  );
                }
              }
              if (today) {
                const td = dnum(today);
                if (td >= range.start && td <= range.end) {
                  items.push(
                    <div
                      key="today"
                      className="absolute border-l-2 border-primary"
                      style={{ left: (td - range.start) * px + px / 2, top: 0, height: layout.height, width: 0 }}
                    />,
                  );
                }
              }
              return items;
            })()}

            {/* Barres */}
            {layout.rows.map((r) => {
              if (r.type === 'projet') {
                const c = r.chantier;
                if (!c.dateMinTaches || !c.dateMaxTaches) {
                  return (
                    <button
                      key={`b-${c.id}`}
                      type="button"
                      onClick={() => toggle(c.id)}
                      title={`${c.libelle} — aucune date planifiée`}
                      className="absolute flex items-center"
                      style={{ left: 8, top: r.y, height: r.h }}
                    >
                      <span className="rounded-full border border-dashed border-muted-foreground/40 px-2 py-0.5 text-[10px] text-muted-foreground">
                        à planifier
                      </span>
                    </button>
                  );
                }
                const left = (dnum(c.dateMinTaches) - range.start) * px;
                const w = Math.max(px, (dnum(c.dateMaxTaches) - dnum(c.dateMinTaches) + 1) * px);
                const pct = c.avancementPourcent ?? 0;
                const fill = STATUT_FILL[c.statut];
                return (
                  <button
                    key={`b-${c.id}`}
                    type="button"
                    onClick={() => toggle(c.id)}
                    title={`${c.libelle} — ${pct}%`}
                    aria-label={`${c.libelle} — ${pct}%, déplier`}
                    className="absolute flex items-center"
                    style={{ left, width: w, top: r.y, height: r.h }}
                  >
                    <span
                      className="block w-full overflow-hidden rounded-full"
                      style={{ height: PROJ_BAR_H, background: `${fill}40` }}
                    >
                      <span
                        className="block h-full rounded-full"
                        style={{ width: `${pct}%`, background: fill }}
                      />
                    </span>
                  </button>
                );
              }
              if (r.type !== 'tache') return null;
              const t = r.tache;
              if (!t.dateDebutPrevue || !t.dateFinPrevue) return null;
              const cat = catOf(t.corpsMetier);
              const pct = Math.max(0, Math.min(100, t.avancementPourcent ?? 0));
              if (t.estJalon) {
                const cx = (dnum(t.dateDebutPrevue) - range.start) * px + px / 2;
                return (
                  <div
                    key={`b-${t.id}`}
                    title={`${t.libelle} — ${pct}%`}
                    className="absolute"
                    style={{
                      left: cx - 7,
                      top: r.y + r.h / 2 - 7,
                      width: 14,
                      height: 14,
                      background: cat.fill,
                      transform: 'rotate(45deg)',
                      borderRadius: 3,
                      boxShadow: pct >= 100 ? `0 0 0 2px #fff, 0 0 0 3px ${cat.fill}` : undefined,
                    }}
                  />
                );
              }
              const left = (dnum(t.dateDebutPrevue) - range.start) * px;
              const w = Math.max(px, (dnum(t.dateFinPrevue) - dnum(t.dateDebutPrevue) + 1) * px);
              return (
                <div
                  key={`b-${t.id}`}
                  title={`${t.libelle} — ${pct}%`}
                  className="absolute flex items-center rounded-md text-[11px] font-medium text-white shadow-sm"
                  style={{ left, width: w, top: r.y + 5, height: r.h - 10, background: cat.fill }}
                >
                  <span className="relative truncate px-2 pb-1">
                    {t.libelle}
                    {` · ${pct}%`}
                  </span>
                  <div
                    className="pointer-events-none absolute"
                    style={{ left: 4, right: 4, bottom: 2, height: 3, borderRadius: 9999, background: 'rgba(255,255,255,0.35)' }}
                  >
                    <div
                      style={{ height: '100%', borderRadius: 9999, width: `${pct}%`, background: 'rgba(255,255,255,0.95)' }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </Card>
  );
}
