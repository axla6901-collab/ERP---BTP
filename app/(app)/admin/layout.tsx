import { redirect } from 'next/navigation';

import { AppHeader } from '@/components/layout/app-header';
import { AppSidebar } from '@/components/layout/app-sidebar';
import { SidebarProvider } from '@/components/layout/sidebar-context';
import { TenantContentShell } from '@/components/layout/tenant-content-shell';
import {
  getTenantContext,
  listEntreprisesUtilisateur,
  requireSuperAdmin,
} from '@/lib/auth/tenant-guards';

/**
 * Layout super-admin. Réutilise la même sidebar tenant que `[entrepriseSlug]/layout.tsx`
 * pour ne pas perdre le contexte de navigation quand l'utilisateur ouvre la
 * console (« Entreprises »).
 *
 * Le sélecteur d'entreprise reste fonctionnel : il pointe sur l'entreprise
 * « active » (cookie `active_entreprise_slug`). Si pas de cookie valide, on
 * redirige vers `/select-entreprise` — un super-admin doit appartenir à au
 * moins une entreprise pour avoir un contexte sidebar cohérent.
 */
export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  await requireSuperAdmin();
  const ctx = await getTenantContext();
  if (!ctx) redirect('/select-entreprise');
  const entreprises = await listEntreprisesUtilisateur();

  return (
    <SidebarProvider>
      <AppSidebar
        email={ctx.utilisateur.email}
        role={ctx.utilisateur.role}
        isSuperAdmin={ctx.utilisateur.isSuperAdmin}
        entrepriseSlug={ctx.entreprise.slug}
        entrepriseRaisonSociale={ctx.entreprise.raisonSociale}
        entreprises={entreprises}
      />
      <TenantContentShell>
        <AppHeader email={ctx.utilisateur.email} entrepriseSlug={ctx.entreprise.slug} />
        <main className="min-w-0 overflow-x-clip">
          <div className="px-4 py-6 lg:px-8">{children}</div>
        </main>
      </TenantContentShell>
    </SidebarProvider>
  );
}
