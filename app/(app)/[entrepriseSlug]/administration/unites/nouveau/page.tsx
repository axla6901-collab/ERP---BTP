import { UniteForm } from '@/components/catalogue/unite-form';
import { ROLES_ADMINISTRATION } from '@/lib/admin/permissions';
import { requireAuthWithMfa } from '@/lib/auth/guards';
import { creerUnite } from '@/lib/catalogue/unites';

export default async function NouvelleUnitePage() {
  await requireAuthWithMfa(ROLES_ADMINISTRATION);

  return (
    <UniteForm
      titre="Nouvelle unité"
      onSubmit={async (values) => {
        'use server';
        return creerUnite(values);
      }}
      successRedirect="/administration/unites"
    />
  );
}
