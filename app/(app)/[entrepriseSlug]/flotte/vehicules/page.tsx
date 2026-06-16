import Link from 'next/link';
import { notFound } from 'next/navigation';

import { VehiculesTable } from '@/components/flotte/vehicules-table';
import { PageToolbar } from '@/components/layout/page-toolbar';
import { buttonVariants } from '@/components/ui/button';
import { requireTenantContextWithMfa } from '@/lib/auth/tenant-guards';
import { peutEcrireFlotte } from '@/lib/flotte/permissions';
import { aujourdhuiIso, listerVehiculesAvecSynthese } from '@/lib/flotte/queries';

export default async function VehiculesPage() {
  const ctx = await requireTenantContextWithMfa();
  if (!ctx.entreprise.flotteAutomobileActive) notFound();

  const peutEcrire = peutEcrireFlotte(ctx.utilisateur.role);
  const vehicules = await listerVehiculesAvecSynthese();
  const base = `/${ctx.entreprise.slug}/flotte/vehicules`;

  return (
    <div className="space-y-4">
      <PageToolbar
        title="Véhicules"
        subtitle={`${vehicules.length} véhicule${vehicules.length > 1 ? 's' : ''}`}
        actions={
          peutEcrire ? (
            <Link href={`${base}/nouveau`} className={buttonVariants({ size: 'sm' })}>
              + Nouveau véhicule
            </Link>
          ) : null
        }
      />
      <VehiculesTable vehicules={vehicules} today={aujourdhuiIso()} baseHref={base} />
    </div>
  );
}
