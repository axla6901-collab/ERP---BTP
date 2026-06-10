import Link from 'next/link';

import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

export default async function MagicLinkSentPage({
  searchParams,
}: {
  searchParams: Promise<{ email?: string }>;
}) {
  const params = await searchParams;
  const email = params.email;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-2xl">Vérifie ta boîte mail</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <Alert>
          <AlertTitle>Un lien de connexion a été envoyé{email ? ` à ${email}` : ''}.</AlertTitle>
          <AlertDescription>
            Clique sur le lien dans l&apos;email pour te connecter. Le lien expire dans 5 minutes.
            En développement, l&apos;email arrive dans{' '}
            <Link
              href="http://localhost:8025"
              target="_blank"
              rel="noopener noreferrer"
              className="underline underline-offset-4"
            >
              Mailpit (localhost:8025)
            </Link>
            .
          </AlertDescription>
        </Alert>
        <p className="text-sm text-muted-foreground">
          Tu peux fermer cette fenêtre. Tu seras connecté automatiquement après avoir cliqué le
          lien.{' '}
          <Link href="/login" className="underline underline-offset-4">
            Retour à la connexion classique
          </Link>
          .
        </p>
      </CardContent>
    </Card>
  );
}
