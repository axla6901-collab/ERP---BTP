import Link from 'next/link';
import { notFound } from 'next/navigation';
import { asc, eq } from 'drizzle-orm';

import { UtilisateurForm } from '@/components/admin/utilisateur-form';
import { DeleteButton } from '@/components/catalogue/delete-button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { user } from '@/db/schema/auth';
import { roles } from '@/db/schema/rbac';
import { utilisateurs } from '@/db/schema/utilisateurs';
import { getCurrentUtilisateur } from '@/lib/auth/guards';
import { mettreAJourUtilisateur, supprimerUtilisateur } from '@/lib/admin/utilisateurs';
// eslint-disable-next-line no-restricted-imports -- lecture de tables globales (utilisateurs/roles, sans entreprise_id) : pas de contexte tenant requis
import { db } from '@/lib/db/client';

export default async function EditionUtilisateurPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const moi = await getCurrentUtilisateur();

  const [row] = await db
    .select({
      id: utilisateurs.id,
      email: utilisateurs.email,
      roleId: utilisateurs.roleId,
      roleCode: roles.code,
      roleLibelle: roles.libelle,
      actif: utilisateurs.actif,
      deletedAt: utilisateurs.deletedAt,
      twoFactorEnabled: user.twoFactorEnabled,
      derniereConnexionAt: utilisateurs.derniereConnexionAt,
    })
    .from(utilisateurs)
    .innerJoin(roles, eq(roles.id, utilisateurs.roleId))
    .innerJoin(user, eq(user.id, utilisateurs.id))
    .where(eq(utilisateurs.id, id))
    .limit(1);

  if (!row) notFound();

  const rolesDisponibles = await db
    .select({ id: roles.id, code: roles.code, libelle: roles.libelle, actif: roles.actif })
    .from(roles)
    .orderBy(asc(roles.libelle));

  const estSoi = moi?.id === id;
  const peutSupprimer = !row.deletedAt && !estSoi;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-medium">Modifier l&apos;utilisateur</h2>
        <Link
          href="/administration/utilisateurs"
          className="text-sm text-muted-foreground underline underline-offset-4 hover:text-foreground"
        >
          ← Retour à la liste
        </Link>
      </div>

      {row.deletedAt && (
        <Alert variant="destructive">
          <AlertDescription>
            Ce compte a été <strong>supprimé</strong> le{' '}
            {row.deletedAt.toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' })}. Les
            mutations sont bloquées. Reviens à la liste pour le restaurer.
          </AlertDescription>
        </Alert>
      )}

      {estSoi && !row.deletedAt && (
        <Alert>
          <AlertDescription>
            C&apos;est <strong>ton compte</strong>. Tu ne peux ni te désactiver, ni te supprimer, ni
            retirer ton rôle admin (garde-fou de sécurité).
          </AlertDescription>
        </Alert>
      )}

      <UtilisateurForm
        email={row.email}
        defaultValues={{ roleId: row.roleId, actif: row.actif }}
        rolesDisponibles={rolesDisponibles}
        onSubmit={async (values) => {
          'use server';
          return mettreAJourUtilisateur(id, values);
        }}
        successRedirect="/administration/utilisateurs"
      />

      <div className="grid gap-1 text-xs text-muted-foreground">
        <div>
          MFA :{' '}
          {row.twoFactorEnabled ? (
            <span className="font-medium text-emerald-700 dark:text-emerald-300">activée</span>
          ) : (
            'non activée'
          )}
        </div>
        <div>
          Dernière connexion :{' '}
          {row.derniereConnexionAt
            ? row.derniereConnexionAt.toLocaleString('fr-FR', {
                dateStyle: 'short',
                timeStyle: 'short',
              })
            : '—'}
        </div>
      </div>

      {peutSupprimer && (
        <div className="max-w-xl border-t pt-6">
          <h3 className="mb-2 text-sm font-medium text-destructive">Zone dangereuse</h3>
          <DeleteButton
            label="Supprimer cet utilisateur"
            confirmText="Soft delete : la ligne est conservée pour traçabilité (audit, FK). Le compte est marqué actif=false et deletedAt=now(). Restaurable depuis la liste."
            redirectTo="/administration/utilisateurs"
            action={async () => {
              'use server';
              return supprimerUtilisateur(id);
            }}
          />
        </div>
      )}
    </div>
  );
}
