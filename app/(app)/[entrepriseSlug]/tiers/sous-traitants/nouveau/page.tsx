import { SousTraitantForm } from '@/components/tiers/sous-traitant-form';
import { requireAuthWithMfa } from '@/lib/auth/guards';
import { ROLES_TIERS_WRITE } from '@/lib/tiers/permissions';
import { creerSousTraitant, listerSousTraitants } from '@/lib/tiers/sous-traitants';

export default async function NouveauSousTraitantPage() {
  await requireAuthWithMfa(ROLES_TIERS_WRITE);

  const existants = await listerSousTraitants();
  const parentsPossibles = existants
    .filter((s) => s.actif)
    .map((s) => ({ id: s.id, code: s.code, nom: s.nom }));

  return (
    <div className="space-y-4">
      <SousTraitantForm
        titre="Nouveau sous-traitant"
        parentsPossibles={parentsPossibles}
        onSubmit={async (values) => {
          'use server';
          return creerSousTraitant(values);
        }}
        successRedirect="/tiers/sous-traitants"
      />
    </div>
  );
}
