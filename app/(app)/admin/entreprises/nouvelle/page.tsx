import { ArrowLeftIcon } from 'lucide-react';
import Link from 'next/link';

import { NouvelleEntrepriseForm } from './form';

export default function NouvelleEntreprisePage() {
  return (
    <div className="max-w-2xl">
      <div className="mb-6">
        <Link
          href="/admin/entreprises"
          className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeftIcon className="size-4" />
          Retour à la liste
        </Link>
      </div>
      <h1 className="mb-2 text-2xl font-semibold">Nouvelle entreprise</h1>
      <p className="mb-6 text-sm text-muted-foreground">
        Crée une nouvelle entreprise dans le système et désigne son administrateur initial. Un
        magic-link de connexion lui sera envoyé par email (sauf erreur SMTP).
      </p>
      <NouvelleEntrepriseForm />
    </div>
  );
}
