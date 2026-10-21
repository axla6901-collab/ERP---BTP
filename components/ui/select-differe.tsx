'use client';

import { ChevronDownIcon } from 'lucide-react';
import * as React from 'react';

import {
  CLASSES_DECLENCHEUR_SELECT,
  Select,
  SelectContent,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { cn } from '@/lib/utils';

type Props = {
  /** Valeur courante (`''` = aucune : style d'invite). */
  value: string;
  /** Texte du déclencheur : valeur formatée, ou invite si aucune valeur. */
  libelle: React.ReactNode;
  onValueChange: (valeur: string) => void;
  'aria-label': string;
  /** Classes ajoutées au déclencheur (ex. `w-full`). */
  className?: string;
  /** Les `<SelectItem>` — rendus seulement une fois la liste montée. */
  children: React.ReactNode;
};

/**
 * Liste déroulante « différée » pour les grilles de saisie à nombreuses lignes
 * (lignes de devis) : un `Select` Base UI coûte ~1 ms à monter (store, hooks de
 * positionnement…), et une ligne en porte 2 à 3. Tant qu'on n'y touche pas, on
 * rend un simple bouton d'apparence et de rôle identiques au déclencheur ; au
 * premier clic (ou Entrée / Espace / flèche), la vraie liste est montée, le focus
 * posé sur son déclencheur, puis elle s'ouvre. Elle reste ensuite montée.
 */
export function SelectDiffere({
  value,
  libelle,
  onValueChange,
  'aria-label': ariaLabel,
  className,
  children,
}: Props) {
  const [monte, setMonte] = React.useState(false);
  const [ouvert, setOuvert] = React.useState(false);
  const declencheurRef = React.useRef<HTMLButtonElement>(null);

  // Focus AVANT l'ouverture : la liste rend le focus à l'élément actif au moment
  // de s'ouvrir — le bouton provisoire n'existe plus, ce doit être le vrai déclencheur.
  React.useEffect(() => {
    if (!monte) return;
    declencheurRef.current?.focus();
    setOuvert(true);
  }, [monte]);

  if (!monte) {
    return (
      <button
        type="button"
        // Même rôle que le vrai déclencheur (pas de changement d'annonce au montage) ;
        // pas d'`aria-controls` possible : la liste n'existe pas encore, c'est voulu.
        // eslint-disable-next-line jsx-a11y/role-has-required-aria-props
        role="combobox"
        aria-label={ariaLabel}
        aria-haspopup="listbox"
        aria-expanded={false}
        data-slot="select-trigger"
        data-size="default"
        data-placeholder={value === '' ? '' : undefined}
        className={cn(CLASSES_DECLENCHEUR_SELECT, className)}
        onClick={() => setMonte(true)}
        onKeyDown={(e) => {
          if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
            e.preventDefault();
            setMonte(true);
          }
        }}
      >
        <span data-slot="select-value" className="min-w-0 flex-1 truncate text-left">
          {libelle}
        </span>
        <ChevronDownIcon className="pointer-events-none size-4 text-muted-foreground" />
      </button>
    );
  }

  return (
    <Select
      value={value}
      onValueChange={(v) => {
        if (v != null) onValueChange(String(v));
      }}
      open={ouvert}
      onOpenChange={setOuvert}
    >
      <SelectTrigger ref={declencheurRef} className={className} aria-label={ariaLabel}>
        <SelectValue>{() => libelle}</SelectValue>
      </SelectTrigger>
      <SelectContent>{children}</SelectContent>
    </Select>
  );
}
