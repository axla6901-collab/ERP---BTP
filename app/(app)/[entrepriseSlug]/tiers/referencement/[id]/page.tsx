import { notFound } from 'next/navigation';

import { AgrementActions } from '@/components/referencement/agrement-actions';
import { RelanceButton } from '@/components/referencement/relance-button';
import { StatutAgrementBadge } from '@/components/referencement/statut-agrement-badge';
import { TierDocumentsList } from '@/components/referencement/tier-documents-list';
import { TierForm } from '@/components/referencement/tier-form';
import { FormSection } from '@/components/ui/form-section';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { requireTenantContext } from '@/lib/auth/tenant-guards';
import {
  peutEcrireDocumentsTiers,
  peutStatuerAgrement,
} from '@/lib/referencement/permissions';
import { lireReferentielTiers, lireTier, mettreAJourTier } from '@/lib/referencement/registre';

export default async function FicheTierPage({
  params,
}: {
  params: Promise<{ entrepriseSlug: string; id: string }>;
}) {
  const { id } = await params;
  const ctx = await requireTenantContext();
  if (!ctx.entreprise.tiersReferencementActive) notFound();

  const detail = await lireTier(id);
  if (!detail) notFound();
  const ref = await lireReferentielTiers();

  const peutDocs = peutEcrireDocumentsTiers(ctx.utilisateur.role);
  const peutAgrement = peutStatuerAgrement(ctx.utilisateur.role);
  const slug = ctx.entreprise.slug;

  return (
    <>
      <TierForm
        titre={detail.tier.nom}
        defaultValues={{
          code: detail.tier.code,
          nom: detail.tier.nom,
          natureTiers: detail.tier.natureTiers,
          nomGerant: detail.tier.nomGerant,
          telPortableGerant: detail.tier.telPortableGerant,
          siret: detail.tier.siret,
          nTvaIntra: detail.tier.nTvaIntra,
          email: detail.tier.email,
          telephone: detail.tier.telephone,
          adresseLigne1: detail.tier.adresseLigne1,
          adresseLigne2: detail.tier.adresseLigne2,
          codePostal: detail.tier.codePostal,
          ville: detail.tier.ville,
          pays: detail.tier.pays,
          corpsEtatIds: detail.corpsEtatIds,
          societeIds: detail.societeIds,
        }}
        corpsEtatOptions={ref.corpsEtat.map((c) => ({ id: c.id, libelle: c.libelle }))}
        societeOptions={ref.societes.map((s) => ({ id: s.id, libelle: s.raisonSociale }))}
        successRedirect={`/${slug}/tiers/referencement`}
        onSubmit={async (values) => {
          'use server';
          return mettreAJourTier(id, values);
        }}
      />

      <div className="mt-6 grid max-w-2xl gap-6">
        <Card>
          <CardHeader className="flex-row items-center justify-between gap-3 space-y-0">
            <CardTitle className="flex items-center gap-3 text-base">
              Agrément <StatutAgrementBadge statut={detail.tier.statutAgrement} />
            </CardTitle>
            {peutDocs && detail.conformite.classe === 'a_relancer' && (
              <RelanceButton tierId={id} />
            )}
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="text-sm text-muted-foreground">
              {detail.tier.dateAgrement && <span>Agréé le {detail.tier.dateAgrement}. </span>}
              {detail.tier.dateRefus && <span>Refusé le {detail.tier.dateRefus}. </span>}
              {detail.tier.motifRefus && <span>Motif : {detail.tier.motifRefus}.</span>}
              {detail.conformite.nbProblemes > 0 ? (
                <span>
                  {detail.conformite.nbProblemes} document(s) à régulariser sur{' '}
                  {detail.conformite.lignes.length} requis.
                </span>
              ) : (
                <span>Tous les documents requis sont à jour.</span>
              )}
            </div>
            {peutAgrement && <AgrementActions tierId={id} statut={detail.tier.statutAgrement} />}
          </CardContent>
        </Card>

        <FormSection
          title="Documents administratifs"
          description="Pièces requises selon les corps d'état du tier."
          storageKey="tier:documents"
        >
          <TierDocumentsList
            tierId={id}
            lignes={detail.conformite.lignes}
            documents={detail.documents}
            natures={ref.natures.map((n) => ({
              id: n.id,
              code: n.code,
              libelle: n.libelle,
              modeControle: n.modeControle,
            }))}
            peutEcrire={peutDocs}
          />
        </FormSection>
      </div>
    </>
  );
}
