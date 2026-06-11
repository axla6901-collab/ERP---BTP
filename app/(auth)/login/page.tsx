'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';

import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { MagicLinkForm } from '@/components/auth/magic-link-form';
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

const schema = z.object({
  email: z.email('Adresse email invalide'),
  password: z.string().min(1, 'Mot de passe requis'),
});

type LoginForm = z.infer<typeof schema>;

function libelleErreur(code: string | undefined, fallback: string): string {
  switch (code) {
    case 'INVALID_EMAIL_OR_PASSWORD':
      return 'Email ou mot de passe incorrect.';
    case 'EMAIL_NOT_VERIFIED':
      return 'Adresse non vérifiée. Clique sur le lien envoyé par email (Mailpit en dev).';
    case 'USER_NOT_FOUND':
      return 'Aucun compte ne correspond à cet email.';
    default:
      return fallback || 'Connexion impossible.';
  }
}

export default function LoginPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const redirectTo = searchParams.get('redirect_to') ?? '/dashboard';
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  const [mode, setMode] = useState<'password' | 'magic'>('password');

  const form = useForm({
    resolver: zodResolver(schema),
    defaultValues: { email: '', password: '' },
  });

  async function onSubmit(values: LoginForm) {
    setErreur(null);
    setIsSubmitting(true);
    try {
      const { data, error } = await authClient.signIn.email({
        email: values.email,
        password: values.password,
      });
      setIsSubmitting(false);

      if (error) {
        // eslint-disable-next-line no-console
        console.error('[login] sign-in error', error);
        setErreur(libelleErreur(error.code, error.message ?? ''));
        return;
      }
      if (!data) {
        setErreur('Réponse vide du serveur. Vérifie que le serveur dev tourne sur le port 3000.');
        return;
      }
      // Better Auth renvoie twoFactorRedirect=true quand le user a MFA activé
      // et que la première étape (mot de passe) est validée. La session complète
      // ne sera posée qu'après vérification du code TOTP.
      if ((data as { twoFactorRedirect?: boolean }).twoFactorRedirect) {
        router.push(`/two-factor?redirect_to=${encodeURIComponent(redirectTo)}`);
        return;
      }
      router.push(redirectTo);
      router.refresh();
    } catch (caught) {
      setIsSubmitting(false);
      // eslint-disable-next-line no-console
      console.error('[login] exception during sign-in', caught);
      setErreur(
        caught instanceof Error
          ? `Erreur technique : ${caught.message}`
          : 'Erreur technique inconnue.',
      );
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-2xl">Se connecter</CardTitle>
        <CardDescription>Accède à ton espace ERP BTP.</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="mb-4 flex gap-2 text-sm">
          <button
            type="button"
            onClick={() => setMode('password')}
            className={`flex-1 rounded border px-3 py-1.5 ${
              mode === 'password' ? 'border-foreground' : 'border-transparent text-muted-foreground'
            }`}
          >
            Mot de passe
          </button>
          <button
            type="button"
            onClick={() => setMode('magic')}
            className={`flex-1 rounded border px-3 py-1.5 ${
              mode === 'magic' ? 'border-foreground' : 'border-transparent text-muted-foreground'
            }`}
          >
            Lien magique
          </button>
        </div>

        {mode === 'magic' ? (
          <MagicLinkForm redirectTo={redirectTo} />
        ) : (
          <>
            {erreur && (
              <Alert variant="destructive" className="mb-4">
                <AlertTitle>Connexion impossible</AlertTitle>
                <AlertDescription>{erreur}</AlertDescription>
              </Alert>
            )}
            <Form {...form}>
              <form method="post" onSubmit={form.handleSubmit(onSubmit)} className="grid gap-4">
                <FormField
                  control={form.control}
                  name="email"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Email</FormLabel>
                      <FormControl>
                        <Input
                          type="email"
                          autoComplete="email"
                          placeholder="vous@exemple.fr"
                          {...field}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="password"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Mot de passe</FormLabel>
                      <FormControl>
                        <Input type="password" autoComplete="current-password" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <Button type="submit" className="w-full" disabled={isSubmitting}>
                  {isSubmitting ? 'Connexion…' : 'Se connecter'}
                </Button>
                <Link
                  href="/forgot-password"
                  className="text-center text-sm text-muted-foreground underline underline-offset-4"
                >
                  Mot de passe oublié ?
                </Link>
              </form>
            </Form>
          </>
        )}
      </CardContent>
      <CardFooter className="justify-center text-center text-sm text-muted-foreground">
        Pas encore de compte ? Les accès sont créés par l’administrateur de votre plateforme.
      </CardFooter>
    </Card>
  );
}
