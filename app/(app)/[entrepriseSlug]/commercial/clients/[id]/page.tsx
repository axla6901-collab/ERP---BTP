import { notFound } from 'next/navigation';

import { DeleteButton } from '@/components/catalogue/delete-button';
import { ContactCreateButton } from '@/components/contacts/contact-create-button';
import { ContactsSection } from '@/components/contacts/contacts-section';
import { ClientForm } from '@/components/commercial/client-form';
import { requireAuthWithMfa } from '@/lib/auth/guards';
import {
  lireClient,
  listerClientContacts,
  mettreAJourClient,
  supprimerClient,
} from '@/lib/commercial/clients';
import { peutEcrireCommercial } from '@/lib/commercial/permissions';
import type { ClientInput } from '@/lib/validation/commercial';

export default async function ClientDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const utilisateur = await requireAuthWithMfa();
  const client = await lireClient(id);
  if (!client) notFound();

  const peutEcrire = peutEcrireCommercial(utilisateur.role);
  if (!peutEcrire) {
    return (
      <div className="space-y-2 max-w-2xl">
        <h2 className="text-xl font-medium">
          {client.type === 'professionnel' ? client.raisonSociale : `${client.prenom ?? ''} ${client.nom ?? ''}`.trim()}
        </h2>
        <p className="text-sm text-muted-foreground">
          {client.adresseLigne1}, {client.codePostal} {client.ville}
        </p>
      </div>
    );
  }

  const defaultValues: Partial<ClientInput> = {
    type: client.type,
    code: client.code,
    raisonSociale: client.raisonSociale,
    nom: client.nom,
    prenom: client.prenom,
    siret: client.siret,
    tvaIntra: client.tvaIntra,
    email: client.email,
    telephone: client.telephone,
    adresseLigne1: client.adresseLigne1,
    adresseLigne2: client.adresseLigne2,
    codePostal: client.codePostal,
    ville: client.ville,
    pays: client.pays,
    notes: client.notes,
    actif: client.actif,
  } as Partial<ClientInput>;

  const contacts = await listerClientContacts(id);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-xl font-medium">Modifier le client</h2>
        <ContactCreateButton source="client" tiersId={id} />
      </div>
      <ClientForm
        defaultValues={defaultValues}
        onSubmit={async (values) => {
          'use server';
          return mettreAJourClient(id, values);
        }}
        successRedirect="/commercial/clients"
      />

      <ContactsSection
        source="client"
        tiersId={id}
        contacts={contacts.map((c) => ({
          id: c.id,
          nom: c.nom,
          prenom: c.prenom,
          fonction: c.fonction,
          email: c.email,
          telephoneMobile: c.telephoneMobile,
          telephoneFixe: c.telephoneFixe,
          notes: c.notes,
          principal: c.principal,
          actif: c.actif,
        }))}
        className="max-w-3xl"
      />

      <div className="border-t pt-6 max-w-2xl">
        <h3 className="mb-2 text-sm font-medium text-destructive">Zone dangereuse</h3>
        <DeleteButton
          label="Supprimer ce client"
          confirmText="Le client sera marqué supprimé. Refusé s'il est rattaché à des devis, factures ou chantiers."
          redirectTo="/commercial/clients"
          action={async () => {
            'use server';
            return supprimerClient(id);
          }}
        />
      </div>
    </div>
  );
}
