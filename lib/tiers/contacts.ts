import { and, eq, isNull } from 'drizzle-orm';

import { fournisseurContacts, fournisseurs } from '@/db/schema/catalogue';
import { clients } from '@/db/schema/commercial';
import { sousTraitantContacts, sousTraitants } from '@/db/schema/tiers';
import { requireTenantContextWithMfa } from '@/lib/auth/tenant-guards';
import { withTenant } from '@/lib/db/with-tenant';

import { construireAnnuaireContacts, type ContactUnifie } from './contacts-annuaire';

export type { ContactUnifie, SourceContact } from './contacts-annuaire';
export { LIBELLE_SOURCE_CONTACT } from './contacts-annuaire';

/**
 * Charge l'annuaire consolidé des contacts du tenant courant (fournisseurs,
 * sous-traitants, clients). Lecture seule — accessible à tout utilisateur
 * authentifié (MFA). La logique de fusion/tri vit dans `./contacts-annuaire`.
 */
export async function listerTousLesContacts(): Promise<ContactUnifie[]> {
  const ctx = await requireTenantContextWithMfa();
  return withTenant(ctx.entreprise.id, async (tx) => {
    const contactsFournisseurs = await tx
      .select({
        id: fournisseurContacts.id,
        nom: fournisseurContacts.nom,
        prenom: fournisseurContacts.prenom,
        fonction: fournisseurContacts.fonction,
        email: fournisseurContacts.email,
        telephoneMobile: fournisseurContacts.telephoneMobile,
        telephoneFixe: fournisseurContacts.telephoneFixe,
        principal: fournisseurContacts.principal,
        actif: fournisseurContacts.actif,
        tiersId: fournisseurs.id,
        tiersNom: fournisseurs.nom,
      })
      .from(fournisseurContacts)
      .innerJoin(
        fournisseurs,
        and(eq(fournisseurs.id, fournisseurContacts.fournisseurId), isNull(fournisseurs.deletedAt)),
      )
      .where(isNull(fournisseurContacts.deletedAt));

    const contactsSousTraitants = await tx
      .select({
        id: sousTraitantContacts.id,
        nom: sousTraitantContacts.nom,
        prenom: sousTraitantContacts.prenom,
        fonction: sousTraitantContacts.fonction,
        email: sousTraitantContacts.email,
        telephoneMobile: sousTraitantContacts.telephoneMobile,
        telephoneFixe: sousTraitantContacts.telephoneFixe,
        principal: sousTraitantContacts.principal,
        actif: sousTraitantContacts.actif,
        tiersId: sousTraitants.id,
        tiersNom: sousTraitants.nom,
      })
      .from(sousTraitantContacts)
      .innerJoin(
        sousTraitants,
        and(
          eq(sousTraitants.id, sousTraitantContacts.sousTraitantId),
          isNull(sousTraitants.deletedAt),
        ),
      )
      .where(isNull(sousTraitantContacts.deletedAt));

    const clientsRows = await tx
      .select({
        id: clients.id,
        type: clients.type,
        raisonSociale: clients.raisonSociale,
        nom: clients.nom,
        prenom: clients.prenom,
        email: clients.email,
        telephone: clients.telephone,
        actif: clients.actif,
      })
      .from(clients)
      .where(isNull(clients.deletedAt));

    return construireAnnuaireContacts({
      contactsFournisseurs,
      contactsSousTraitants,
      clients: clientsRows,
    });
  });
}
