'use client';

import { useEffect, useState } from 'react';

export type OptionsRenduProgressif = {
  /** Nombre d'éléments rendus d'emblée — y compris au rendu serveur. */
  initial?: number;
  /** Nombre d'éléments ajoutés à chaque tranche. */
  pas?: number;
  /** Toute nouvelle valeur relance la progression depuis `initial` (ex. après
   *  le remplacement en bloc de la liste par un import). */
  cle?: unknown;
};

/** Planifie `fn` quand le navigateur est libre (repli `setTimeout` : Safari/iPad
 *  n'a pas `requestIdleCallback`). Renvoie l'annulation. */
function planifier(fn: () => void): () => void {
  if (typeof window !== 'undefined' && typeof window.requestIdleCallback === 'function') {
    const id = window.requestIdleCallback(fn, { timeout: 100 });
    return () => window.cancelIdleCallback(id);
  }
  const id = setTimeout(fn, 16);
  return () => clearTimeout(id);
}

/**
 * Affichage progressif d'une longue liste : renvoie le nombre d'éléments à
 * rendre. Démarre à `initial` (identique au rendu serveur et à l'hydratation, donc
 * HTML léger et sans écart d'hydratation), puis ajoute `pas` éléments par tranche
 * entre deux frames jusqu'à `total`. Une fois la liste complète, suit `total`
 * immédiatement (une ligne ajoutée apparaît sans délai).
 *
 * @example
 *   const limite = useRenduProgressif(lignes.length, { initial: 50, pas: 50 });
 *   lignes.slice(0, limite).map(...)
 */
export function useRenduProgressif(
  total: number,
  { initial = 50, pas = 50, cle }: OptionsRenduProgressif = {},
): number {
  const [etat, setEtat] = useState({ cle, limite: initial, complet: false });

  // Nouvelle clé : on repart de `initial` (mise à jour d'état pendant le rendu,
  // motif React « stocker une info du rendu précédent »).
  if (!Object.is(etat.cle, cle)) {
    setEtat({ cle, limite: initial, complet: false });
  }

  useEffect(() => {
    if (etat.complet) return;
    if (etat.limite >= total) {
      setEtat((e) => ({ ...e, complet: true }));
      return;
    }
    return planifier(() => setEtat((e) => ({ ...e, limite: e.limite + pas })));
  }, [etat.complet, etat.limite, total, pas]);

  return etat.complet ? total : Math.min(etat.limite, total);
}
