import { CorpsCalendrier } from '@/components/test-sirh/absences/corps-calendrier';
import { SirhVide } from '@/components/test-sirh/sirh-bloc';
import {
  compacterGrille,
  type GrilleMois,
  type TypeCalendrier,
} from '@/lib/test-sirh/absences/calendrier-equipe';
import { formatDateFr } from '@/lib/test-sirh/format';
import { cn } from '@/lib/utils';

/**
 * Planning mensuel d'équipe des absences (server-compatible, aucun hook) :
 * lignes = collaborateurs, colonnes = jours. Cellule colorée selon le type
 * (`style.backgroundColor`), demi-journée = demi-cellule (matin | après-midi),
 * demande en attente en pointillés et atténuée, week-ends / fériés grisés.
 * Scroll horizontal dans la carte, colonne des noms figée.
 *
 * Le corps du tableau est un composant client (`CorpsCalendrier`) alimenté par
 * la grille compacte et rendu progressivement : la charge utile RSC ne porte
 * plus une entrée par cellule, et une grande équipe ne fige plus l'ouverture.
 */

function Legende({
  types,
  avecEnAttente,
}: {
  types: readonly TypeCalendrier[];
  avecEnAttente: boolean;
}) {
  return (
    <div
      className="flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-muted-foreground"
      aria-label="Légende"
    >
      {types.length === 0 && <span>Aucune absence sur ce mois.</span>}
      {types.map((t) => (
        <span key={t.id} className="inline-flex items-center gap-1.5">
          <span
            aria-hidden="true"
            className="inline-block h-3 w-4 rounded-sm"
            style={{ backgroundColor: t.couleur }}
          />
          {t.libelle}
        </span>
      ))}
      {avecEnAttente && (
        <span className="inline-flex items-center gap-1.5">
          <span
            aria-hidden="true"
            className="inline-block h-3 w-4 rounded-sm border border-dashed border-foreground/60 bg-slate-400 opacity-50"
          />
          En attente de validation
        </span>
      )}
      <span className="inline-flex items-center gap-1.5">
        <span aria-hidden="true" className="inline-flex h-3 w-4 gap-px">
          <span className="flex-1 rounded-l-sm bg-slate-400" />
          <span className="flex-1" />
        </span>
        Demi-journée (matin | après-midi)
      </span>
      <span className="inline-flex items-center gap-1.5">
        <span aria-hidden="true" className="inline-block h-3 w-4 rounded-sm bg-muted" />
        Week-end / férié chômé
      </span>
    </div>
  );
}

export function CalendrierEquipe({
  grille,
  types,
}: {
  grille: GrilleMois;
  /** Tous les types d'absence (couleurs) ; la légende ne montre que ceux présents. */
  types: readonly TypeCalendrier[];
}) {
  const compacte = compacterGrille(grille);
  const presents = new Set(compacte.segments.map((s) => s.typeAbsenceId));
  const avecEnAttente = compacte.segments.some((s) => s.statut === 'en_attente');
  const typesPresents = types.filter((t) => presents.has(t.id));

  return (
    <div className="space-y-3">
      <div className="overflow-hidden rounded-xl border bg-card">
        {grille.lignes.length === 0 ? (
          <div className="p-5">
            <SirhVide>Aucun collaborateur pour ces filtres.</SirhVide>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-xs">
              <thead className="text-muted-foreground">
                <tr>
                  <th
                    scope="col"
                    className="sticky left-0 z-20 min-w-44 border-b border-r bg-card px-3 py-2 text-left font-medium uppercase tracking-widest"
                  >
                    Collaborateur
                  </th>
                  {grille.jours.map((j) => (
                    <th
                      key={j.date}
                      scope="col"
                      title={
                        j.ferie ? `${formatDateFr(j.date)} — ${j.ferie}` : formatDateFr(j.date)
                      }
                      className={cn(
                        'min-w-7 border-b px-0 py-1 text-center font-normal',
                        j.weekEnd || j.ferie ? 'bg-muted' : 'bg-muted/40',
                        j.aujourdhui && 'font-semibold text-orange-700',
                      )}
                    >
                      <div>{j.initiale}</div>
                      <div className="tabular-nums">{j.numero}</div>
                    </th>
                  ))}
                </tr>
              </thead>
              <CorpsCalendrier
                jours={compacte.jours}
                segments={compacte.segments}
                lignes={compacte.lignes}
                types={types}
              />
            </table>
          </div>
        )}
      </div>
      <Legende types={typesPresents} avecEnAttente={avecEnAttente} />
    </div>
  );
}
