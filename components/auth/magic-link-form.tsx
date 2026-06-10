'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';

import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
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
});

type MagicLinkForm = z.infer<typeof schema>;

export function MagicLinkForm({ redirectTo }: { redirectTo: string }) {
  const router = useRouter();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);

  const form = useForm({
    resolver: zodResolver(schema),
    defaultValues: { email: '' },
  });

  async function onSubmit(values: MagicLinkForm) {
    setErreur(null);
    setIsSubmitting(true);
    const { error } = await authClient.signIn.magicLink({
      email: values.email,
      callbackURL: redirectTo,
    });
    setIsSubmitting(false);
    if (error) {
      setErreur(error.message ?? 'Envoi impossible.');
      return;
    }
    router.push(`/magic-link-sent?email=${encodeURIComponent(values.email)}`);
  }

  return (
    <div className="grid gap-4">
      {erreur && (
        <Alert variant="destructive">
          <AlertTitle>Envoi impossible</AlertTitle>
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
                  <Input type="email" autoComplete="email" placeholder="vous@exemple.fr" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <Button type="submit" className="w-full" disabled={isSubmitting}>
            {isSubmitting ? 'Envoi…' : 'Recevoir un lien de connexion'}
          </Button>
        </form>
      </Form>
    </div>
  );
}
