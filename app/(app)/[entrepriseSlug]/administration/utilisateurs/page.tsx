import { asc, eq, isNull, isNotNull } from 'drizzle-orm';

import {
  UtilisateurActions,
  type RoleOption,
} from '@/components/admin/utilisateur-actions';
import { PageToolbar } from '@/components/layout/page-toolbar';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { user } from '@/db/schema/auth';
import { roles } from '@/db/schema/rbac';
import { utilisateurs } from '@/db/schema/utilisateurs';
import { getCurrentUtilisateur } from '@/lib/auth/guards';
import {
  assignerRole,
  basculerActifUtilisateur,
  restaurerUtilisateur,
  supprimerUtilisateur,
} from '@/lib/admin/utilisateurs';
// eslint-disable-next-line no-restricted-imports -- lecture de tables globales (utilisateurs/roles, sans entreprise_id) : pas de contexte tenant requis
import { db } from '@/lib/db/client';

function formaterDate(d: Date | null): string {
  if (!d) return '—';
  return d.toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' });
}

export default async function UtilisateursPage() {
  const [moi, actifs, supprimes, rolesRows] = await Promise.all([
    getCurrentUtilisateur(),
    db
      .select({
        id: utilisateurs.id,
        email: utilisateurs.email,
        roleId: utilisateurs.roleId,
        roleLibelle: roles.libelle,
        roleCode: roles.code,
        roleSysteme: roles.systeme,
        actif: utilisateurs.actif,
        twoFactorEnabled: user.twoFactorEnabled,
        derniereConnexionAt: utilisateurs.derniereConnexionAt,
      })
      .from(utilisateurs)
      .innerJoin(roles, eq(roles.id, utilisateurs.roleId))
      .innerJoin(user, eq(user.id, utilisateurs.id))
      .where(isNull(utilisateurs.deletedAt))
      .orderBy(asc(utilisateurs.email)),
    db
      .select({
        id: utilisateurs.id,
        email: utilisateurs.email,
        roleId: utilisateurs.roleId,
        roleLibelle: roles.libelle,
        roleCode: roles.code,
        deletedAt: utilisateurs.deletedAt,
      })
      .from(utilisateurs)
      .innerJoin(roles, eq(roles.id, utilisateurs.roleId))
      .where(isNotNull(utilisateurs.deletedAt))
      .orderBy(asc(utilisateurs.email)),
    db
      .select({ id: roles.id, code: roles.code, libelle: roles.libelle, actif: roles.actif })
      .from(roles)
      .orderBy(asc(roles.libelle)),
  ]);

  const rolesActifs: RoleOption[] = rolesRows
    .filter((r) => r.actif)
    .map((r) => ({ id: r.id, code: r.code, libelle: r.libelle }));

  return (
    <div className="space-y-6">
      <PageToolbar
        title="Utilisateurs"
        subtitle={`${actifs.length} actif(s)`}
        actions={
          <span className="text-xs text-muted-foreground">
            Création de compte via la console super-admin (création d’entreprise) ;
            promotion admin via{' '}
            <code className="font-mono text-xs">pnpm bootstrap:admin &lt;email&gt;</code>
          </span>
        }
      />

      <section className="space-y-3">
        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Email</TableHead>
                  <TableHead>Rôle</TableHead>
                  <TableHead>MFA</TableHead>
                  <TableHead>Statut</TableHead>
                  <TableHead>Dernière connexion</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {actifs.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center text-sm text-muted-foreground">
                      Aucun utilisateur actif.
                    </TableCell>
                  </TableRow>
                ) : (
                  actifs.map((u) => {
                    const estSoi = moi?.id === u.id;
                    return (
                      <TableRow key={u.id}>
                        <TableCell className="font-mono text-xs">
                          {u.email}
                          {estSoi && (
                            <span className="ml-2 rounded border px-1.5 py-0.5 text-[10px] uppercase text-muted-foreground">
                              toi
                            </span>
                          )}
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <span>{u.roleLibelle}</span>
                            {u.roleSysteme && (
                              <span className="rounded border px-1.5 py-0.5 text-[10px] uppercase text-muted-foreground">
                                système
                              </span>
                            )}
                          </div>
                          <div className="font-mono text-[10px] uppercase tracking-wide text-muted-foreground">
                            {u.roleCode}
                          </div>
                        </TableCell>
                        <TableCell>
                          {u.twoFactorEnabled ? (
                            <Badge tone="emerald">Activée</Badge>
                          ) : (
                            <span className="text-xs text-muted-foreground">—</span>
                          )}
                        </TableCell>
                        <TableCell>
                          {u.actif ? (
                            <Badge tone="sky">Actif</Badge>
                          ) : (
                            <Badge tone="neutral">Désactivé</Badge>
                          )}
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground">
                          {formaterDate(u.derniereConnexionAt)}
                        </TableCell>
                        <TableCell>
                          <UtilisateurActions
                            utilisateurId={u.id}
                            roleIdCourant={u.roleId}
                            rolesDisponibles={rolesActifs}
                            actif={u.actif}
                            supprime={false}
                            estSoi={estSoi}
                            onAssignerRole={async (roleId) => {
                              'use server';
                              return assignerRole(u.id, roleId);
                            }}
                            onBasculerActif={async (actif) => {
                              'use server';
                              return basculerActifUtilisateur(u.id, actif);
                            }}
                            onSupprimer={async () => {
                              'use server';
                              return supprimerUtilisateur(u.id);
                            }}
                            onRestaurer={async () => {
                              'use server';
                              return restaurerUtilisateur(u.id);
                            }}
                          />
                        </TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </section>

      {supprimes.length > 0 && (
        <section className="space-y-3">
          <h3 className="text-base font-medium text-muted-foreground">
            Utilisateurs supprimés ({supprimes.length})
          </h3>
          <Card>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Email</TableHead>
                    <TableHead>Rôle au moment de la suppression</TableHead>
                    <TableHead>Supprimé le</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {supprimes.map((u) => (
                    <TableRow key={u.id} className="opacity-70">
                      <TableCell className="font-mono text-xs">{u.email}</TableCell>
                      <TableCell>
                        <div>{u.roleLibelle}</div>
                        <div className="font-mono text-[10px] uppercase tracking-wide text-muted-foreground">
                          {u.roleCode}
                        </div>
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {formaterDate(u.deletedAt)}
                      </TableCell>
                      <TableCell>
                        <UtilisateurActions
                          utilisateurId={u.id}
                          roleIdCourant={u.roleId}
                          rolesDisponibles={rolesActifs}
                          actif={false}
                          supprime={true}
                          estSoi={false}
                          onAssignerRole={async (roleId) => {
                            'use server';
                            return assignerRole(u.id, roleId);
                          }}
                          onBasculerActif={async (actif) => {
                            'use server';
                            return basculerActifUtilisateur(u.id, actif);
                          }}
                          onSupprimer={async () => {
                            'use server';
                            return supprimerUtilisateur(u.id);
                          }}
                          onRestaurer={async () => {
                            'use server';
                            return restaurerUtilisateur(u.id);
                          }}
                        />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </section>
      )}
    </div>
  );
}
