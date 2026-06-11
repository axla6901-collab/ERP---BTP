import Link from 'next/link';

import { FacturesTable } from '@/components/facturation/factures-table';
import { PageToolbar } from '@/components/layout/page-toolbar';
import { buttonVariants } from '@/components/ui/button';
import { StatCard, StatGrid } from '@/components/ui/stat-card';
import { requireAuthWithMfa } from '@/lib/auth/guards';
import { listerFactures } from '@/lib/facturation/factures';
import { peutEcrireFacturation } from '@/lib/facturation/permissions';

function eur(n: number): string {
  return `${n.toLocaleString('fr-FR', { maximumFractionDigits: 0 })} €`;
}

export default async function FacturesPage() {
  const utilisateur = await requireAuthWithMfa();
  const items = await listerFactures();
  const peutEcrire = peutEcrireFacturation(utilisateur.role);

  const somme = (predicat: (statut: string) => boolean) =>
    items.filter((f) => predicat(f.statut)).reduce((acc, f) => acc + Number(f.totalTtc), 0);

  const caFacture = somme((s) => s !== 'annulee');
  const encaisse = somme((s) => s === 'payee');
  const enAttente = somme((s) => s === 'emise');
  const enRetard = somme((s) => s === 'en_retard');
  const nbRetard = items.filter((f) => f.statut === 'en_retard').length;

  const kpis = [
    { label: 'CA facturé', value: eur(caFacture), hint: `${items.length} factures` },
    {
      label: 'Encaissé',
      value: eur(encaisse),
      hint: caFacture > 0 ? `${Math.round((encaisse / caFacture) * 100)} % du facturé` : '—',
      tone: 'emerald' as const,
    },
    { label: 'En attente', value: eur(enAttente), hint: 'factures émises' },
    {
      label: '⚠ En retard',
      value: eur(enRetard),
      hint: `${nbRetard} facture(s)`,
      tone: 'rose' as const,
    },
  ];

  return (
    <div className="space-y-6">
      <PageToolbar
        title="Factures"
        subtitle={`${items.length} facture(s)`}
        actions={
          peutEcrire ? (
            <Link href="/facturation/factures/nouveau" className={buttonVariants({ size: 'sm' })}>
              + Nouvelle facture
            </Link>
          ) : null
        }
      />

      <StatGrid>
        {kpis.map((k) => (
          <StatCard key={k.label} label={k.label} value={k.value} hint={k.hint} tone={k.tone} />
        ))}
      </StatGrid>

      <FacturesTable items={items} peutEcrire={peutEcrire} />
    </div>
  );
}
