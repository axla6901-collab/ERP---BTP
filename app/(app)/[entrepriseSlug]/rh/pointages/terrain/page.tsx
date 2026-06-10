import { PageToolbar } from '@/components/layout/page-toolbar';
import { PointageTerrain } from '@/components/rh/pointage-terrain';
import { requireTenantContextWithMfa } from '@/lib/auth/tenant-guards';
import { ROLES_POINTAGE_WRITE } from '@/lib/rh/permissions';
import { chargerPointageRefs } from '@/lib/rh/pointage-refs';

/**
 * Écran de **pointage terrain** mobile-first (M5.5, ADR-004).
 * Saisie rapide par le chef de chantier / conducteur, conçue pour fonctionner
 * hors-ligne (outbox IndexedDB + service worker). Les données de référence
 * (employés, chantiers en cours, tâches) sont chargées au rendu puis mises en
 * cache côté client.
 */
export default async function PointageTerrainPage() {
  const ctx = await requireTenantContextWithMfa(ROLES_POINTAGE_WRITE);
  const refs = await chargerPointageRefs(ctx.entreprise.id);

  return (
    <div className="space-y-6">
      <PageToolbar
        title="Pointage terrain"
        subtitle="Saisie rapide — fonctionne hors-ligne, synchronisation automatique"
      />
      <PointageTerrain initialRefs={refs} />
    </div>
  );
}
