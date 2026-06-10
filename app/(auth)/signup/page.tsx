import { redirect } from 'next/navigation';

/**
 * L'auto-inscription publique est désactivée (audit sécurité — provisioning
 * maîtrisé). L'endpoint Better-Auth `/sign-up/email` est fermé
 * (`emailAndPassword.disableSignUp`, cf. lib/auth/server.ts). On redirige donc
 * toute visite de `/signup` vers la connexion plutôt que d'afficher un
 * formulaire qui échouerait côté serveur.
 *
 * Les comptes sont créés par l'administrateur de la plateforme (console
 * super-admin lors de la création d'entreprise) ; la première connexion se
 * fait par lien magique.
 */
export default function SignupPage() {
  redirect('/login');
}
