import { PageToolbar } from '@/components/layout/page-toolbar';
import { ContactCreateDialog } from '@/components/tiers/contact-create-dialog';
import { ContactsTable } from '@/components/tiers/contacts-table';
import { requireAuthWithMfa } from '@/lib/auth/guards';
import { listerTousLesContacts } from '@/lib/tiers/contacts';
import { changerStatutContact, creerContact } from '@/lib/tiers/contacts-actions';
import { listerFournisseurs } from '@/lib/tiers/fournisseurs';
import { peutEcrireTiers } from '@/lib/tiers/permissions';
import { listerSousTraitants } from '@/lib/tiers/sous-traitants';

export default async function ContactsPage() {
  const utilisateur = await requireAuthWithMfa();
  const peutEcrire = peutEcrireTiers(utilisateur.role);

  // Les listes de tiers ne servent qu'au bouton de création (édition) : on évite
  // les requêtes inutiles pour un lecteur seul.
  const [contacts, fournisseurs, sousTraitants] = await Promise.all([
    listerTousLesContacts(),
    peutEcrire ? listerFournisseurs() : Promise.resolve([]),
    peutEcrire ? listerSousTraitants() : Promise.resolve([]),
  ]);

  return (
    <div className="space-y-6">
      <PageToolbar
        title="Contacts"
        subtitle="Annuaire consolidé (fournisseurs, sous-traitants, clients)"
        actions={
          peutEcrire ? (
            <ContactCreateDialog
              fournisseurs={fournisseurs.map((f) => ({ id: f.id, nom: f.nom }))}
              sousTraitants={sousTraitants.map((s) => ({ id: s.id, nom: s.nom }))}
              onCreer={async (input) => {
                'use server';
                return creerContact(input);
              }}
            />
          ) : null
        }
      />
      <ContactsTable
        items={contacts}
        onChangerStatut={
          peutEcrire
            ? async (source, contactId, actif) => {
                'use server';
                return changerStatutContact(source, contactId, actif);
              }
            : undefined
        }
      />
    </div>
  );
}
