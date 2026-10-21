'use client';

import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  useController,
  useFormContext,
  type Control,
  type FieldValues,
  type Path,
  type PathValue,
} from 'react-hook-form';

import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import type { CommuneSuggestion } from '@/lib/geo/codes-postaux';
import { cn } from '@/lib/utils';

type Props<T extends FieldValues> = {
  control: Control<T>;
  /** Nom des champs RHF (défauts : codePostal / ville). */
  codePostalName?: Path<T>;
  villeName?: Path<T>;
  /** Champ optionnel à remplir avec le code INSEE de la commune choisie. */
  codeInseeName?: Path<T>;
  /** Classe du conteneur grille (défaut : grille 3 colonnes responsive). */
  className?: string;
  disabled?: boolean;
  /**
   * Adresse hors de France : code postal libre (jusqu'à 10 caractères) et pas
   * de suggestions — le référentiel des codes postaux ne couvre que la France.
   */
  horsFrance?: boolean;
};

const DELAI_DEBOUNCE_MS = 250;

async function chercherCommunes(q: string, signal: AbortSignal): Promise<CommuneSuggestion[]> {
  try {
    const res = await fetch(`/api/geo/communes?q=${encodeURIComponent(q)}`, { signal });
    if (!res.ok) return [];
    const data = (await res.json()) as { resultats?: CommuneSuggestion[] };
    return data.resultats ?? [];
  } catch {
    // AbortError (frappe suivante) ou réseau : on ignore silencieusement.
    return [];
  }
}

/**
 * Champ texte avec liste de suggestions de communes. Réutilisé pour le code
 * postal et pour la ville ; la sélection d'une suggestion remonte la commune
 * complète au parent, qui remplit les deux champs liés.
 */
