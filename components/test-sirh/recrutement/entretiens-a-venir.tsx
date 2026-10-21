import { CalendarClockIcon } from 'lucide-react';
import Link from 'next/link';

import { SirhVide } from '@/components/test-sirh/sirh-bloc';
import { formatJourCourt } from '@/lib/test-sirh/format';
import type { EntretienRecrutementAVenir } from '@/lib/test-sirh/recrutement/queries';
import { LIBELLES_ETAPE_CANDIDATURE } from '@/lib/validation/test-sirh/enums';

/**
 * Liste compacte des entretiens de recrutement à venir (tableau de bord SIRH,
 * données de `listerEntretiensRecrutementAVenir`). Server-compatible.
 */
export function EntretiensRecrutementAVenir({
  entretiens,
  base,
  vide = 'Aucun entretien de recrutement planifié.',
}: {
  entretiens: EntretienRecrutementAVenir[];
  /** Préfixe du module : `/<slug>/test-sirh`. */
  base: string;
  vide?: string;
}) {
  if (entretiens.length === 0) return <SirhVide>{vide}</SirhVide>;
  return (
    <ul className="divide-y">
      {entretiens.map((e) => (
        <li key={e.candidatureId} className="flex items-center justify-between gap-3 py-2">
          <div className="min-w-0">
            <Link
              href={`${base}/recrutement/offres/${e.offreId}`}
              className="block truncate text-sm font-medium hover:underline"
            >
              {e.candidatNom}
            </Link>
            <p className="truncate text-xs text-muted-foreground">
              {e.offreTitre} · {LIBELLES_ETAPE_CANDIDATURE[e.etape]}
            </p>
          </div>
          <span className="inline-flex shrink-0 items-center gap-1 text-sm tabular-nums text-orange-700">
            <CalendarClockIcon className="size-3.5" aria-hidden="true" />
            {formatJourCourt(e.date)} · {e.heure}
          </span>
        </li>
      ))}
    </ul>
  );
}
