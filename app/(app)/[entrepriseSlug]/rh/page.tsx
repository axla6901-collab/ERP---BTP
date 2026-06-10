import Link from 'next/link';
import { and, count, eq, gte, isNull, lte, sum } from 'drizzle-orm';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { requireTenantContextWithMfa } from '@/lib/auth/tenant-guards';
import { withTenant } from '@/lib/db/with-tenant';
import { employes } from '@/db/schema/employes';
import { pointages } from '@/db/schema/pointages';

async function compter(entrepriseId: string) {
  const now = new Date();
  const annee = now.getFullYear();
  const mois = now.getMonth() + 1;
  const dateMin = `${annee}-${String(mois).padStart(2, '0')}-01`;
  const lastDay = new Date(annee, mois, 0).getDate();
  const dateMax = `${annee}-${String(mois).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;

  const [[empActifs], [pointagesMois], [heuresMois]] = await withTenant(entrepriseId, (tx) =>
    Promise.all([
      tx
        .select({ n: count() })
        .from(employes)
        .where(and(isNull(employes.deletedAt), eq(employes.actif, true))),
      tx
        .select({ n: count() })
        .from(pointages)
        .where(
          and(
            isNull(pointages.deletedAt),
            gte(pointages.datePointage, dateMin),
            lte(pointages.datePointage, dateMax),
          ),
        ),
      tx
        .select({ total: sum(pointages.quantite) })
        .from(pointages)
        .where(
          and(
            isNull(pointages.deletedAt),
            eq(pointages.type, 'heures'),
            gte(pointages.datePointage, dateMin),
            lte(pointages.datePointage, dateMax),
          ),
        ),
    ]),
  );

  return {
    employesActifs: empActifs?.n ?? 0,
    pointagesMois: pointagesMois?.n ?? 0,
    heuresMois: heuresMois?.total ? Number(heuresMois.total) : 0,
  };
}

export default async function RhDashboard() {
  const ctx = await requireTenantContextWithMfa();
  const compteurs = await compter(ctx.entreprise.id);
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      <Link href="/rh/employes" className="block">
        <Card className="transition hover:border-foreground/40">
          <CardHeader>
            <CardTitle className="flex items-baseline justify-between">
              <span>Employés actifs</span>
              <span className="text-2xl font-bold">{compteurs.employesActifs}</span>
            </CardTitle>
            <CardDescription>Salariés en poste.</CardDescription>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">Voir la liste →</CardContent>
        </Card>
      </Link>
      <Link href="/rh/pointages" className="block">
        <Card className="transition hover:border-foreground/40">
          <CardHeader>
            <CardTitle className="flex items-baseline justify-between">
              <span>Pointages du mois</span>
              <span className="text-2xl font-bold">{compteurs.pointagesMois}</span>
            </CardTitle>
            <CardDescription>Lignes saisies pour le mois en cours.</CardDescription>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">Filtrer →</CardContent>
        </Card>
      </Link>
      <Link href="/rh/pointages/saisie" className="block">
        <Card className="transition hover:border-foreground/40">
          <CardHeader>
            <CardTitle className="flex items-baseline justify-between">
              <span>Heures du mois</span>
              <span className="text-2xl font-bold tabular-nums">
                {compteurs.heuresMois.toLocaleString('fr-FR', { maximumFractionDigits: 1 })}
              </span>
            </CardTitle>
            <CardDescription>Total cumulé du mois en cours.</CardDescription>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">Saisir la matrice →</CardContent>
        </Card>
      </Link>
    </div>
  );
}
