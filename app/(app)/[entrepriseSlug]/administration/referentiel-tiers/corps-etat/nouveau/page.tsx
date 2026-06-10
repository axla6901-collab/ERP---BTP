import { CorpsEtatForm } from '@/components/referencement/corps-etat-form';
import { requireAuthWithMfa } from '@/lib/auth/guards';
import { creerCorpsEtat } from '@/lib/referencement/corps-etat';
import { ROLES_REFERENTIEL_TIERS_WRITE } from '@/lib/referencement/permissions';

export default async function NouveauCorpsEtatPage() {
  await requireAuthWithMfa(ROLES_REFERENTIEL_TIERS_WRITE);

  return (
    <CorpsEtatForm
      titre="Nouveau corps d’état"
      onSubmit={async (values) => {
        'use server';
        return creerCorpsEtat(values);
      }}
      successRedirect="/administration/referentiel-tiers/corps-etat"
    />
  );
}
