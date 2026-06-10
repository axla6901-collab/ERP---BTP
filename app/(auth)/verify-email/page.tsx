import Link from 'next/link';

import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

export default async function VerifyEmailPage({
  searchParams,
}: {
  searchParams: Promise<{ email?: string }>;
}) {
  const params = await searchParams;
  const email = params.email;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-2xl">Vérifie tes emails</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <Alert>
          <AlertTitle>Un email a été envoyé{email ? ` à ${email}` : ''}.</AlertTitle>
          <AlertDescription>
            Clique sur le lien de vérification pour activer ton compte. En développement, ouvre
            <Link
              href="http://localhost:8025"
              target="_blank"
              rel="noopener noreferrer"
              className="ml-1 underline underline-offset-4"
            >
              Mailpit (localhost:8025)
            </Link>
            .
          </AlertDescription>
        </Alert>
        <p className="text-sm text-muted-foreground">
          Une fois vérifié, tu pourras&nbsp;
          <Link href="/login" className="underline underline-offset-4">
            te connecter
          </Link>
          .
        </p>
      </CardContent>
    </Card>
  );
}
