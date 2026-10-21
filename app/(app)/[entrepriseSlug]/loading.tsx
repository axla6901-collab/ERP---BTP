/**
 * Squelette générique des routes tenant, rendu À L'INTÉRIEUR du layout
 * `[entrepriseSlug]/layout.tsx` : la barre latérale reste affichée pendant le
 * chargement de la page. Sert aux routes sans `loading.tsx` propre (ex. Tiers) ;
 * celui de `app/(app)/loading.tsx`, placé au-dessus de la barre latérale, ne
 * couvre plus que l'attente du layout tenant lui-même.
 */
export { default } from '../loading';
