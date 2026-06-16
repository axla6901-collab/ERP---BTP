import { notFound } from 'next/navigation';

import { EcheancesAlertesTable } from '@/components/flotte/echeances-alertes-table';
import { PageToolbar } from '@/components/layout/page-toolbar';
import { requireTenantContextWithMfa } from '@/lib/auth/tenant-guards';
import { aujourdhuiIso, listerToutesEcheances } from '@/lib/flotte/queries';

export default async function EcheancierPage() {
  const ctx = await requireTenantContextWithMfa();
  if (!ctx.entreprise.flotteAutomobileActive) notFound();

  const echeances = await listerToutesEcheances();
  const base = `/${ctx.entreprise.slug}/flotte/vehicules`;

  return (
    <div className="space-y-4">
      <PageToolbar
        title="Échéancier"
        subtitle={`${echeances.length} échéance${echeances.length > 1 ? 's' : ''} sur l'ensemble du parc`}
        backHref={`/${ctx.entreprise.slug}/flotte`}
        backLabel="Flotte"
      />
      <EcheancesAlertesTable
        alertes={echeances}
        today={aujourdhuiIso()}
        baseHref={base}
        emptyMessage="Aucune échéance enregistrée sur le parc."
      />
    </div>
  );
}
