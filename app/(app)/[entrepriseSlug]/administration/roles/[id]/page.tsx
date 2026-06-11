import Link from 'next/link';
import { notFound } from 'next/navigation';
import { count, eq } from 'drizzle-orm';

import { RoleForm } from '@/components/admin/role-form';
import { DeleteButton } from '@/components/catalogue/delete-button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { roles } from '@/db/schema/rbac';
import { utilisateurs } from '@/db/schema/utilisateurs';
import { mettreAJourRole, supprimerRole } from '@/lib/admin/roles';
// eslint-disable-next-line no-restricted-imports -- lecture de tables globales (RBAC, sans entreprise_id) : pas de contexte tenant requis
import { db } from '@/lib/db/client';

export default async function EditionRolePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [role] = await db.select().from(roles).where(eq(roles.id, id)).limit(1);
  if (!role) notFound();

  const [compte] = await db
    .select({ n: count() })
    .from(utilisateurs)
    .where(eq(utilisateurs.roleId, id));
  const nbUtilisateurs = compte?.n ?? 0;

  const peutSupprimer = !role.systeme && nbUtilisateurs === 0;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-medium">Modifier le rôle</h2>
        <Link
          href="/administration/roles"
          className="text-sm text-muted-foreground underline underline-offset-4 hover:text-foreground"
        >
          ← Retour à la liste
        </Link>
      </div>

      {role.systeme && (
        <Alert>
          <AlertDescription>
            Ce rôle est <strong>système</strong> : le code est figé, et il ne peut pas être
            supprimé. Le libellé, la description et l&apos;état actif/désactivé restent modifiables.
            Ses permissions s&apos;éditent dans la matrice de la page{' '}
            <Link href="/administration/roles" className="underline underline-offset-4">
              Rôles &amp; permissions
            </Link>
            .
          </AlertDescription>
        </Alert>
      )}

      <RoleForm
        mode="edit"
        defaultValues={{
          code: role.code,
          libelle: role.libelle,
          description: role.description,
          actif: role.actif,
        }}
        codeFige={role.systeme}
        onSubmit={async (values) => {
          'use server';
          return mettreAJourRole(id, values);
        }}
        successRedirect="/administration/roles"
      />

      {peutSupprimer && (
        <div className="max-w-xl border-t pt-6">
          <h3 className="mb-2 text-sm font-medium text-destructive">Zone dangereuse</h3>
          <DeleteButton
            label="Supprimer ce rôle"
            confirmText="Le rôle sera supprimé définitivement. Cette action est irréversible et n'est possible que si aucun utilisateur n'est rattaché."
            redirectTo="/administration/roles"
            action={async () => {
              'use server';
              return supprimerRole(id);
            }}
          />
        </div>
      )}

      {!peutSupprimer && !role.systeme && nbUtilisateurs > 0 && (
        <Alert variant="destructive">
          <AlertDescription>
            Suppression impossible : {nbUtilisateurs} utilisateur{nbUtilisateurs > 1 ? 's' : ''}{' '}
            {nbUtilisateurs > 1 ? 'sont' : 'est'} encore rattaché{nbUtilisateurs > 1 ? 's' : ''} à
            ce rôle. Réassigne-{nbUtilisateurs > 1 ? 'les' : 'le'} à un autre rôle avant de
            supprimer.
          </AlertDescription>
        </Alert>
      )}
    </div>
  );
}
