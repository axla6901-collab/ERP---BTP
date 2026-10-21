import { redirect } from 'next/navigation';

import { cheminTenant } from '@/lib/navigation/chemin-tenant';

export default async function TiersIndex({
  params,
}: {
  params: Promise<{ entrepriseSlug: string }>;
}) {
  const { entrepriseSlug } = await params;
  redirect(cheminTenant(entrepriseSlug, '/tiers/fournisseurs'));
}
