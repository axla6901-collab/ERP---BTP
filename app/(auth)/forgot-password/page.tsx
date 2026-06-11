'use client';

import Link from 'next/link';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';

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
import { typedZodResolver } from '@/lib/forms/zod-resolver';

const schema = z.object({
  email: z.email('Adresse email invalide'),
});

type ForgotForm = z.infer<typeof schema>;

export default function ForgotPasswordPage() {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [envoye, setEnvoye] = useState(false);

  const form = useForm<ForgotForm>({
    resolver: typedZodResolver(schema),
    defaultValues: { email: '' },
  });

  async function onSubmit(values: ForgotForm) {
    setIsSubmitting(true);
    // Anti-énumération : on ne révèle jamais si l'adresse existe. better-auth
    // n'envoie le mail que si le compte existe, mais l'UI affiche toujours le
    // même message de succès (et on ignore le détail de l'erreur côté client).
    await authClient.requestPasswordReset({
      email: values.email,
      redirectTo: '/reset-password',
    });
    setIsSubmitting(false);
    setEnvoye(true);
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-2xl">Mot de passe oublié</CardTitle>
        <CardDescription>
          Saisis ton adresse : si un compte existe, tu recevras un lien de réinitialisation.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {envoye ? (
          <Alert>
            <AlertTitle>Email envoyé</AlertTitle>
            <AlertDescription>
              Si un compte est associé à cette adresse, un lien de réinitialisation vient d’être
              envoyé (valable 1 heure). Pense à vérifier les indésirables.
            </AlertDescription>
          </Alert>
        ) : (
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
              <Button type="submit" className="w-full" disabled={isSubmitting}>
                {isSubmitting ? 'Envoi…' : 'Recevoir un lien de réinitialisation'}
              </Button>
            </form>
          </Form>
        )}
      </CardContent>
      <CardFooter className="justify-center text-sm text-muted-foreground">
        <Link href="/login" className="underline underline-offset-4">
          Retour à la connexion
        </Link>
      </CardFooter>
    </Card>
  );
}
