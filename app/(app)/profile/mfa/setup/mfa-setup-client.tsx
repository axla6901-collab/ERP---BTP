'use client';

import { useRouter } from 'next/navigation';
import QRCode from 'qrcode';
import { useState } from 'react';
import { toast } from 'sonner';

import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { authClient } from '@/lib/auth/client';

type Step = 'password' | 'verify' | 'done';

export function MfaSetupClient() {
  const router = useRouter();
  const [step, setStep] = useState<Step>('password');
  const [password, setPassword] = useState('');
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  const [backupCodes, setBackupCodes] = useState<string[]>([]);
  const [code, setCode] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);

  async function handleGenerate() {
    setErreur(null);
    if (!password) {
      setErreur('Mot de passe requis.');
      return;
    }
    setIsSubmitting(true);
    const { data, error } = await authClient.twoFactor.enable({ password });
    setIsSubmitting(false);
    if (error || !data) {
      // eslint-disable-next-line no-console
      console.error('[mfa-setup] enable error', {
        message: error?.message,
        code: error?.code,
        status: error?.status,
        full: error,
      });
      const msg =
        error?.code === 'INVALID_PASSWORD' || error?.message?.match(/password/i)
          ? 'Mot de passe incorrect.'
          : (error?.message ??
            (error?.code ? `Activation impossible (${error.code}).` : 'Activation impossible.'));
      setErreur(msg);
      return;
    }
    setBackupCodes(data.backupCodes ?? []);
    try {
      const dataUrl = await QRCode.toDataURL(data.totpURI, { width: 240, margin: 2 });
      setQrDataUrl(dataUrl);
    } catch {
      setErreur('Impossible de générer le QR code.');
      return;
    }
    setStep('verify');
  }

  async function handleVerify() {
    setErreur(null);
    if (!/^\d{6}$/.test(code)) {
      setErreur('Le code doit comporter 6 chiffres.');
      return;
    }
    setIsSubmitting(true);
    const { error } = await authClient.twoFactor.verifyTotp({ code });
    setIsSubmitting(false);
    if (error) {
      setErreur(error.message ?? 'Code invalide.');
      return;
    }
    setStep('done');
    toast.success('Double authentification activée');
  }

  if (step === 'password') {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Étape 1 — Confirmer ton mot de passe</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4">
          {erreur && (
            <Alert variant="destructive">
              <AlertDescription>{erreur}</AlertDescription>
            </Alert>
          )}
          <div className="grid gap-2">
            <Label htmlFor="setup-password">Mot de passe actuel</Label>
            <Input
              id="setup-password"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>
          <Button onClick={handleGenerate} disabled={isSubmitting}>
            {isSubmitting ? 'Génération…' : 'Générer mon secret'}
          </Button>
        </CardContent>
      </Card>
    );
  }

  if (step === 'verify') {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Étape 2 — Scanner le QR code</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4">
          {qrDataUrl && (
            <div className="flex justify-center rounded border bg-white p-4">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={qrDataUrl} alt="QR code TOTP" width={240} height={240} />
            </div>
          )}

          <Alert>
            <AlertTitle>Codes de secours</AlertTitle>
            <AlertDescription>
              Note ces codes en lieu sûr. Chaque code n&apos;est utilisable qu&apos;une seule fois
              en cas de perte du téléphone.
              <ul className="mt-2 grid grid-cols-2 gap-1 font-mono text-xs">
                {backupCodes.map((c) => (
                  <li key={c}>{c}</li>
                ))}
              </ul>
            </AlertDescription>
          </Alert>

          {erreur && (
            <Alert variant="destructive">
              <AlertDescription>{erreur}</AlertDescription>
            </Alert>
          )}

          <div className="grid gap-2">
            <Label htmlFor="verify-code">Code à 6 chiffres affiché par ton application</Label>
            <Input
              id="verify-code"
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={6}
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
            />
          </div>
          <Button onClick={handleVerify} disabled={isSubmitting}>
            {isSubmitting ? 'Vérification…' : 'Confirmer'}
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Activation terminée</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <Alert>
          <AlertTitle>La double authentification est active.</AlertTitle>
          <AlertDescription>
            À ta prochaine connexion, tu devras saisir le code généré par ton application.
          </AlertDescription>
        </Alert>
        <Button onClick={() => router.push('/profile/mfa')}>Retour au statut MFA</Button>
      </CardContent>
    </Card>
  );
}
