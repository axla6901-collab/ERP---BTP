import Link from 'next/link';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { requireAuthWithMfa } from '@/lib/auth/guards';
import { LIBELLES_ROLE } from '@/lib/auth/rbac';

export default async function ProfilePage() {
  const utilisateur = await requireAuthWithMfa();

  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-semibold">Mon profil</h1>

      <Card>
        <CardHeader>
          <CardTitle>Informations du compte</CardTitle>
          <CardDescription>Données issues de l&apos;authentification et du RBAC.</CardDescription>
        </CardHeader>
        <CardContent>
          <dl className="grid grid-cols-1 gap-3 sm:grid-cols-[auto_1fr]">
            <dt className="text-sm font-medium text-muted-foreground">Nom</dt>
            <dd className="text-sm">{utilisateur.name}</dd>

            <dt className="text-sm font-medium text-muted-foreground">Email</dt>
            <dd className="text-sm">{utilisateur.email}</dd>

            <dt className="text-sm font-medium text-muted-foreground">Rôle</dt>
            <dd className="text-sm">{LIBELLES_ROLE[utilisateur.role]}</dd>

            <dt className="text-sm font-medium text-muted-foreground">Identifiant interne</dt>
            <dd className="font-mono text-xs">{utilisateur.id}</dd>

            <dt className="text-sm font-medium text-muted-foreground">Lien employé</dt>
            <dd className="text-sm text-muted-foreground">
              {utilisateur.employeId ?? 'Aucun (sera configuré en M5 — RH & pointage)'}
            </dd>
          </dl>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Sécurité</CardTitle>
          <CardDescription>Double authentification (TOTP)</CardDescription>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          <p>
            Statut&nbsp;:{' '}
            <span
              className={utilisateur.twoFactorEnabled ? 'font-medium' : 'text-muted-foreground'}
            >
              {utilisateur.twoFactorEnabled ? 'activée' : 'non activée'}
            </span>
          </p>
          <Link href="/profile/mfa" className="underline underline-offset-4">
            {utilisateur.twoFactorEnabled ? 'Gérer la MFA' : 'Activer la MFA'}
          </Link>
        </CardContent>
      </Card>
    </div>
  );
}
