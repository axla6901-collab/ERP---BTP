import { notFound } from 'next/navigation';

import { VehiculeForm } from '@/components/flotte/vehicule-form';
import { requireTenantContextWithMfa } from '@/lib/auth/tenant-guards';
import { creerVehicule } from '@/lib/flotte/vehicules';
import { ROLES_FLOTTE_WRITE } from '@/lib/flotte/permissions';
import { listerEmployesActifs } from '@/lib/rh/employes';

export default async function NouveauVehiculePage() {
  const ctx = await requireTenantContextWithMfa(ROLES_FLOTTE_WRITE);
  if (!ctx.entreprise.flotteAutomobileActive) notFound();

  const employes = await listerEmployesActifs();
  const base = `/${ctx.entreprise.slug}/flotte/vehicules`;

  return (
    <div className="space-y-4">
      <VehiculeForm
        titre="Nouveau véhicule"
        backHref={base}
        backLabel="Véhicules"
        employes={employes.map((e) => ({
          id: e.id,
          nom: [e.nom, e.prenom].filter(Boolean).join(' '),
        }))}
        onSubmit={async (values) => {
          'use server';
          return creerVehicule(values);
        }}
        successRedirect={base}
      />
    </div>
  );
}
