'use client';

import { useRenduProgressif } from '@/lib/hooks/use-rendu-progressif';
import {
  decompacterCellules,
  type CelluleCalendrier,
  type JourCalendrier,
  type LigneCalendrierCompacte,
  type SegmentCalendrier,
  type TypeCalendrier,
} from '@/lib/test-sirh/absences/calendrier-equipe';
import { formatDateFr } from '@/lib/test-sirh/format';
import { cn } from '@/lib/utils';

/**
 * Corps (`<tbody>`) du planning mensuel d'équipe, côté client : reçoit la grille
 * COMPACTE (`compacterGrille`) et rend les collaborateurs progressivement — 40
 * d'emblée (rendu serveur et hydratation), le reste par tranches. Une équipe de
 * 130 salariés × 31 jours ne fige plus l'ouverture de la page.
 */

type TypesParId = ReadonlyMap<string, TypeCalendrier>;

function libelleSegment(segment: SegmentCalendrier, types: TypesParId): string {
  const type = types.get(segment.typeAbsenceId);
  const libelle = type?.libelle ?? 'Absence';
  return segment.statut === 'en_attente' ? `${libelle} (en attente)` : libelle;
}

function titreCellule(c: CelluleCalendrier, employe: string, types: TypesParId): string {
  const parties = [`${employe} — ${formatDateFr(c.date)}`];
  if (c.ferie) parties.push(`férié : ${c.ferie}`);
  if (c.matin && c.apresMidi && c.matin.absenceId === c.apresMidi.absenceId) {
    parties.push(libelleSegment(c.matin, types));
  } else {
    if (c.matin) parties.push(`matin : ${libelleSegment(c.matin, types)}`);
    if (c.apresMidi) parties.push(`après-midi : ${libelleSegment(c.apresMidi, types)}`);
  }
  return parties.join(' · ');
}

// `bloc` et `contenuCellule` restent de simples fonctions (pas des composants) :
// une instance de composant par cellule (≈ 4 000) alourdirait inutilement le rendu.
function bloc(
  segment: SegmentCalendrier | null,
  types: TypesParId,
  forme: 'pleine' | 'gauche' | 'droite',
) {
  if (!segment) return <div className="flex-1" />;
  const couleur = types.get(segment.typeAbsenceId)?.couleur ?? '#94a3b8';
  return (
    <div
      data-testid="segment-absence"
      data-statut={segment.statut}
      className={cn(
        'flex-1',
        forme === 'pleine' && 'rounded-sm',
        forme === 'gauche' && 'rounded-l-sm',
        forme === 'droite' && 'rounded-r-sm',
        segment.statut === 'en_attente' && 'border border-dashed border-foreground/60 opacity-50',
      )}
      style={{ backgroundColor: couleur }}
    />
  );
}

function contenuCellule(cellule: CelluleCalendrier, types: TypesParId) {
  const { matin, apresMidi } = cellule;
  if (!matin && !apresMidi) return null;
  if (matin && apresMidi && matin.absenceId === apresMidi.absenceId) {
    return <div className="flex h-full">{bloc(matin, types, 'pleine')}</div>;
  }
  return (
    <div className="flex h-full gap-px">
      {bloc(matin, types, 'gauche')}
      {bloc(apresMidi, types, 'droite')}
    </div>
  );
}

export function CorpsCalendrier({
  jours,
  segments,
  lignes,
  types,
}: {
  jours: JourCalendrier[];
  segments: SegmentCalendrier[];
  lignes: LigneCalendrierCompacte[];
  types: readonly TypeCalendrier[];
}) {
  const typesParId: TypesParId = new Map(types.map((t) => [t.id, t]));
  const limite = useRenduProgressif(lignes.length, { initial: 40, pas: 40 });

  return (
    <tbody className="divide-y">
      {lignes.slice(0, limite).map((ligne) => (
        <tr key={ligne.employe.id}>
          <th
            scope="row"
            className="sticky left-0 z-10 whitespace-nowrap border-r bg-card px-3 py-1.5 text-left text-sm font-medium"
          >
            {ligne.employe.label}
          </th>
          {decompacterCellules(jours, segments, ligne).map((c) => (
            <td
              key={c.date}
              // Infobulle seulement là où il y a quelque chose à dire
              // (absence, férié) : une par cellule doublait le poids de la page.
              title={
                c.matin || c.apresMidi || c.ferie
                  ? titreCellule(c, ligne.employe.label, typesParId)
                  : undefined
              }
              className={cn('h-8 border-l p-0.5', (c.weekEnd || c.ferie) && 'bg-muted/70')}
            >
              {contenuCellule(c, typesParId)}
            </td>
          ))}
        </tr>
      ))}
      {limite < lignes.length && (
        <tr aria-live="polite">
          <td
            colSpan={jours.length + 1}
            className="px-3 py-2 text-left text-xs italic text-muted-foreground"
          >
            Affichage des collaborateurs… {limite} / {lignes.length}
          </td>
        </tr>
      )}
    </tbody>
  );
}
