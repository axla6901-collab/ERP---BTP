import { SousTraitantForm } from '@/components/tiers/sous-traitant-form';
import { SousTraitantRailCreation } from '@/components/tiers/sous-traitant-rail-creation';
import { requireAuthWithMfa } from '@/lib/auth/guards';
import { listerRaisonsSocialesActives } from '@/lib/referencement/raisons-sociales';
import { ROLES_TIERS_WRITE } from '@/lib/tiers/permissions';
import { creerSousTraitant, listerSousTraitants } from '@/lib/tiers/sous-traitants';

export default async function NouveauSousTraitantPage({
  params,
}: {
  params: Promise<{ entrepriseSlug: string }>;
}) {
  const { entrepriseSlug } = await params;
  await requireAuthWithMfa(ROLES_TIERS_WRITE);

  const [existants, raisonsSocialesConnues] = await Promise.all([
    listerSousTraitants(),
    listerRaisonsSocialesActives(),
  ]);
  const parentsPossibles = existants
    .filter((s) => s.actif)
    .map((s) => ({ id: s.id, code: s.code, nom: s.nom }));

  return (
    <div className="space-y-4">
      <SousTraitantForm
        titre="Nouveau sous-traitant"
        parentsPossibles={parentsPossibles}
        raisonsSocialesConnues={raisonsSocialesConnues}
        retourHref={`/${entrepriseSlug}/tiers/sous-traitants`}
        rail={<SousTraitantRailCreation />}
        onSubmit={async (values) => {
          'use server';
          return creerSousTraitant(values);
        }}
        successRedirect="/tiers/sous-traitants"
      />
    </div>
  );
}
