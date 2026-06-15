import { ClientForm } from '@/components/commercial/client-form';
import { requireAuthWithMfa } from '@/lib/auth/guards';
import { creerClient } from '@/lib/commercial/clients';
import { ROLES_COMMERCIAL_WRITE } from '@/lib/commercial/permissions';
import { listerRaisonsSocialesActives } from '@/lib/referencement/raisons-sociales';

export default async function NouveauClientPage() {
  await requireAuthWithMfa(ROLES_COMMERCIAL_WRITE);
  const raisonsSocialesConnues = await listerRaisonsSocialesActives();

  return (
    <div className="space-y-4">
      <h2 className="text-xl font-medium">Nouveau client</h2>
      <ClientForm
        raisonsSocialesConnues={raisonsSocialesConnues}
        onSubmit={async (values) => {
          'use server';
          return creerClient(values);
        }}
        successRedirect="/commercial/clients"
      />
    </div>
  );
}
