import Link from 'next/link';
import { notFound } from 'next/navigation';

import { EcheancesAlertesTable } from '@/components/flotte/echeances-alertes-table';
import { PageToolbar } from '@/components/layout/page-toolbar';
import { buttonVariants } from '@/components/ui/button';
import { StatCard, StatGrid } from '@/components/ui/stat-card';
import { requireTenantContextWithMfa } from '@/lib/auth/tenant-guards';
import { formatEuro } from '@/lib/flotte/format';
import { peutEcrireFlotte } from '@/lib/flotte/permissions';
import { dashboardFlotte } from '@/lib/flotte/queries';

export default async function FlotteDashboardPage() {
  const ctx = await requireTenantContextWithMfa();
  if (!ctx.entreprise.flotteAutomobileActive) notFound();

  const peutEcrire = peutEcrireFlotte(ctx.utilisateur.role);
  const data = await dashboardFlotte();
  const base = `/${ctx.entreprise.slug}/flotte/vehicules`;

  return (
    <div className="space-y-5">
      <PageToolbar
        title="Flotte automobile"
        subtitle={`${data.nbVehicules} véhicule${data.nbVehicules > 1 ? 's' : ''} · ${data.nbAlertes} échéance${data.nbAlertes > 1 ? 's' : ''} à venir`}
        actions={
          <>
            <Link
              href={`/${ctx.entreprise.slug}/flotte/echeancier`}
              className={buttonVariants({ variant: 'outline', size: 'sm' })}
            >
              Échéancier complet
            </Link>
            {peutEcrire && (
              <Link href={`${base}/nouveau`} className={buttonVariants({ size: 'sm' })}>
                + Nouveau véhicule
              </Link>
            )}
          </>
        }
      />

      <StatGrid>
        <StatCard
          label="Véhicules"
          value={data.nbVehicules}
          hint={`${data.nbActifs} actifs · ${data.nbImmobilises} immobilisés`}
        />
        <StatCard
          label="Échéances J-30"
          value={data.nbAlertes}
          tone="amber"
          hint="contrôle technique, assurance…"
        />
        <StatCard
          label="En sinistre"
          value={data.nbEnSinistre}
          tone={data.nbEnSinistre > 0 ? 'rose' : 'default'}
          hint="dossiers ouverts"
        />
        <StatCard
          label="Coût mensuel (loyers)"
          value={formatEuro(data.tcoMensuel)}
          hint="LLD / LOA en cours"
        />
      </StatGrid>

      <section className="overflow-hidden rounded-xl border bg-card">
        <div className="px-5 py-3">
          <h2 className="font-semibold text-orange-700">Échéances à venir &amp; dépassées</h2>
          <p className="text-xs text-muted-foreground">
            Rappel automatique selon le seuil de chaque échéance (J-30 par défaut). Ligne rose =
            dépassée ou imminente, ambre = dans le seuil.
          </p>
        </div>
        <div className="border-t px-5 py-4">
          <EcheancesAlertesTable
            alertes={data.alertes}
            today={data.today}
            baseHref={base}
            emptyMessage="Aucune échéance enregistrée. Ajoutez-en depuis une fiche véhicule."
          />
        </div>
      </section>
    </div>
  );
}
