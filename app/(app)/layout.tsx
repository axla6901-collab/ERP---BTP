import { requireAuth } from '@/lib/auth/guards';
import { NavigationGuardProvider } from '@/lib/hooks/navigation-guard';

/**
 * Layout du groupe (app) : authentification + provider de garde de navigation.
 * La sidebar et le contexte tenant sont posés par le layout enfant
 * `[entrepriseSlug]/layout.tsx`. Les routes hors-tenant (profile/*, admin/*,
 * select-entreprise) consomment ce layout sans sidebar.
 */
export default async function AppLayout({ children }: { children: React.ReactNode }) {
  await requireAuth();
  return <NavigationGuardProvider>{children}</NavigationGuardProvider>;
}
