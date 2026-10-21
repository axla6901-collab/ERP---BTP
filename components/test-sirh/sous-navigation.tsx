import Link from 'next/link';

import { TabsNav, TabsTrigger } from '@/components/ui/tabs';

export type OngletSirh = {
  /** Clé stable de l'onglet (comparée à `actif`). */
  cle: string;
  label: string;
  href: string;
  /** Compteur optionnel affiché à droite du libellé. */
  compteur?: number;
};

/**
 * Onglets pilotés par l'URL (sous-pages d'une rubrique : Sites / Équipes / Postes…).
 * Server-compatible : la page passe la clé de l'onglet courant.
 */
export function SousNavigationSirh({
  onglets,
  actif,
  className,
}: {
  onglets: readonly OngletSirh[];
  actif: string;
  className?: string;
}) {
  return (
    <TabsNav aria-label="Sous-navigation" className={className}>
      {onglets.map((o) => (
        <TabsTrigger key={o.cle} asChild active={o.cle === actif}>
          <Link href={o.href}>
            {o.label}
            {typeof o.compteur === 'number' && (
              <span className="text-xs tabular-nums text-muted-foreground">{o.compteur}</span>
            )}
          </Link>
        </TabsTrigger>
      ))}
    </TabsNav>
  );
}
