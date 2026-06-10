import { notFound, redirect } from 'next/navigation';

import { TierForm } from '@/components/referencement/tier-form';
import { requireTenantContext } from '@/lib/auth/tenant-guards';
import { peutEcrireRegistreTiers } from '@/lib/referencement/permissions';
import { creerTier, lireReferentielTiers } from '@/lib/referencement/registre';

export default async function NouveauTierPage() {
  const ctx = await requireTenantContext();
  if (!ctx.entreprise.tiersReferencementActive) notFound();
  if (!peutEcrireRegistreTiers(ctx.utilisateur.role)) {
    redirect(`/${ctx.entreprise.slug}/tiers/referencement`);
  }

  const ref = await lireReferentielTiers();

  return (
    <TierForm
      titre="Nouveau tier"
      corpsEtatOptions={ref.corpsEtat.map((c) => ({ id: c.id, libelle: c.libelle }))}
      societeOptions={ref.societes.map((s) => ({ id: s.id, libelle: s.raisonSociale }))}
      successRedirect={`/${ctx.entreprise.slug}/tiers/referencement`}
      onSubmit={async (values) => {
        'use server';
        return creerTier(values);
      }}
    />
  );
}
