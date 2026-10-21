import { SirhVide } from '@/components/test-sirh/sirh-bloc';
import { Badge } from '@/components/ui/badge';
import { regrouperParSemaine, type BadgeageResume } from '@/lib/test-sirh/dossier/badgeages';
import { formatDateFr, formatJourCourt, formatMinutes } from '@/lib/test-sirh/format';

/**
 * Badgeages récents d'un collaborateur, regroupés par semaine avec le total
 * travaillé (server-compatible). Le détail et la saisie restent dans
 * Temps de travail.
 */
export function BadgeagesRecents({
  badgeages,
  lienFeuille,
}: {
  badgeages: readonly BadgeageResume[];
  /** Lien vers la feuille de temps (absent pour un rôle sans accès). */
  lienFeuille?: string | null;
}) {
  const semaines = regrouperParSemaine(badgeages);
  if (semaines.length === 0) {
    return <SirhVide>Aucun badgeage sur les quatre dernières semaines.</SirhVide>;
  }
  return (
    <div className="space-y-3">
      {semaines.map((s) => (
        <div key={s.lundi} className="overflow-hidden rounded-md border">
          <div className="flex flex-wrap items-center justify-between gap-2 bg-muted/40 px-4 py-2 text-xs">
            <span className="font-medium uppercase tracking-widest text-muted-foreground">
              Semaine du {formatDateFr(s.lundi)} au {formatDateFr(s.dimanche)}
            </span>
            <span className="flex items-center gap-2">
              {s.nbEnCours > 0 && <Badge tone="sky">{s.nbEnCours} en cours</Badge>}
              {s.nbNonValides > 0 && <Badge tone="amber">{s.nbNonValides} à valider</Badge>}
              <span className="font-semibold tabular-nums">{formatMinutes(s.minutes)}</span>
            </span>
          </div>
          <ul className="divide-y text-sm">
            {s.badgeages.map((b) => (
              <li
                key={b.id}
                className="flex flex-wrap items-center justify-between gap-2 px-4 py-1.5"
              >
                <span className="tabular-nums">
                  {formatJourCourt(b.dateBadgeage)} · {b.heureDebut} → {b.heureFin ?? '…'}
                  {b.pauseMinutes > 0 && (
                    <span className="text-xs text-muted-foreground">
                      {' '}
                      (pause {b.pauseMinutes} min)
                    </span>
                  )}
                </span>
                <span className="flex items-center gap-2 text-xs text-muted-foreground">
                  {b.chantierLabel && <span>{b.chantierLabel}</span>}
                  <span className="font-medium tabular-nums text-foreground">
                    {b.enCours ? 'en cours' : formatMinutes(b.minutes)}
                  </span>
                </span>
              </li>
            ))}
          </ul>
        </div>
      ))}
      {lienFeuille && (
        <a href={lienFeuille} className="inline-block text-xs text-amber-700 hover:underline">
          Ouvrir la feuille de temps →
        </a>
      )}
    </div>
  );
}
