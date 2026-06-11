import Link from 'next/link';

import { PageToolbar } from '@/components/layout/page-toolbar';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { requireTenantContext } from '@/lib/auth/tenant-guards';
import { listerCorpsEtat } from '@/lib/referencement/corps-etat';
import { listerNaturesDocument } from '@/lib/referencement/natures-document';
import { listerSocietes } from '@/lib/referencement/societes';

export default async function ReferentielTiersPage() {
  const { entreprise } = await requireTenantContext();
  const [corpsEtat, natures, societes] = await Promise.all([
    listerCorpsEtat(),
    listerNaturesDocument(),
    listerSocietes(),
  ]);
  const prefixe = `/${entreprise.slug}`;

  const tuiles: Array<{ titre: string; description: string; href: string; compteur?: number }> = [
    {
      titre: 'Corps d’état',
      description:
        'Activités des tiers (gros œuvre, charpente, électricité…). Un tier peut en avoir plusieurs.',
      href: '/administration/referentiel-tiers/corps-etat',
      compteur: corpsEtat.length,
    },
    {
      titre: 'Natures de document',
      description:
        'Documents administratifs (K-bis, URSSAF, assurances…) avec délais de validité et de relance.',
      href: '/administration/referentiel-tiers/natures-document',
      compteur: natures.length,
    },
    {
      titre: 'Correspondance',
      description:
        'Quels documents sont requis (bloquants ou non) selon le corps d’état et la nature du tiers.',
      href: '/administration/referentiel-tiers/correspondance',
    },
    {
      titre: 'Sociétés & règles',
      description:
        'Sociétés du groupe et règles applicables (ex. suspension de chantier avec LRAR).',
      href: '/administration/referentiel-tiers/societes',
      compteur: societes.length,
    },
    {
      titre: 'Types d’engagement',
      description:
        'Matrice nature du tiers × type d’engagement (marché de travaux / bon de commande). Référentiel global.',
      href: '/administration/referentiel-tiers/types-engagement',
    },
  ];

  return (
    <div className="space-y-6">
      <PageToolbar
        title="Référentiel Tiers"
        subtitle="Paramétrage du référencement et de l’agrément des tiers"
      />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {tuiles.map((t) => (
          <Link key={t.href} href={`${prefixe}${t.href}`} className="block">
            <Card className="transition hover:border-foreground/40">
              <CardHeader>
                <CardTitle className="flex items-baseline justify-between gap-2">
                  <span>{t.titre}</span>
                  {t.compteur != null ? (
                    <span className="text-2xl font-bold">{t.compteur}</span>
                  ) : null}
                </CardTitle>
                <CardDescription>{t.description}</CardDescription>
              </CardHeader>
              <CardContent className="text-sm text-muted-foreground">Ouvrir →</CardContent>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  );
}
