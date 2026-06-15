import Link from 'next/link';
import { count, isNull } from 'drizzle-orm';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
// eslint-disable-next-line no-restricted-imports -- lecture de tables globales (RBAC/registre, sans entreprise_id) : pas de contexte tenant requis
import { db } from '@/lib/db/client';
import { unites } from '@/db/schema/catalogue';
import { raisonsSociales } from '@/db/schema/raisons-sociales';
import { permissions, roles } from '@/db/schema/rbac';
import { utilisateurs } from '@/db/schema/utilisateurs';
import { requireTenantContext } from '@/lib/auth/tenant-guards';
import { withTenant } from '@/lib/db/with-tenant';

async function compter(entrepriseId: string) {
  const [[u], [r], [p], [un], rs] = await Promise.all([
    db.select({ n: count() }).from(utilisateurs).where(isNull(utilisateurs.deletedAt)),
    db.select({ n: count() }).from(roles),
    db.select({ n: count() }).from(permissions),
    // `unites` est un référentiel GLOBAL (sans entreprise_id, pas de RLS tenant) :
    // lecture directe via `db`, comme `listerUnites`.
    db.select({ n: count() }).from(unites).where(isNull(unites.deletedAt)),
    // `raisons_sociales` est tenant-scopé (RLS) : comptage via withTenant.
    withTenant(entrepriseId, (tx) =>
      tx.select({ n: count() }).from(raisonsSociales).where(isNull(raisonsSociales.deletedAt)),
    ),
  ]);
  return {
    utilisateurs: u?.n ?? 0,
    roles: r?.n ?? 0,
    permissions: p?.n ?? 0,
    unites: un?.n ?? 0,
    raisonsSociales: rs[0]?.n ?? 0,
  };
}

const TUILES = [
  {
    titre: 'Utilisateurs',
    description: "Comptes, rôles, MFA, activation. Assignation d'un rôle par utilisateur.",
    href: '/administration/utilisateurs',
    cleCompteur: 'utilisateurs' as const,
  },
  {
    titre: 'Rôles & permissions',
    description:
      'Matrice rôle × permission éditable. Rôles système non supprimables, mais leurs permissions sont libres.',
    href: '/administration/roles',
    cleCompteur: 'roles' as const,
  },
  {
    titre: 'Unités',
    description:
      'Référentiel des unités de mesure (masse, longueur, surface, volume, temps, unitaire). Partagé par le catalogue, les devis et la facturation.',
    href: '/administration/unites',
    cleCompteur: 'unites' as const,
  },
  {
    titre: 'Raisons sociales',
    description:
      'Référentiel central des raisons sociales. Source unique partagée par les clients (professionnels), fournisseurs, sous-traitants et sociétés du groupe.',
    href: '/administration/raisons-sociales',
    cleCompteur: 'raisonsSociales' as const,
  },
  {
    titre: 'Ma société',
    description:
      "Identité légale, logos (principal + RGE/certifications), Conditions Générales de Vente et d'Achat versionnées, numérotation des documents.",
    href: '/administration/entreprise',
    cleCompteur: null,
  },
];

export default async function AdministrationDashboard() {
  const { entreprise } = await requireTenantContext();
  const compteurs = await compter(entreprise.id);
  const prefixe = `/${entreprise.slug}`;

  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {TUILES.map((t) => (
        <Link key={t.href} href={`${prefixe}${t.href}`} className="block">
          <Card className="transition hover:border-foreground/40">
            <CardHeader>
              <CardTitle className="flex items-baseline justify-between gap-2">
                <span>{t.titre}</span>
                {t.cleCompteur ? (
                  <span className="text-2xl font-bold">{compteurs[t.cleCompteur]}</span>
                ) : null}
              </CardTitle>
              <CardDescription>{t.description}</CardDescription>
            </CardHeader>
            <CardContent className="text-sm text-muted-foreground">
              {t.href === '/administration/roles' && (
                <span className="block">{compteurs.permissions} permissions atomiques</span>
              )}
              Ouvrir →
            </CardContent>
          </Card>
        </Link>
      ))}
    </div>
  );
}
