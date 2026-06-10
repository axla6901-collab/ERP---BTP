import { CalculatorIcon } from 'lucide-react';
import Link from 'next/link';
import { notFound } from 'next/navigation';

import { ComptesProrataListe } from '@/components/compte-prorata/comptes-prorata-liste';
import { PageToolbar } from '@/components/layout/page-toolbar';
import { Card, CardContent } from '@/components/ui/card';
import { StatCard, StatGrid } from '@/components/ui/stat-card';
import { requireTenantContext } from '@/lib/auth/tenant-guards';
import { listerComptesProrata } from '@/lib/chantiers/compte-prorata-actions';

export const dynamic = 'force-dynamic';

function fmtEur(n: number): string {
  return `${n.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €`;
}

export default async function ComptesProrataPage({
  params,
}: {
  params: Promise<{ entrepriseSlug: string }>;
}) {
  const { entrepriseSlug } = await params;
  const ctx = await requireTenantContext();
  if (!ctx.entreprise.compteProrataActive) notFound();

  const comptes = await listerComptesProrata();

  const nbOuverts = comptes.filter((c) => c.statut === 'ouvert').length;
  const totalDepenses = comptes.reduce((s, c) => s + Number(c.totalDepensesHt), 0);
  const totalParticipants = comptes.reduce((s, c) => s + c.nbParticipants, 0);

  return (
    <div className="space-y-6">
      <PageToolbar
        title={
          <span className="inline-flex items-center gap-2">
            <CalculatorIcon className="size-5 text-amber-600" />
            Compte prorata
          </span>
        }
        subtitle={`${comptes.length} compte(s) — ${nbOuverts} ouvert(s)`}
      />

      <StatGrid>
        <StatCard label="Comptes prorata" value={comptes.length} />
        <StatCard label="Comptes ouverts" value={nbOuverts} tone="amber" />
        <StatCard label="Dépenses communes" value={fmtEur(totalDepenses)} />
        <StatCard label="Participants" value={totalParticipants} />
      </StatGrid>

      {comptes.length === 0 ? (
        <Card>
          <CardContent className="py-10 text-center text-sm text-muted-foreground">
            Aucun compte prorata. Ouvrez-en un depuis l&apos;onglet «&nbsp;Compte prorata&nbsp;»
            d&apos;une fiche
            <Link
              href={`/${entrepriseSlug}/chantiers`}
              className="ml-1 underline underline-offset-4"
            >
              chantier
            </Link>
            .
          </CardContent>
        </Card>
      ) : (
        <ComptesProrataListe comptes={comptes} entrepriseSlug={entrepriseSlug} />
      )}
    </div>
  );
}
