import { SocieteForm } from '@/components/referencement/societe-form';
import { requireAuthWithMfa } from '@/lib/auth/guards';
import { creerSociete } from '@/lib/referencement/societes';
import { ROLES_REFERENTIEL_TIERS_WRITE } from '@/lib/referencement/permissions';

export default async function NouvelleSocietePage() {
  await requireAuthWithMfa(ROLES_REFERENTIEL_TIERS_WRITE);

  return (
    <SocieteForm
      titre="Nouvelle société"
      onSubmit={async (values) => {
        'use server';
        return creerSociete(values);
      }}
      successRedirect="/administration/referentiel-tiers/societes"
    />
  );
}
