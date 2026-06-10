import Link from 'next/link';
import { count, eq, isNull, and } from 'drizzle-orm';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { requireTenantContextWithMfa } from '@/lib/auth/tenant-guards';
import { withTenant } from '@/lib/db/with-tenant';
import { clients, devis } from '@/db/schema/commercial';

async function compter(entrepriseId: string) {
  const [[cli], [dev], [brouillons]] = await withTenant(entrepriseId, (tx) =>
    Promise.all([
      tx.select({ n: count() }).from(clients).where(isNull(clients.deletedAt)),
      tx.select({ n: count() }).from(devis).where(isNull(devis.deletedAt)),
      tx
        .select({ n: count() })
        .from(devis)
        .where(and(isNull(devis.deletedAt), eq(devis.statut, 'brouillon'))),
    ]),
  );
  return {
    clients: cli?.n ?? 0,
    devis: dev?.n ?? 0,
    brouillons: brouillons?.n ?? 0,
  };
}

export default async function CommercialDashboard() {
  const ctx = await requireTenantContextWithMfa();
  const compteurs = await compter(ctx.entreprise.id);

  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      <Link href="/commercial/clients" className="block">
        <Card className="transition hover:border-foreground/40">
          <CardHeader>
            <CardTitle className="flex items-baseline justify-between">
              <span>Clients</span>
              <span className="text-2xl font-bold">{compteurs.clients}</span>
            </CardTitle>
            <CardDescription>Particuliers et professionnels.</CardDescription>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">Voir la liste →</CardContent>
        </Card>
      </Link>
      <Link href="/commercial/devis" className="block">
        <Card className="transition hover:border-foreground/40">
          <CardHeader>
            <CardTitle className="flex items-baseline justify-between">
              <span>Devis</span>
              <span className="text-2xl font-bold">{compteurs.devis}</span>
            </CardTitle>
            <CardDescription>
              {compteurs.brouillons > 0
                ? `${compteurs.brouillons} brouillon${compteurs.brouillons > 1 ? 's' : ''} en cours.`
                : 'Tous les devis sont finalisés.'}
            </CardDescription>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">Voir la liste →</CardContent>
        </Card>
      </Link>
    </div>
  );
}
