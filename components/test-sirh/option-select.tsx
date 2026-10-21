'use client';

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { cn } from '@/lib/utils';

/** Valeur sentinelle de l'option « aucune » (Base UI n'accepte pas `null` comme item). */
export const AUCUNE_OPTION = '__aucune__';

export type OptionListe = { id: string; label: string };

/** Construit des options depuis une énumération + ses libellés FR. */
export function optionsDepuisEnum<V extends string>(
  valeurs: readonly V[],
  libelles: Record<V, string>,
): OptionListe[] {
  return valeurs.map((v) => ({ id: v, label: libelles[v] }));
}

type Props = {
  options: readonly OptionListe[];
  value: string | null;
  onChange: (value: string | null) => void;
  /** Autorise la valeur vide (option « — »). Défaut : true. */
  autoriserAucune?: boolean;
  libelleAucune?: string;
  id?: string;
  disabled?: boolean;
  className?: string;
  'aria-label'?: string;
};

/**
 * Sélecteur générique du module Test SIRH (employé, chantier, site, énumération…).
 * Enveloppe le Select Base UI : gère la sentinelle « aucune » et affiche le
 * libellé de l'option choisie. ⚠️ Une valeur absente de `options` (ex. employé
 * devenu inactif) s'affiche comme « aucune » : l'appelant doit l'ajouter aux
 * options s'il veut la conserver visible en édition.
 */
export function OptionSelect({
  options,
  value,
  onChange,
  autoriserAucune = true,
  libelleAucune = '—',
  id,
  disabled,
  className,
  'aria-label': ariaLabel,
}: Props) {
  const courant = value ?? (autoriserAucune ? AUCUNE_OPTION : (options[0]?.id ?? AUCUNE_OPTION));
  return (
    <Select
      value={courant}
      onValueChange={(v) => onChange(!v || v === AUCUNE_OPTION ? null : String(v))}
      disabled={disabled}
    >
      <SelectTrigger id={id} aria-label={ariaLabel} className={cn('w-full', className)}>
        <SelectValue>
          {(v) =>
            !v || v === AUCUNE_OPTION
              ? libelleAucune
              : (options.find((o) => o.id === v)?.label ?? libelleAucune)
          }
        </SelectValue>
      </SelectTrigger>
      <SelectContent>
        {autoriserAucune && <SelectItem value={AUCUNE_OPTION}>{libelleAucune}</SelectItem>}
        {options.map((o) => (
          <SelectItem key={o.id} value={o.id}>
            {o.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
