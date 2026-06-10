import { RoleForm } from '@/components/admin/role-form';
import { creerRole } from '@/lib/admin/roles';

export default function NouveauRolePage() {
  return (
    <div className="space-y-4">
      <h2 className="text-xl font-medium">Nouveau rôle</h2>
      <p className="text-sm text-muted-foreground">
        Crée un rôle <em>custom</em>. Le code est utilisé en interne par l&apos;application (logs,
        audit) et ne peut plus être modifié après création. Les permissions s&apos;assignent ensuite
        via la matrice sur la page <strong>Rôles &amp; permissions</strong>.
      </p>
      <RoleForm
        mode="create"
        onSubmit={async (values) => {
          'use server';
          return creerRole(values);
        }}
        successRedirect="/administration/roles"
      />
    </div>
  );
}
