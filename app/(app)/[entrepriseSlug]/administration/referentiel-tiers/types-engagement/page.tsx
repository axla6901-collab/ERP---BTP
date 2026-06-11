import { MatriceEngagementEditor } from '@/components/referencement/matrice-engagement-editor';
import { PageToolbar } from '@/components/layout/page-toolbar';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { requireAuthWithMfa } from '@/lib/auth/guards';
import { lireMatriceEngagement } from '@/lib/referencement/matrice-engagement';
import { peutAdministrerReferentielTiers } from '@/lib/referencement/permissions';
import type { NatureTiers, TypeEngagement } from '@/lib/validation/referencement-tiers';

export default async function TypesEngagementPage() {
  const utilisateur = await requireAuthWithMfa();
  const peutEcrire = peutAdministrerReferentielTiers(utilisateur.role);
  const matrice = await lireMatriceEngagement();

  const initial = matrice.map((m) => ({
    natureTiers: m.natureTiers as NatureTiers,
    typeEngagement: m.typeEngagement as TypeEngagement,
    autorise: m.autorise,
  }));

  return (
    <div className="space-y-6">
      <PageToolbar
        title="Types d’engagement"
        subtitle="Cloisonnement nature du tiers × type d’engagement"
      />
      <Alert>
        <AlertTitle>Référentiel global</AlertTitle>
        <AlertDescription>
          Cette matrice est partagée par toutes les entreprises (référentiel sectoriel BTP). La
          modifier impacte l’ensemble des tenants.
        </AlertDescription>
      </Alert>
      <MatriceEngagementEditor initial={initial} peutEcrire={peutEcrire} />
    </div>
  );
}
