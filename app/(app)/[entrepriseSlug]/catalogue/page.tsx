import Link from 'next/link';
import { count, isNull } from 'drizzle-orm';

import { PageToolbar } from '@/components/layout/page-toolbar';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { requireTenantContextWithMfa } from '@/lib/auth/tenant-guards';
import { withTenant } from '@/lib/db/with-tenant';
import { articles, familles } from '@/db/schema/catalogue';

async function compter(entrepriseId: string) {
  const [[fam], [art]] = await withTenant(entrepriseId, (tx) =>
    Promise.all([
      tx.select({ n: count() }).from(familles).where(isNull(familles.deletedAt)),
      tx.select({ n: count() }).from(articles).where(isNull(articles.deletedAt)),
    ]),
  );
  return {
    familles: fam?.n ?? 0,
    articles: art?.n ?? 0,
  };
}

const TUILES = [
  {
    titre: 'Familles',
    description:
      'Arborescence hiérarchique (gros œuvre, second œuvre, services…). Profondeur max 5 niveaux.',
    href: '/catalogue/familles',
    cleCompteur: 'familles' as const,
  },
  {
    titre: 'Articles',
    description:
      'Articles simples, composés (nomenclature versionnée), prestations et opérations. Triple unité (achat/stock/vente).',
    href: '/catalogue/articles',
    cleCompteur: 'articles' as const,
  },
];

export default async function CatalogueDashboard() {
  const ctx = await requireTenantContextWithMfa();
  const compteurs = await compter(ctx.entreprise.id);

  return (
    <div className="space-y-6">
      <PageToolbar title="Catalogue" subtitle="Familles et articles" />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {TUILES.map((t) => (
          <Link key={t.href} href={t.href} className="block">
            <Card className="transition hover:border-foreground/40">
              <CardHeader>
                <CardTitle className="flex items-baseline justify-between gap-2">
                  <span>{t.titre}</span>
                  <span className="text-2xl font-bold">{compteurs[t.cleCompteur]}</span>
                </CardTitle>
                <CardDescription>{t.description}</CardDescription>
              </CardHeader>
              <CardContent className="text-sm text-muted-foreground">
                Voir la liste →
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  );
}
