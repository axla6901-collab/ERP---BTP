'use client';

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useState } from 'react';

import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { authClient } from '@/lib/auth/client';

type Mode = 'totp' | 'backup';

export default function TwoFactorPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const redirectTo = searchParams.get('redirect_to') ?? '/dashboard';
  const [mode, setMode] = useState<Mode>('totp');
  const [code, setCode] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);

  async function handleSubmit() {
    setErreur(null);
    if (mode === 'totp' && !/^\d{6}$/.test(code)) {
      setErreur('Le code TOTP comporte 6 chiffres.');
      return;
    }
    if (mode === 'backup' && code.length < 6) {
      setErreur('Code de secours invalide.');
      return;
    }
    setIsSubmitting(true);
    const { error } =
      mode === 'totp'
        ? await authClient.twoFactor.verifyTotp({ code })
        : await authClient.twoFactor.verifyBackupCode({ code });
    setIsSubmitting(false);

    if (error) {
      setErreur(error.message ?? 'Code invalide.');
      return;
    }
    router.push(redirectTo);
    router.refresh();
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-2xl">Double authentification</CardTitle>
        <CardDescription>
          {mode === 'totp'
            ? 'Saisis le code à 6 chiffres affiché par ton application TOTP.'
            : 'Saisis un de tes codes de secours (un seul usage chacun).'}
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4">
        {erreur && (
          <Alert variant="destructive">
            <AlertTitle>Code refusé</AlertTitle>
            <AlertDescription>{erreur}</AlertDescription>
          </Alert>
        )}
        <div className="grid gap-2">
          <Label htmlFor="tf-code">{mode === 'totp' ? 'Code TOTP' : 'Code de secours'}</Label>
          <Input
            id="tf-code"
            inputMode={mode === 'totp' ? 'numeric' : 'text'}
            autoComplete="one-time-code"
            maxLength={mode === 'totp' ? 6 : 32}
            value={code}
            onChange={(e) =>
              setCode(mode === 'totp' ? e.target.value.replace(/\D/g, '') : e.target.value.trim())
            }
            autoFocus
          />
        </div>
        <Button onClick={handleSubmit} disabled={isSubmitting} className="w-full">
          {isSubmitting ? 'Vérification…' : 'Valider'}
        </Button>
      </CardContent>
      <CardFooter className="flex flex-col gap-2 text-sm text-muted-foreground">
        <button
          type="button"
          onClick={() => {
            setMode(mode === 'totp' ? 'backup' : 'totp');
            setCode('');
            setErreur(null);
          }}
          className="underline underline-offset-4"
        >
          {mode === 'totp'
            ? 'Utiliser un code de secours à la place'
            : 'Revenir au code TOTP'}
        </button>
        <Link href="/login" className="underline underline-offset-4">
          Retour à la connexion
        </Link>
      </CardFooter>
    </Card>
  );
}
