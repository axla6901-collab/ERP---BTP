import { RaisonSocialeForm } from '@/components/referencement/raison-sociale-form';
import { ROLES_ADMINISTRATION } from '@/lib/admin/permissions';
import { requireAuthWithMfa } from '@/lib/auth/guards';
import { creerRaisonSociale } from '@/lib/referencement/raisons-sociales';

export default async function NouvelleRaisonSocialePage() {
  await requireAuthWithMfa(ROLES_ADMINISTRATION);

  return (
    <RaisonSocialeForm
      titre="Nouvelle raison sociale"
      onSubmit={async (values) => {
        'use server';
        return creerRaisonSociale(values);
      }}
      successRedirect="/administration/raisons-sociales"
    />
  );
}
