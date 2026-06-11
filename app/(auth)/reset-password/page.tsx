'use client';

import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useState } from 'react';
import { useForm } from 'react-hook-form';

import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { authClient } from '@/lib/auth/client';
import { resetPasswordSchema, type ResetPasswordInput } from '@/lib/auth/reset-password-schema';
import { typedZodResolver } from '@/lib/forms/zod-resolver';

function libelleErreur(code: string | undefined): string {
  switch (code) {
    case 'INVALID_TOKEN':
    case 'TOKEN_EXPIRED':
      return 'Ce lien est invalide ou expiré. Redemande un lien de réinitialisation.';
    case 'PASSWORD_TOO_SHORT':
      return 'Mot de passe trop court (12 caractères minimum).';
    default:
      return 'Réinitialisation impossible. Le lien a peut-être expiré — redemande un lien.';
  }
}

export default function ResetPasswordPage() {
  const searchParams = useSearchParams();
  const token = searchParams.get('token');
  const tokenError = searchParams.get('error'); // posé par better-auth si token KO

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const form = useForm<ResetPasswordInput>({
    resolver: typedZodResolver(resetPasswordSchema),
    defaultValues: { password: '', confirmation: '' },
  });

  const lienInvalide = !token || tokenError === 'INVALID_TOKEN';

  async function onSubmit(values: ResetPasswordInput) {
    if (!token) return;
    setErreur(null);
    setIsSubmitting(true);
    const { error } = await authClient.resetPassword({
      newPassword: values.password,
      token,
    });
    setIsSubmitting(false);
    if (error) {
      setErreur(libelleErreur(error.code));
      return;
    }
    setDone(true);
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-2xl">Nouveau mot de passe</CardTitle>
        <CardDescription>Choisis un nouveau mot de passe pour ton compte.</CardDescription>
      </CardHeader>
      <CardContent>
        {done ? (
          <Alert>
            <AlertTitle>Mot de passe mis à jour</AlertTitle>
            <AlertDescription>
              Tu peux maintenant te connecter avec ton nouveau mot de passe (et ta double
              authentification si elle est activée).
            </AlertDescription>
          </Alert>
        ) : lienInvalide ? (
          <Alert variant="destructive">
            <AlertTitle>Lien invalide ou expiré</AlertTitle>
            <AlertDescription>
              Ce lien de réinitialisation n’est plus valide. Redemande-en un depuis « Mot de passe
              oublié ».
            </AlertDescription>
          </Alert>
        ) : (
          <>
            {erreur && (
              <Alert variant="destructive" className="mb-4">
                <AlertTitle>Réinitialisation impossible</AlertTitle>
                <AlertDescription>{erreur}</AlertDescription>
              </Alert>
            )}
            <Form {...form}>
              <form method="post" onSubmit={form.handleSubmit(onSubmit)} className="grid gap-4">
                <FormField
                  control={form.control}
                  name="password"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Nouveau mot de passe</FormLabel>
                      <FormControl>
                        <Input type="password" autoComplete="new-password" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="confirmation"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Confirmer le mot de passe</FormLabel>
                      <FormControl>
                        <Input type="password" autoComplete="new-password" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <Button type="submit" className="w-full" disabled={isSubmitting}>
                  {isSubmitting ? 'Mise à jour…' : 'Définir le nouveau mot de passe'}
                </Button>
              </form>
            </Form>
          </>
        )}
      </CardContent>
      <CardFooter className="justify-center gap-1 text-sm text-muted-foreground">
        {lienInvalide && !done ? (
          <Link href="/forgot-password" className="underline underline-offset-4">
            Redemander un lien
          </Link>
        ) : (
          <Link href="/login" className="underline underline-offset-4">
            Aller à la connexion
          </Link>
        )}
      </CardFooter>
    </Card>
  );
}
