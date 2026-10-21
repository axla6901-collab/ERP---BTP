'use client';

import { StarIcon } from 'lucide-react';

import { cn } from '@/lib/utils';

const NOTES = [1, 2, 3, 4, 5] as const;

/**
 * Note de 1 à 5 en étoiles. Lecture seule sans `onChange` ; sinon chaque étoile
 * est un bouton (cliquer la note courante la retire → `null`).
 */
export function NoteEtoiles({
  note,
  onChange,
  disabled,
  taille = 'sm',
  libelle = 'Note',
}: {
  note: number | null;
  onChange?: (note: number | null) => void;
  disabled?: boolean;
  taille?: 'sm' | 'md';
  /** Préfixe des libellés accessibles (« Note », « Note de l’avis »…). */
  libelle?: string;
}) {
  const classeEtoile = taille === 'md' ? 'size-5' : 'size-3.5';
  const valeur = note ?? 0;

  if (!onChange) {
    return (
      <span
        className="inline-flex items-center gap-0.5"
        role="img"
        aria-label={note ? `${libelle} : ${note} sur 5` : `${libelle} : non noté`}
      >
        {NOTES.map((n) => (
          <StarIcon
            key={n}
            aria-hidden="true"
            className={cn(
              classeEtoile,
              n <= valeur ? 'fill-amber-400 text-amber-400' : 'text-muted-foreground/40',
            )}
          />
        ))}
      </span>
    );
  }

  return (
    <span className="inline-flex items-center gap-0.5" role="group" aria-label={libelle}>
      {NOTES.map((n) => (
        <button
          key={n}
          type="button"
          disabled={disabled}
          onClick={() => onChange(n === note ? null : n)}
          aria-label={`${libelle} : ${n} sur 5`}
          aria-pressed={n <= valeur}
          className="rounded p-0.5 transition-colors hover:bg-amber-50 disabled:cursor-not-allowed disabled:opacity-50 dark:hover:bg-amber-900/30"
        >
          <StarIcon
            aria-hidden="true"
            className={cn(
              classeEtoile,
              n <= valeur ? 'fill-amber-400 text-amber-400' : 'text-muted-foreground/50',
            )}
          />
        </button>
      ))}
    </span>
  );
}
