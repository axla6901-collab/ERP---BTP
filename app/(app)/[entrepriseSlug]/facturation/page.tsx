import { redirect } from 'next/navigation';

import { cheminTenant } from '@/lib/navigation/chemin-tenant';

export default async function FacturationIndex({
  params,
}: {
  params: Promise<{ entrepriseSlug: string }>;
}) {
  const { entrepriseSlug } = await params;
  redirect(cheminTenant(entrepriseSlug, '/facturation/factures'));
}
