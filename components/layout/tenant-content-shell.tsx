'use client';

import { cn } from '@/lib/utils';

import { useSidebar } from './sidebar-context';

/**
 * Conteneur du contenu tenant (header + main). Décale le contenu de la largeur
 * de la sidebar fixe et s'ajuste quand elle se replie (rail icônes `w-16`) ou
 * se déploie (`w-64`). En mobile, aucun décalage (sidebar off-canvas).
 */
export function TenantContentShell({ children }: { children: React.ReactNode }) {
  const { collapsed } = useSidebar();
  return (
    <div
      className={cn(
        'min-h-screen bg-background transition-[padding] duration-200',
        collapsed ? 'lg:pl-16' : 'lg:pl-64',
      )}
    >
      {children}
    </div>
  );
}
