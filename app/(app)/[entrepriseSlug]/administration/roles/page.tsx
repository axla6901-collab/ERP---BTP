import Link from 'next/link';
import { asc, count, desc, isNull } from 'drizzle-orm';

import {
  MatricePermissions,
  type GroupePermissions,
  type RoleLigne,
} from '@/components/admin/matrice-permissions';
import { RoleActions } from '@/components/admin/role-actions';
import { PageToolbar } from '@/components/layout/page-toolbar';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { buttonVariants } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { permissions, rolePermissions, roles } from '@/db/schema/rbac';
import { utilisateurs } from '@/db/schema/utilisateurs';
import { basculerActif, dupliquerRole, enregistrerMatrice, supprimerRole } from '@/lib/admin/roles';
// eslint-disable-next-line no-restricted-imports -- lecture de tables globales (RBAC, sans entreprise_id) : pas de contexte tenant requis
import { db } from '@/lib/db/client';

function grouperPermissions(perms: (typeof permissions.$inferSelect)[]): GroupePermissions[] {
  const parModule = new Map<string, Map<string | null, typeof perms>>();
  for (const p of perms) {
    if (!parModule.has(p.module)) parModule.set(p.module, new Map());
    const parSous = parModule.get(p.module)!;
    const k = p.sousModule;
    if (!parSous.has(k)) parSous.set(k, []);
    parSous.get(k)!.push(p);
  }
  return Array.from(parModule.entries()).map(([module, parSous]) => ({
    module,
    sousGroupes: Array.from(parSous.entries()).map(([sousModule, items]) => ({
      sousModule,
      permissions: items.map((p) => ({
        id: p.id,
        code: p.code,
        libelle: p.libelle,
        description: p.description,
      })),
    })),
  }));
}

export default async function RolesPage() {
  const [rolesRows, permsRows, rpRows, comptesRows] = await Promise.all([
    db
      .select({
        id: roles.id,
        code: roles.code,
        libelle: roles.libelle,
        description: roles.description,
        systeme: roles.systeme,
        actif: roles.actif,
      })
      .from(roles)
      .orderBy(desc(roles.systeme), asc(roles.libelle)),
    db.select().from(permissions).orderBy(asc(permissions.ordre)),
    db.select().from(rolePermissions),
    db
      .select({ roleId: utilisateurs.roleId, n: count() })
      .from(utilisateurs)
      .where(isNull(utilisateurs.deletedAt))
      .groupBy(utilisateurs.roleId),
  ]);

  const groupes = grouperPermissions(permsRows);
  const accordeesInitiales = new Set(rpRows.map((rp) => `${rp.roleId}::${rp.permissionId}`));
  const comptesParRole = new Map(comptesRows.map((c) => [c.roleId, c.n]));

  const matriceRoles: RoleLigne[] = rolesRows.map((r) => ({
    id: r.id,
    code: r.code,
    libelle: r.libelle,
    systeme: r.systeme,
    actif: r.actif,
  }));

  return (
    <div className="space-y-6">
      <PageToolbar
        title="Rôles applicatifs"
        subtitle={`${rolesRows.length} rôle(s)`}
        actions={
          <Link href="/administration/roles/nouveau" className={buttonVariants({ size: 'sm' })}>
            + Ajouter
          </Link>
        }
      />
      <section className="space-y-3">
        <Alert>
          <AlertDescription>
            Les <strong>permissions</strong> définissent ce que peut faire chaque rôle. La matrice
            ci-dessous est entièrement administrable : coche/décoche les permissions puis clique{' '}
            <strong>Enregistrer la matrice</strong>. Les rôles <em>système</em> ne peuvent pas être
            supprimés (l&apos;application en a besoin), mais leurs permissions sont libres. Le rôle{' '}
            <code className="font-mono text-xs">admin</code> est verrouillé pour éviter de se
            bloquer hors d&apos;accès.
          </AlertDescription>
        </Alert>

        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Code</TableHead>
                  <TableHead>Libellé</TableHead>
                  <TableHead>Description</TableHead>
                  <TableHead className="text-right">Utilisateurs</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rolesRows.map((r) => (
                  <TableRow key={r.id} className={r.actif ? '' : 'opacity-60'}>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <code className="font-mono text-xs uppercase">{r.code}</code>
                        {r.systeme && (
                          <span className="rounded border px-1.5 py-0.5 text-[10px] uppercase text-muted-foreground">
                            système
                          </span>
                        )}
                        {!r.actif && (
                          <Badge tone="neutral" className="px-1.5 py-0.5 text-[10px] uppercase">
                            désactivé
                          </Badge>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>{r.libelle}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {r.description ?? '—'}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {comptesParRole.get(r.id) ?? 0}
                    </TableCell>
                    <TableCell>
                      <RoleActions
                        roleId={r.id}
                        roleCode={r.code}
                        systeme={r.systeme}
                        actif={r.actif}
                        onDupliquer={async () => {
                          'use server';
                          return dupliquerRole(r.id);
                        }}
                        onBasculerActif={async (actif) => {
                          'use server';
                          return basculerActif(r.id, actif);
                        }}
                        onSupprimer={async () => {
                          'use server';
                          return supprimerRole(r.id);
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

      <section className="space-y-3">
        <h2 className="text-xl font-medium">Matrice des permissions par rôle</h2>
        <MatricePermissions
          roles={matriceRoles}
          groupes={groupes}
          accordeesInitiales={accordeesInitiales}
          onEnregistrer={async (changements) => {
            'use server';
            return enregistrerMatrice(changements);
          }}
        />
      </section>
    </div>
  );
}
