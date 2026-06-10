import { ClientForm } from '@/components/commercial/client-form';
import { requireAuthWithMfa } from '@/lib/auth/guards';
import { creerClient } from '@/lib/commercial/clients';
import { ROLES_COMMERCIAL_WRITE } from '@/lib/commercial/permissions';

export default async function NouveauClientPage() {
  await requireAuthWithMfa(ROLES_COMMERCIAL_WRITE);

  return (
    <div className="space-y-4">
      <h2 className="text-xl font-medium">Nouveau client</h2>
      <ClientForm
        onSubmit={async (values) => {
          'use server';
          return creerClient(values);
        }}
        successRedirect="/commercial/clients"
      />
    </div>
  );
}
