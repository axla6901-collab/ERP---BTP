/**
 * Politique d'envoi des liens magiques (connexion sans mot de passe).
 *
 * Un lien magique ouvre une session **complète** à partir de la seule
 * possession de la boîte mail — c'est donc un facteur unique. On ne l'envoie
 * que lorsque les deux conditions de sécurité sont réunies :
 *
 *  1. **Le compte existe déjà.** On n'autorise pas l'auto-inscription par lien
 *     magique : sinon n'importe quel email déclencherait la création d'un
 *     compte (cf. provisioning maîtrisé côté administration).
 *
 *  2. **Le compte n'a PAS la MFA activée.** Si l'utilisateur a configuré un
 *     second facteur (TOTP), le laisser se connecter par lien magique
 *     contournerait ce facteur — `requireAuthWithMfa` ne vérifie que la
 *     *configuration* de la MFA, pas qu'elle a été *exercée* dans la session.
 *     Les comptes MFA doivent donc passer par mot de passe + TOTP.
 *
 * Anti-énumération : l'appelant ne révèle jamais le résultat à l'utilisateur
 * (l'UI affiche toujours « lien envoyé »).
 */
export type MagicLinkAccount = { twoFactorEnabled: boolean } | null | undefined;

export function peutEnvoyerLienMagique(compte: MagicLinkAccount): boolean {
  if (!compte) return false;
  return !compte.twoFactorEnabled;
}
