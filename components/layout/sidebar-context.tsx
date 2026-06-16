'use client';

import { usePathname } from 'next/navigation';
import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';

/**
 * État de repli de la sidebar (desktop), partagé entre `AppSidebar` (largeur)
 * et `TenantContentShell` (padding du contenu).
 *
 * Comportement :
 * - préférence utilisateur persistée en `localStorage` (prioritaire) ;
 * - à défaut de préférence, repli **par défaut sur le dashboard**, déplié
 *   ailleurs (réévalué à chaque changement de route tant qu'aucune préférence
 *   explicite n'a été posée).
 */

const STORAGE_KEY = 'erp-sidebar-collapsed';

type SidebarContextValue = {
  collapsed: boolean;
  toggle: () => void;
  /** Mode plein écran (immersif) : masque la sidebar, le header et le rail
   *  pour élargir la zone de saisie. Piloté par l'éditeur de devis. */
  focusMode: boolean;
  setFocusMode: (v: boolean) => void;
};

const SidebarContext = createContext<SidebarContextValue | null>(null);

export function useSidebar(): SidebarContextValue {
  const ctx = useContext(SidebarContext);
  if (!ctx) throw new Error('useSidebar doit être utilisé dans <SidebarProvider>.');
  return ctx;
}

/** Variante non-throwing : renvoie `null` hors d'un `<SidebarProvider>`.
 *  Utile pour les composants montés aussi bien dans l'app (provider présent)
 *  qu'en tests unitaires isolés (sans provider) — ex. `DevisEditor`. */
export function useSidebarOptional(): SidebarContextValue | null {
  return useContext(SidebarContext);
}

function estDashboard(pathname: string | null): boolean {
  return pathname?.includes('/dashboard') ?? false;
}

export function SidebarProvider({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  // SSR + 1er rendu client : déplié, pour coïncider avec le serveur (pas de
  // mismatch d'hydratation). L'effet ci-dessous ajuste juste après le montage.
  const [collapsed, setCollapsed] = useState(false);
  // `setFocusMode` est le setState brut (référence stable) : un consommateur
  // peut donc l'utiliser sans risque dans un effet de nettoyage (cf. l'éditeur
  // de devis qui réinitialise le mode plein écran à son démontage).
  const [focusMode, setFocusMode] = useState(false);

  useEffect(() => {
    let stored: string | null = null;
    try {
      stored = window.localStorage.getItem(STORAGE_KEY);
    } catch {
      stored = null;
    }
    if (stored === '1') setCollapsed(true);
    else if (stored === '0') setCollapsed(false);
    else setCollapsed(estDashboard(pathname));
  }, [pathname]);

  const toggle = () => {
    setCollapsed((prev) => {
      const next = !prev;
      try {
        window.localStorage.setItem(STORAGE_KEY, next ? '1' : '0');
      } catch {
        /* localStorage indisponible (mode privé strict) : on ignore. */
      }
      return next;
    });
  };

  return (
    <SidebarContext.Provider value={{ collapsed, toggle, focusMode, setFocusMode }}>
      {children}
    </SidebarContext.Provider>
  );
}
