import { redirect } from 'next/navigation';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { requireAuth } from '@/lib/auth/guards';

import { MfaSetupClient } from './mfa-setup-client';

export default async function MfaSetupPage() {
  const utilisateur = await requireAuth();
  if (utilisateur.twoFactorEnabled) {
    redirect('/profile/mfa');
  }

  return (
    <div className="max-w-xl space-y-6">
      <h1 className="text-3xl font-semibold">Activer la double authentification</h1>

      <Card>
        <CardHeader>
          <CardTitle>Procédure</CardTitle>
          <CardDescription>
            Tu auras besoin d&apos;une application TOTP installée sur ton téléphone (Google
            Authenticator, Authy, 1Password, Microsoft Authenticator, etc.).
          </CardDescription>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground">
          <ol className="list-decimal space-y-1 pl-5">
            <li>Confirme ton mot de passe pour générer ton secret.</li>
            <li>Scanne le QR code avec ton application.</li>
            <li>Note les codes de secours en lieu sûr.</li>
            <li>Saisis le code à 6 chiffres pour valider.</li>
          </ol>
        </CardContent>
      </Card>

      <MfaSetupClient />
    </div>
  );
}
