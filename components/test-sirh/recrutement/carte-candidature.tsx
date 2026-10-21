'use client';

import {
  CalendarClockIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  MessageSquareIcon,
} from 'lucide-react';
import Link from 'next/link';

import { Button } from '@/components/ui/button';
import { formatDateFr, nomComplet } from '@/lib/test-sirh/format';
import { dateHeureParis, formatEntretien } from '@/lib/test-sirh/recrutement/fuseau';
import {
  estEtapePipeline,
  etapePrecedente,
  etapeSuivante,
} from '@/lib/test-sirh/recrutement/pipeline';
import type { CandidatureOffre } from '@/lib/test-sirh/recrutement/queries';
import { cn } from '@/lib/utils';
import {
  LIBELLES_ETAPE_CANDIDATURE,
  LIBELLES_MOTIF_REFUS,
  LIBELLES_SOURCE_CANDIDAT,
  type EtapeCandidature,
} from '@/lib/validation/test-sirh/enums';

import { NoteEtoiles } from './note-etoiles';

type Props = {
  candidature: CandidatureOffre;
  base: string;
  today: string;
  peutGerer: boolean;
  /** Une action du pipeline est en cours (boutons désactivés). */
  occupe?: boolean;
  onOuvrir: (id: string) => void;
  onDeplacer: (id: string, etape: EtapeCandidature) => void;
  onEmbaucher: (id: string) => void;
};

/**
 * Carte d'une candidature dans le kanban : candidat (lien vers la fiche),
 * source, date, note en étoiles, prochain entretien, nombre d'avis, et
 * actions rapides (étape précédente / suivante, embauche en fin de pipeline).
 */
export function CarteCandidature({
  candidature: c,
  base,
  today,
  peutGerer,
  occupe = false,
  onOuvrir,
  onDeplacer,
  onEmbaucher,
}: Props) {
  const nom = nomComplet(c.prenom, c.nom);
  const active = estEtapePipeline(c.etape);
  const precedente = etapePrecedente(c.etape);
  const suivante = etapeSuivante(c.etape);
  const entretien = active ? dateHeureParis(c.dateEntretien) : null;
  const entretienAVenir = entretien !== null && entretien.date >= today;

  return (
    <article
      className="rounded-lg border bg-card p-3 shadow-sm"
      aria-label={`Candidature de ${nom}`}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <Link
            href={`${base}/recrutement/candidats/${c.candidatId}`}
            className="block truncate text-sm font-medium hover:underline"
          >
            {nom}
          </Link>
          <p className="truncate text-xs text-muted-foreground">
            {LIBELLES_SOURCE_CANDIDAT[c.source]} · {formatDateFr(c.dateCandidature)}
          </p>
        </div>
        <NoteEtoiles note={c.note} />
      </div>

      {entretien && (
        <p
          className={cn(
            'mt-2 flex items-center gap-1 text-xs',
            entretienAVenir ? 'font-medium text-orange-700' : 'text-muted-foreground',
          )}
        >
          <CalendarClockIcon className="size-3.5 shrink-0" aria-hidden="true" />
          {entretienAVenir ? 'Entretien le ' : 'Entretien passé : '}
          {formatEntretien(c.dateEntretien)}
        </p>
      )}
      {c.etape === 'refusee' && c.motifRefus && (
        <p className="mt-1 text-xs text-rose-700 dark:text-rose-300">
          Motif : {LIBELLES_MOTIF_REFUS[c.motifRefus]}
        </p>
      )}

      <div className="mt-2 flex flex-wrap items-center justify-between gap-1">
        <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
          <MessageSquareIcon className="size-3.5" aria-hidden="true" />
          {c.avis.length} avis
        </span>
        <div className="flex items-center gap-1">
          {peutGerer && active && (
            <>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-7 w-7 p-0"
                disabled={!precedente || occupe}
                onClick={() => precedente && onDeplacer(c.id, precedente)}
                title={
                  precedente
                    ? `Revenir à « ${LIBELLES_ETAPE_CANDIDATURE[precedente]} »`
                    : 'Première étape'
                }
                aria-label={
                  precedente
                    ? `Revenir à l’étape ${LIBELLES_ETAPE_CANDIDATURE[precedente]}`
                    : 'Première étape du pipeline'
                }
              >
                <ChevronLeftIcon className="size-4" />
              </Button>
              {suivante ? (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-7 w-7 p-0"
                  disabled={occupe}
                  onClick={() => onDeplacer(c.id, suivante)}
                  title={`Passer à « ${LIBELLES_ETAPE_CANDIDATURE[suivante]} »`}
                  aria-label={`Passer à l’étape ${LIBELLES_ETAPE_CANDIDATURE[suivante]}`}
                >
                  <ChevronRightIcon className="size-4" />
                </Button>
              ) : (
                <Button
                  type="button"
                  size="sm"
                  className="h-7"
                  disabled={occupe}
                  onClick={() => onEmbaucher(c.id)}
                >
                  Embaucher
                </Button>
              )}
            </>
          )}
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-7"
            onClick={() => onOuvrir(c.id)}
            aria-label={`Détails de la candidature de ${nom}`}
          >
            Détails
          </Button>
        </div>
      </div>
    </article>
  );
}
