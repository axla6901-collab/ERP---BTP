'use client';

import { useRouter } from 'next/navigation';
import { useState, type ReactNode } from 'react';
import { toast } from 'sonner';

import { ContactDialog } from '@/components/contacts/contact-dialog';
import type { ContactFiche, SourceContact } from '@/lib/contacts/types';
import { supprimerContact } from '@/lib/tiers/contacts-actions';
import { cn } from '@/lib/utils';

type Props = {
  source: SourceContact;
  tiersId: string;
  contacts: ContactFiche[];
  /** Contrainte de largeur pour s'aligner sur le formulaire de la fiche. */
  className?: string;
  /**
   * En-tête de zone (gabarit « Contacts du sous-traitant ») : titre + sous-titre
   * à gauche, action (ex. « + Ajouter un contact ») à droite. Fourni → le composant
   * rend cet en-tête accentué et un tableau bord-à-bord. Absent → en-tête neutre
   * par défaut (fiches fournisseur/client non encore refondues).
   */
  entete?: { titre: ReactNode; description: ReactNode };
  /** Action affichée à droite de l'en-tête de zone (ex. bouton de création). */
  action?: ReactNode;
};

function nomComplet(c: ContactFiche): string {
  return [c.nom, c.prenom].filter(Boolean).join(' ').trim() || c.nom;
}

/**
 * Section « Contacts » d'une fiche tiers (fournisseur, sous-traitant, client) :
 * liste des contacts + frame de création / édition / suppression (enregistrement
 * immédiat). Remplace l'ancien bloc inline `ContactsFieldArray` du formulaire.
 */
export function ContactsSection({ source, tiersId, contacts, className, entete, action }: Props) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [contactEdite, setContactEdite] = useState<ContactFiche | null>(null);
  const [suppressionId, setSuppressionId] = useState<string | null>(null);

  function ouvrirEdition(c: ContactFiche) {
    setContactEdite(c);
    setOpen(true);
  }

  async function supprimer(c: ContactFiche) {
    if (!window.confirm(`Supprimer le contact « ${nomComplet(c)} » ?`)) return;
    setSuppressionId(c.id);
    const result = await supprimerContact(source, c.id);
    setSuppressionId(null);
    if (!result.ok) {
      toast.error(result.error ?? 'Suppression impossible.');
      return;
    }
    toast.success('Contact supprimé');
    router.refresh();
  }

  const th = 'px-4 py-2.5 font-medium sm:px-5';
  const td = 'px-4 py-3 sm:px-5';

  return (
    <section className={cn(entete ? undefined : 'space-y-3', className)}>
      {entete ? (
        <div className="flex flex-wrap items-end justify-between gap-2 px-4 py-3 sm:px-5">
          <div>
            <h3 className="font-heading font-semibold text-orange-700">{entete.titre}</h3>
            <p className="text-xs text-muted-foreground">{entete.description}</p>
          </div>
          {action}
        </div>
      ) : (
        <div>
          <h3 className="text-sm font-medium text-muted-foreground">Contacts</h3>
          <p className="text-xs text-muted-foreground">
            Interlocuteurs chez le tiers. Un seul contact peut être marqué « principal ». Les
            contacts inactifs restent visibles pour traçabilité.
          </p>
        </div>
      )}

      {contacts.length === 0 ? (
        <div
          className={cn(
            'text-center text-sm text-muted-foreground',
            entete ? 'border-t px-4 py-6 sm:px-5' : 'rounded-md border border-dashed p-6',
          )}
        >
          Aucun contact. Utilisez «&nbsp;Créer un contact&nbsp;» en haut de la fiche.
        </div>
      ) : (
        <div className={entete ? undefined : 'overflow-hidden rounded-md border'}>
          <table className={cn('w-full text-sm', entete && 'border-t')}>
            <thead className="bg-muted/40 text-left text-xs uppercase tracking-widest text-muted-foreground">
              <tr>
                <th className={th}>Nom</th>
                <th className={th}>Fonction</th>
                <th className={th}>Email</th>
                <th className={th}>Téléphone</th>
                <th className={th}>Principal</th>
                <th className={th}>Actif</th>
                <th className={cn(th, 'text-right')}>Action</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {contacts.map((c) => {
                const inactif = !c.actif;
                const telephone = c.telephoneMobile ?? c.telephoneFixe;
                return (
                  <tr
                    key={c.id}
                    className={cn('hover:bg-muted/40', inactif && 'text-muted-foreground')}
                  >
                    <td className={cn(td, 'font-medium')}>{nomComplet(c)}</td>
                    <td className={cn(td, 'text-muted-foreground')}>{c.fonction ?? '—'}</td>
                    <td className={cn(td, 'text-muted-foreground')}>{c.email ?? '—'}</td>
                    <td className={cn(td, 'tabular-nums text-muted-foreground')}>
                      {telephone ?? '—'}
                    </td>
                    <td className={td}>
                      {c.principal && c.actif ? (
                        <span
                          className="inline-block size-2 rounded-full bg-amber-500"
                          title="Contact principal"
                          aria-label="Contact principal"
                        />
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </td>
                    <td className={td}>
                      {c.actif ? (
                        <span className="rounded bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-800">
                          Actif
                        </span>
                      ) : (
                        <span className="rounded bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">
                          Inactif
                        </span>
                      )}
                    </td>
                    <td className={cn(td, 'whitespace-nowrap text-right')}>
                      <button
                        type="button"
                        className="text-sm text-orange-700 hover:underline"
                        onClick={() => ouvrirEdition(c)}
                        aria-label={`Modifier ${nomComplet(c)}`}
                      >
                        Modifier
                      </button>
                      <button
                        type="button"
                        className="ml-3 text-sm text-destructive hover:underline disabled:opacity-50"
                        onClick={() => void supprimer(c)}
                        disabled={suppressionId === c.id}
                        aria-label={`Supprimer ${nomComplet(c)}`}
                      >
                        Supprimer
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <ContactDialog
        source={source}
        tiersId={tiersId}
        contact={contactEdite}
        open={open}
        onOpenChange={setOpen}
      />
    </section>
  );
}
