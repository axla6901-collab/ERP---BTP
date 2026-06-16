'use client';

import { BellIcon, SearchIcon } from 'lucide-react';

import { GuardedLink } from '@/components/layout/guarded-link';
import { useSidebarOptional } from '@/components/layout/sidebar-context';

type AppHeaderProps = {
  email: string;
  entrepriseSlug: string;
};

/**
 * Header figé global (maquettes) : présent en haut de toutes les pages tenant.
 * Hauteur `h-14`, sticky `top-0`. Décalé de la sidebar (`lg:pl-64` posé par le
 * layout). Contient le logo « B » amber + recherche (⌘K, placeholder) +
 * notifications (placeholder) + avatar (lien profil).
 *
 * Le sélecteur d'entreprise et la déconnexion restent dans la sidebar.
 *
 * Responsive : on masque la recherche en mobile pour éviter tout débordement
 * horizontal ; `pl-12` laisse la place au burger flottant.
 */
export function AppHeader({ email, entrepriseSlug }: AppHeaderProps) {
  const focusMode = useSidebarOptional()?.focusMode ?? false;
  const initiale = email.charAt(0).toUpperCase();

  // Mode plein écran (éditeur de devis) : header masqué pour un mode immersif.
  if (focusMode) return null;

  return (
    <header className="sticky top-0 z-20 border-b bg-card">
      <div className="flex h-14 items-center gap-3 px-4 lg:px-6">
        {/* Logo + nom (pl-12 mobile pour le burger fixe de la sidebar) */}
        <div className="flex items-center gap-2 pl-12 lg:pl-0">
          <div className="grid size-7 place-items-center rounded bg-amber-500 text-sm font-bold text-white">
            B
          </div>
          <GuardedLink
            href={`/${entrepriseSlug}/dashboard`}
            className="text-sm font-semibold hover:text-amber-700"
          >
            ERP BTP
          </GuardedLink>
        </div>

        <div className="flex-1" />

        {/* Recherche (placeholder ⌘K, non fonctionnel) */}
        <button
          type="button"
          className="hidden items-center gap-2 rounded-md border bg-muted/50 px-3 py-1.5 text-xs text-muted-foreground hover:bg-muted sm:flex"
          aria-label="Rechercher"
        >
          <SearchIcon className="size-3.5" aria-hidden="true" />
          <span>Rechercher…</span>
          <kbd className="rounded border bg-card px-1 text-[10px]">⌘K</kbd>
        </button>

        {/* Notifications (placeholder) */}
        <button
          type="button"
          aria-label="Notifications"
          className="relative rounded-md p-2 text-muted-foreground hover:bg-muted"
        >
          <BellIcon className="size-4" aria-hidden="true" />
          <span className="absolute -right-0.5 -top-0.5 grid size-4 place-items-center rounded-full bg-rose-500 text-[9px] font-bold text-white">
            3
          </span>
        </button>

        {/* Profil : avatar + email, lien vers /profile */}
        <GuardedLink
          href="/profile"
          className="flex items-center gap-2 rounded-full border bg-card px-2 py-1 pr-3 text-sm hover:bg-muted"
        >
          <span className="grid size-6 place-items-center rounded-full bg-amber-100 text-xs font-medium text-amber-800">
            {initiale}
          </span>
          <span className="hidden max-w-[12rem] truncate text-xs sm:block">{email}</span>
        </GuardedLink>
      </div>
    </header>
  );
}
