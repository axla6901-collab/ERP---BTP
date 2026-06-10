import Link from 'next/link';

import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { buttonVariants } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { requireAuth } from '@/lib/auth/guards';
import { LIBELLES_ROLE, ROLES_MFA_OBLIGATOIRE } from '@/lib/auth/rbac';

import { DisableMfaButton } from './disable-button';

export default async function MfaStatusPage() {
  const utilisateur = await requireAuth();
  const obligatoire = ROLES_MFA_OBLIGATOIRE.includes(utilisateur.role);

  return (
    <div className="max-w-xl space-y-6">
      <h1 className="text-3xl font-semibold">Double authentification</h1>

      <Card>
        <CardHeader>
          <CardTitle>Statut</CardTitle>
          <CardDescription>
            {utilisateur.twoFactorEnabled
              ? 'La double authentification est activée sur ton compte.'
              : 'La double authentification n’est pas activée.'}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {obligatoire && !utilisateur.twoFactorEnabled && (
            <Alert variant="destructive">
              <AlertTitle>Activation obligatoire</AlertTitle>
              <AlertDescription>
                Ton rôle ({LIBELLES_ROLE[utilisateur.role]}) impose la double authentification.
              </AlertDescription>
            </Alert>
          )}
          <p className="text-sm text-muted-foreground">
            Une fois activée, tu devras saisir un code à 6 chiffres généré par une application
            (Google Authenticator, Authy, 1Password, etc.) à chaque connexion.
          </p>
        </CardContent>
        <CardFooter className="flex justify-end gap-2">
          {utilisateur.twoFactorEnabled ? (
            <DisableMfaButton />
          ) : (
            <Link href="/profile/mfa/setup" className={buttonVariants()}>
              Activer la double authentification
            </Link>
          )}
        </CardFooter>
      </Card>
    </div>
  );
}
