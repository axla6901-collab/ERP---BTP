/**
 * En-tête temporel du Gantt : bande mois (haut) + bande jours (zoom `jour`) ou
 * numéros de semaine (zoom `semaine`/`mois`). Composant pur (range/zoom/largeur),
 * partagé entre le Gantt mono-chantier éditable et la vue d'ensemble read-only.
 */

import { HEAD_H, PX_PAR_JOUR, fromN, isoWeek, type Range, type Zoom } from '@/lib/planning/gantt-utils';
import { cn } from '@/lib/utils';

export function GanttHeader({
  range,
  zoom,
  totalWidth,
}: {
  range: Range;
  zoom: Zoom;
  totalWidth: number;
}) {
  const px = PX_PAR_JOUR[zoom];
  const items: React.ReactNode[] = [];

  // Bande mois
  let d = range.start;
  while (d <= range.end) {
    const dt = fromN(d);
    const mEnd = Math.floor(Date.UTC(dt.getUTCFullYear(), dt.getUTCMonth() + 1, 0) / 86_400_000);
    const from = Math.max(d, range.start);
    const to = Math.min(mEnd, range.end);
    const left = (from - range.start) * px;
    const w = (to - from + 1) * px;
    items.push(
      <div
        key={`m-${d}`}
        className="absolute flex items-center border-l border-border px-2 text-[11px] font-semibold text-foreground"
        style={{ left, width: w, top: 0, height: 26 }}
      >
        {`${fromN(d).toLocaleString('fr-FR', { month: 'short', timeZone: 'UTC' })} ${
          dt.getUTCMonth() === 0 || from === range.start ? dt.getUTCFullYear() : ''
        }`}
      </div>,
    );
    d = mEnd + 1;
  }

  // Bande inférieure : jours (zoom jour), n° de semaine (semaine/mois).
  // En zoom année, on laisse seulement la bande mois (les semaines seraient
  // illisibles à cette densité).
  if (zoom === 'jour') {
    for (let i = range.start; i <= range.end; i++) {
      const dt = fromN(i);
      const dow = dt.getUTCDay();
      const we = dow === 0 || dow === 6;
      items.push(
        <div
          key={`d-${i}`}
          className={cn(
            'absolute text-center text-[9px]',
            we ? 'text-muted-foreground/40' : 'text-muted-foreground',
          )}
          style={{ left: (i - range.start) * px, width: px, top: 28 }}
        >
          {dt.getUTCDate()}
        </div>,
      );
    }
  } else if (zoom === 'semaine' || zoom === 'mois') {
    let i = range.start;
    while (fromN(i).getUTCDay() !== 1 && i <= range.end) i++;
    for (; i <= range.end; i += 7) {
      items.push(
        <div
          key={`w-${i}`}
          className="absolute border-l border-border/60 pl-1 text-[9px] text-muted-foreground"
          style={{ left: (i - range.start) * px, width: 7 * px, top: 30 }}
        >
          S{isoWeek(fromN(i))}
        </div>,
      );
    }
  }

  return (
    <div className="relative" style={{ width: totalWidth, height: HEAD_H }}>
      {items}
    </div>
  );
}
