/**
 * Numérotation légale des factures — règles pures, partagées par les server
 * actions (`lib/facturation/factures.ts`) et l'affichage.
 *
 * Le numéro est attribué à l'ÉMISSION (brouillon → émise), jamais à la création
 * du brouillon : un brouillon supprimé ou annulé ne laisse donc aucun trou dans
 * la séquence, qui doit rester continue et chronologique (CGI art. 242 nonies A).
 */

/** Libellé affichable d'une facture : son numéro, ou « Brouillon » tant qu'elle n'est pas émise. */
export function libelleNumeroFacture(numero: string | null | undefined): string {
  return numero ?? 'Brouillon';
}

/** 'AAAA-MM-JJ' → 'JJ/MM/AAAA' (dates de facture stockées au format ISO). */
function dateFr(iso: string): string {
  const [annee, mois, jour] = iso.split('-');
  return `${jour}/${mois}/${annee}`;
}

/**
 * Chronologie de la numérotation : une facture ne peut pas être émise avec une
 * date antérieure à celle de la dernière facture déjà émise, sinon l'ordre des
 * numéros contredirait celui des dates. Renvoie le motif du refus, ou `null`
 * si l'émission est possible (dates ISO 'AAAA-MM-JJ', comparables comme chaînes).
 */
export function verifierChronologieEmission(
  dateFacture: string,
  derniereDateEmise: string | null,
): string | null {
  if (!derniereDateEmise || dateFacture >= derniereDateEmise) return null;
  return (
    `Émission impossible : la facture est datée du ${dateFr(dateFacture)}, avant la dernière ` +
    `facture émise (${dateFr(derniereDateEmise)}). La numérotation doit rester chronologique : ` +
    `modifiez la date de la facture avant de l'émettre.`
  );
}
