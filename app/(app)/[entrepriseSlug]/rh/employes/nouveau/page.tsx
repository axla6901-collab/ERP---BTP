import { EmployeForm } from '@/components/rh/employe-form';
import { requireAuthWithMfa } from '@/lib/auth/guards';
import { creerEmploye } from '@/lib/rh/employes';
import { ROLES_RH_WRITE } from '@/lib/rh/permissions';

export default async function NouvelEmployePage() {
  await requireAuthWithMfa(ROLES_RH_WRITE);

  return (
    <div className="space-y-4">
      <h2 className="text-xl font-medium">Nouvel employé</h2>
      <EmployeForm
        onSubmit={async (values) => {
          'use server';
          return creerEmploye(values);
        }}
        successRedirect="/rh/employes"
      />
    </div>
  );
}