function ChampCommune({
  value,
  onChange,
  onBlur,
  onSelectionner,
  label,
  placeholder,
  inputMode,
  maxLength,
  disabled,
  className,
  rendreOption,
  erreur,
  suggestionsActives = true,
}: {
  value: string;
  onChange: (v: string) => void;
  onBlur: () => void;
  onSelectionner: (s: CommuneSuggestion) => void;
  label: string;
  placeholder?: string | undefined;
  inputMode?: 'numeric' | 'text' | undefined;
  maxLength?: number | undefined;
  disabled?: boolean | undefined;
  className?: string | undefined;
  rendreOption: (s: CommuneSuggestion) => string;
  erreur?: string | undefined;
  /** false = saisie libre, sans recherche ni liste de suggestions. */
  suggestionsActives?: boolean | undefined;
}) {
  const [suggestions, setSuggestions] = useState<CommuneSuggestion[]>([]);
  const [ouvert, setOuvert] = useState(false);
  const [indexActif, setIndexActif] = useState(-1);
  const inputId = useId();
  const listboxId = useId();
  // Terme courant à rechercher (piloté par les frappes uniquement, pas par les
  // remplissages programmatiques, pour éviter de rouvrir la liste).
  const [terme, setTerme] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  // Position calculée de la bulle. La liste est rendue dans un PORTAIL
  // (document.body) en `position: fixed` : elle échappe ainsi à tout ancêtre
  // `overflow-hidden` (cartes, en-têtes arrondis) qui la tronquerait.
  const [position, setPosition] = useState<{ top: number; left: number; width: number } | null>(
    null,
  );

  const recalculerPosition = useCallback(() => {
    const el = inputRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    setPosition({ top: r.bottom + 4, left: r.left, width: r.width });
  }, []);

  // Recalcule la position à l'ouverture puis sur scroll/resize tant qu'elle est
  // ouverte, pour que la bulle reste collée sous le champ.
  useLayoutEffect(() => {
    if (!ouvert || suggestions.length === 0) return;
    recalculerPosition();
    const handler = () => recalculerPosition();
    window.addEventListener('scroll', handler, true);
    window.addEventListener('resize', handler);
    return () => {
      window.removeEventListener('scroll', handler, true);
      window.removeEventListener('resize', handler);
    };
  }, [ouvert, suggestions.length, recalculerPosition]);

  useEffect(() => {
    if (terme === null) return;
    const q = terme.trim();
    if (!suggestionsActives || q.length < 2) {
      setSuggestions([]);
      setOuvert(false);
      return;
    }
    const ctrl = new AbortController();
    const t = setTimeout(async () => {
      const res = await chercherCommunes(q, ctrl.signal);
      setSuggestions(res);
      setOuvert(res.length > 0);
      setIndexActif(-1);
    }, DELAI_DEBOUNCE_MS);
    return () => {
      clearTimeout(t);
      ctrl.abort();
    };
  }, [terme, suggestionsActives]);

  function choisir(s: CommuneSuggestion) {
    onSelectionner(s);
    setOuvert(false);
    setSuggestions([]);
    setTerme(null);
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (!ouvert || suggestions.length === 0) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setIndexActif((i) => Math.min(i + 1, suggestions.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setIndexActif((i) => Math.max(i - 1, 0));
    } else if (e.key === 'Enter' && indexActif >= 0) {
      e.preventDefault();
      choisir(suggestions[indexActif]!);
    } else if (e.key === 'Escape') {
      setOuvert(false);
    }
  }

  return (
    <div className={cn('relative grid gap-2', className)}>
      <Label htmlFor={inputId} data-error={!!erreur} className="data-[error=true]:text-destructive">
        {label}
      </Label>
      <Input
        ref={inputRef}
        id={inputId}
        value={value}
        placeholder={placeholder}
        inputMode={inputMode}
        maxLength={maxLength}
        disabled={disabled}
        autoComplete="off"
        role="combobox"
        aria-expanded={ouvert}
        aria-controls={listboxId}
        aria-autocomplete="list"
        aria-invalid={!!erreur}
        onChange={(e) => {
          onChange(e.target.value);
          setTerme(e.target.value);
        }}
        onFocus={() => {
          if (suggestions.length > 0) setOuvert(true);
        }}
        onBlur={() => {
          // Laisse le temps au clic sur une option de se déclencher.
          setTimeout(() => setOuvert(false), 120);
          onBlur();
        }}
        onKeyDown={onKeyDown}
      />
      {ouvert &&
        suggestions.length > 0 &&
        position &&
        createPortal(
          <ul
            id={listboxId}
            role="listbox"
            // Portail en `position: fixed` ancré sous le champ : la bulle
            // échappe aux ancêtres `overflow-hidden` (cartes/en-têtes arrondis)
            // qui la tronquaient. `min-width` = largeur du champ, et elle
            // s'élargit au contenu (chaque suggestion sur UNE ligne via
            // `whitespace-nowrap`), bornée pour ne pas déborder de l'écran.
            style={{
              position: 'fixed',
              top: position.top,
              left: position.left,
              minWidth: position.width,
            }}
            className="z-50 max-h-60 w-max max-w-[min(90vw,26rem)] overflow-auto rounded-md border bg-popover py-1 text-popover-foreground shadow-md"
          >
            {suggestions.map((s, i) => (
              <li
                key={`${s.codePostal}-${s.codeInsee}`}
                role="option"
                aria-selected={i === indexActif}
                className={cn(
                  'cursor-pointer whitespace-nowrap px-3 py-1.5 text-sm',
                  i === indexActif ? 'bg-accent text-accent-foreground' : 'hover:bg-accent/60',
                )}
                // onMouseDown (et non onClick) pour devancer le onBlur de l'input.
                onMouseDown={(e) => {
                  e.preventDefault();
                  choisir(s);
                }}
                onMouseEnter={() => setIndexActif(i)}
              >
                {rendreOption(s)}
              </li>
            ))}
          </ul>,
          document.body,
        )}
      {erreur && <p className="text-sm text-destructive">{erreur}</p>}
    </div>
  );
}

/**
 * Couple de champs « Code postal » + « Ville » avec autocomplétion
 * bidirectionnelle, branché sur React Hook Form. À utiliser à la place des deux
 * champs texte dans tous les écrans d'adresse. La sélection d'une suggestion
 * (depuis l'un ou l'autre champ) remplit le code postal, la ville et, si
 * fourni, le code INSEE. Les champs restent éditables librement.
 */
export function CommuneAutocompleteFields<T extends FieldValues>({
  control,
  codePostalName = 'codePostal' as Path<T>,
  villeName = 'ville' as Path<T>,
  codeInseeName,
  className,
  disabled,
  horsFrance = false,
}: Props<T>) {
  const { setValue } = useFormContext<T>();
  const cp = useController({ control, name: codePostalName });
  const ville = useController({ control, name: villeName });

  function remplir(s: CommuneSuggestion) {
    setValue(codePostalName, s.codePostal as PathValue<T, Path<T>>, {
      shouldDirty: true,
      shouldValidate: true,
    });
    setValue(villeName, s.commune as PathValue<T, Path<T>>, {
      shouldDirty: true,
      shouldValidate: true,
    });
    if (codeInseeName) {
      setValue(codeInseeName, s.codeInsee as PathValue<T, Path<T>>, { shouldDirty: true });
    }
  }

  const valeurCp = (cp.field.value as string | null) ?? '';
  const valeurVille = (ville.field.value as string | null) ?? '';

  return (
    <div className={cn('grid grid-cols-1 gap-4 sm:grid-cols-3', className)}>
      <ChampCommune
        label="Code postal"
        placeholder={horsFrance ? 'ex. 1200' : '69001'}
        inputMode={horsFrance ? 'text' : 'numeric'}
        maxLength={horsFrance ? 10 : 5}
        disabled={disabled}
        value={valeurCp}
        onChange={cp.field.onChange}
        onBlur={cp.field.onBlur}
        onSelectionner={remplir}
        rendreOption={(s) => `${s.codePostal} ${s.commune}`}
        erreur={cp.fieldState.error?.message}
        suggestionsActives={!horsFrance}
      />
      <ChampCommune
        className="sm:col-span-2"
        label="Ville"
        placeholder={horsFrance ? 'ex. Genève' : 'Lyon'}
        maxLength={100}
        disabled={disabled}
        value={valeurVille}
        onChange={ville.field.onChange}
        onBlur={ville.field.onBlur}
        onSelectionner={remplir}
        rendreOption={(s) => `${s.commune} (${s.codePostal})`}
        erreur={ville.fieldState.error?.message}
        suggestionsActives={!horsFrance}
      />
    </div>
  );
}
