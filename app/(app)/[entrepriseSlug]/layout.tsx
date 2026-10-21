import { AppSidebar } from '@/components/layout/app-sidebar';
import { SidebarProvider } from '@/components/layout/sidebar-context';
import { TenantContentShell } from '@/components/layout/tenant-content-shell';
import { listEntreprisesUtilisateur, resolveTenantFromUrl } from '@/lib/auth/tenant-guards';

/**
 * Layout tenant. Résout `params.entrepriseSlug` en entreprise active, vérifie
 * l'appartenance de l'utilisateur courant (sinon notFound), et monte la sidebar
 * + le sélecteur d'entreprise.
 *
 * Toutes les pages sous `app/(app)/[entrepriseSlug]/...` héritent de ce layout
 * et peuvent récupérer le contexte tenant via `getTenantContext()` (mémoïsé).
 */
export default async function TenantLayout({
  params,
  children,
}: {
  params: Promise<{ entrepriseSlug: string }>;
  children: React.ReactNode;
}) {
  const { entrepriseSlug } = await params;
  // Lectures indépendantes : en parallèle (l'utilisateur courant est mémoïsé par requête).
  const [ctx, entreprises] = await Promise.all([
    resolveTenantFromUrl(entrepriseSlug),
    listEntreprisesUtilisateur(),
  ]);

  return (
    <SidebarProvider>
      <AppSidebar
        email={ctx.utilisateur.email}
        role={ctx.utilisateur.role}
        isSuperAdmin={ctx.utilisateur.isSuperAdmin}
        entrepriseSlug={ctx.entreprise.slug}
        entrepriseRaisonSociale={ctx.entreprise.raisonSociale}
        entreprises={entreprises}
        features={{
          planning: ctx.entreprise.planningActive,
          'tiers-referencement': ctx.entreprise.tiersReferencementActive,
          'compte-prorata': ctx.entreprise.compteProrataActive,
          flotte: ctx.entreprise.flotteAutomobileActive,
          'test-sirh': ctx.entreprise.testSirhActive,
        }}
      />
      <TenantContentShell>
        <main className="min-w-0 overflow-x-clip">
          <div className="px-4 py-6 lg:px-8">{children}</div>
        </main>
      </TenantContentShell>
    </SidebarProvider>
  );
}
