/**
 * Constantes partagées des onglets de la fiche chantier — utilisées à la fois
 * par le Server Component (page) pour résoudre le `?tab=` URL, et par le
 * Client Component `ChantierTabs` pour rendre la nav.
 *
 * Important : ce fichier ne porte PAS la directive `'use client'`. Il est
 * neutre côté runtime — les exports peuvent être consommés des deux côtés.
 */

export const CHANTIER_TABS = [
  { key: 'informations', label: 'Informations du chantier' },
  { key: 'grille-tarifaire', label: 'Grille tarifaire' },
  { key: 'commandes', label: 'Commandes' },
  { key: 'devis', label: 'Devis' },
  { key: 'factures', label: 'Factures' },
  { key: 'compte-prorata', label: 'Compte prorata' },
] as const;

export type ChantierTab = (typeof CHANTIER_TABS)[number];
export type ChantierTabKey = ChantierTab['key'];

const CLES = new Set<string>(CHANTIER_TABS.map((t) => t.key));

/**
 * Onglets optionnels conditionnés à un feature flag entreprise. Absents de la
 * nav (et inaccessibles en deep-link) si le module n'est pas activé.
 */
const TABS_OPTIONNELS: Partial<Record<ChantierTabKey, true>> = {
  'compte-prorata': true,
};

/**
 * Filtre les onglets visibles selon les modules optionnels activés pour
 * l'entreprise. Les onglets non optionnels sont toujours présents.
 */
export function chantierTabsVisibles(flags: {
  compteProrataActive: boolean;
}): readonly ChantierTab[] {
  return CHANTIER_TABS.filter((t) => {
    if (t.key === 'compte-prorata') return flags.compteProrataActive;
    return true;
  });
}

/**
 * Valide le `?tab=` (ou retombe sur 'informations' si invalide / absent).
 * Sûr côté serveur ET client. Un onglet optionnel est rejeté si son module
 * n'est pas activé (`flags`), pour éviter l'accès par deep-link.
 */
export function resolveChantierTab(
  raw: unknown,
  flags?: { compteProrataActive: boolean },
): ChantierTabKey {
  if (typeof raw !== 'string' || !CLES.has(raw)) return 'informations';
  const key = raw as ChantierTabKey;
  if (TABS_OPTIONNELS[key]) {
    if (key === 'compte-prorata' && !flags?.compteProrataActive) return 'informations';
  }
  return key;
}
