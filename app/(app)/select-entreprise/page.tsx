import { Building2Icon } from 'lucide-react';
import { redirect } from 'next/navigation';

import { requireAuth } from '@/lib/auth/guards';
import { listEntreprisesUtilisateur } from '@/lib/auth/tenant-guards';

import { SelectEntrepriseCard } from './select-entreprise-card';

/**
 * Page d'atterrissage post-login quand l'utilisateur n'a pas (ou plus) de
 * cookie `active_entreprise_slug` valide. Liste les entreprises auxquelles il
 * appartient ; cliquer set le cookie et redirige vers le dashboard.
 *
 * Cas particuliers :
 *  - Une seule entreprise : redirection automatique vers `/{slug}/dashboard`
 *    (l'utilisateur n'a rien à choisir).
 *  - Aucune entreprise : message d'erreur (l'admin doit le rattacher).
 */
export default async function SelectEntreprisePage() {
  await requireAuth();
  const entreprises = await listEntreprisesUtilisateur();

  if (entreprises.length === 0) {
    return (
      <div className="mx-auto max-w-md p-8">
        <h1 className="text-xl font-semibold mb-4">Aucune entreprise accessible</h1>
        <p className="text-sm text-muted-foreground">
          Votre compte n&apos;est rattaché à aucune entreprise. Contactez votre administrateur pour
          obtenir un accès.
        </p>
      </div>
    );
  }

  const seule = entreprises[0];
  if (entreprises.length === 1 && seule) {
    // Délègue à la route handler : un Server Component ne peut pas écrire de cookies.
    redirect(`/api/entreprise/auto-select?slug=${encodeURIComponent(seule.slug)}`);
  }

  return (
    <div className="mx-auto max-w-2xl p-8">
      <div className="flex items-center gap-3 mb-6">
        <Building2Icon className="size-6 text-primary" />
        <h1 className="text-2xl font-semibold">Choisir une entreprise</h1>
      </div>
      <p className="text-sm text-muted-foreground mb-6">
        Vous êtes rattaché à plusieurs entreprises. Sélectionnez celle sur laquelle vous souhaitez
        travailler. Vous pourrez en changer à tout moment via le sélecteur en haut de la barre
        latérale.
      </p>
      <div className="grid gap-3">
        {entreprises.map((e) => (
          <SelectEntrepriseCard
            key={e.id}
            slug={e.slug}
            raisonSociale={e.raisonSociale}
            isDefault={e.isDefault}
          />
        ))}
      </div>
    </div>
  );
}
