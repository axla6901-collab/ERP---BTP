import { FournisseurForm } from '@/components/tiers/fournisseur-form';
import { requireAuthWithMfa } from '@/lib/auth/guards';
import { listerRaisonsSocialesActives } from '@/lib/referencement/raisons-sociales';
import { creerFournisseur } from '@/lib/tiers/fournisseurs';
import { ROLES_TIERS_WRITE } from '@/lib/tiers/permissions';

export default async function NouveauFournisseurPage() {
  await requireAuthWithMfa(ROLES_TIERS_WRITE);
  const raisonsSocialesConnues = await listerRaisonsSocialesActives();

  return (
    <div className="space-y-4">
      <FournisseurForm
        titre="Nouveau fournisseur"
        raisonsSocialesConnues={raisonsSocialesConnues}
        onSubmit={async (values) => {
          'use server';
          return creerFournisseur(values);
        }}
        successRedirect="/tiers/fournisseurs"
      />
    </div>
  );
}
