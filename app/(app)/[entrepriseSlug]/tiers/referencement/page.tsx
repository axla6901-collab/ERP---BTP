import Link from 'next/link';
import { notFound } from 'next/navigation';

import { PageToolbar } from '@/components/layout/page-toolbar';
import { ReferencementListe } from '@/components/referencement/referencement-liste';
import { buttonVariants } from '@/components/ui/button';
import { StatCard, StatGrid } from '@/components/ui/stat-card';
import { requireTenantContext } from '@/lib/auth/tenant-guards';
import {
  peutEcrireDocumentsTiers,
  peutEcrireRegistreTiers,
} from '@/lib/referencement/permissions';
import { listerTiersAvecConformite } from '@/lib/referencement/registre';

export default async function ReferencementTiersPage() {
  const ctx = await requireTenantContext();
  if (!ctx.entreprise.tiersReferencementActive) notFound();

  const tiers = await listerTiersAvecConformite();
  const peutEcrire = peutEcrireRegistreTiers(ctx.utilisateur.role);
  const peutRelancer = peutEcrireDocumentsTiers(ctx.utilisateur.role);

  const total = tiers.length;
  const nbARelancer = tiers.filter((t) => t.classe === 'a_relancer').length;
  const nbAJour = total - nbARelancer;
  const nbAgrees = tiers.filter((t) => t.statutAgrement === 'agree').length;

  return (
    <>
      <PageToolbar
        title="Référencement des tiers"
        subtitle="Conformité documentaire et agrément des sous-traitants & fournisseurs"
        actions={
          peutEcrire ? (
            <Link
              href={`/${ctx.entreprise.slug}/tiers/referencement/nouveau`}
              className={buttonVariants({ size: 'sm' })}
            >
              + Nouveau tier
            </Link>
          ) : null
        }
      />

      <StatGrid>
        <StatCard label="Tiers référencés" value={total} />
        <StatCard
          label="À relancer"
          value={nbARelancer}
          hint={nbARelancer > 0 ? 'document(s) à régulariser' : 'tout est conforme'}
          tone={nbARelancer > 0 ? 'rose' : 'emerald'}
        />
        <StatCard label="À jour" value={nbAJour} tone="emerald" />
        <StatCard label="Agréés" value={nbAgrees} />
      </StatGrid>

      <ReferencementListe slug={ctx.entreprise.slug} tiers={tiers} peutRelancer={peutRelancer} />
    </>
  );
}
