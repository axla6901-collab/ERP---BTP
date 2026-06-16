import type { ReactNode } from 'react';

/**
 * Composants d'aperçu « proposé » partagés par les fiches tiers (fournisseur,
 * sous-traitant). Une section / un champ « proposé » est une prévisualisation
 * rattachée à un module à venir (Achats, export comptable) : non saisissable, non
 * enregistrée. Cf. maquettes `gabarit-fournisseur.html` / `gabarit-sous-traitant.html`.
 */

/** Badge « proposé » : marque une section / un champ en prévisualisation. */
export function ProposeBadge() {
  return (
    <span className="ml-1 rounded bg-muted px-1.5 py-0.5 align-middle text-[10px] font-medium text-muted-foreground ring-1 ring-foreground/10">
      proposé
    </span>
  );
}

/** Note explicative ambre d'une section « proposé ». */
export function NoteProposee({ children }: { children: ReactNode }) {
  return <p className="rounded-md bg-amber-50 px-3 py-2 text-xs text-amber-800">{children}</p>;
}

/** Étiquette + champ d'aperçu (lecture seule), hors react-hook-form. */
export function ChampApercu({
  label,
  hint,
  badge = false,
  children,
}: {
  label: string;
  hint?: ReactNode;
  badge?: boolean;
  children: ReactNode;
}) {
  return (
    <div>
      <span className="mb-1 flex items-center text-sm font-medium leading-none">
        {label}
        {badge ? <ProposeBadge /> : null}
      </span>
      {children}
      {hint ? <p className="mt-1 text-xs text-muted-foreground">{hint}</p> : null}
    </div>
  );
}

/** `<select>` natif en lecture seule, calé sur le style des champs de l'app. */
export function SelectApercu({ value, options }: { value: string; options: string[] }) {
  return (
    <select
      disabled
      defaultValue={value}
      className="h-8 w-full rounded-lg border border-input bg-transparent px-2.5 py-1 text-sm outline-none disabled:cursor-not-allowed disabled:bg-input/50 disabled:opacity-50"
    >
      {options.map((o) => (
        <option key={o} value={o}>
          {o}
        </option>
      ))}
    </select>
  );
}
