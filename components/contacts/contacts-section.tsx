'use client';

import { PencilIcon, StarIcon, Trash2Icon } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { toast } from 'sonner';

import { ContactDialog } from '@/components/contacts/contact-dialog';
import { Button } from '@/components/ui/button';
import type { ContactFiche, SourceContact } from '@/lib/contacts/types';
import { supprimerContact } from '@/lib/tiers/contacts-actions';
import { cn } from '@/lib/utils';

type Props = {
  source: SourceContact;
  tiersId: string;
  contacts: ContactFiche[];
  /** Contrainte de largeur pour s'aligner sur le formulaire de la fiche. */
  className?: string;
};

function nomComplet(c: ContactFiche): string {
  return [c.nom, c.prenom].filter(Boolean).join(' ').trim() || c.nom;
}

/**
 * Section « Contacts » d'une fiche tiers (fournisseur, sous-traitant, client) :
 * liste des contacts + frame de création / édition / suppression (enregistrement
 * immédiat). Remplace l'ancien bloc inline `ContactsFieldArray` du formulaire.
 */
export function ContactsSection({ source, tiersId, contacts, className }: Props) {
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

  return (
    <section className={cn('space-y-3', className)}>
      <div>
        <h3 className="text-sm font-medium text-muted-foreground">Contacts</h3>
        <p className="text-xs text-muted-foreground">
          Interlocuteurs chez le tiers. Un seul contact peut être marqué « principal ».
          Les contacts inactifs restent visibles pour traçabilité.
        </p>
      </div>

      {contacts.length === 0 ? (
        <div className="rounded-md border border-dashed p-6 text-center text-sm text-muted-foreground">
          Aucun contact. Utilisez «&nbsp;Créer un contact&nbsp;» en haut de la fiche.
        </div>
      ) : (
        <ul className="space-y-2">
          {contacts.map((c) => {
            const inactif = !c.actif;
            const coordonnees = [c.email, c.telephoneMobile ?? c.telephoneFixe]
              .filter(Boolean)
              .join(' · ');
            return (
              <li
                key={c.id}
                className={cn(
                  'flex items-start justify-between gap-3 rounded-md border p-3',
                  inactif ? 'bg-muted/40 opacity-70' : 'bg-card',
                )}
              >
                <div className="min-w-0 space-y-0.5">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-medium">{nomComplet(c)}</span>
                    {c.principal && c.actif && (
                      <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-medium text-amber-800">
                        <StarIcon className="size-3" />
                        Principal
                      </span>
                    )}
                    {inactif && (
                      <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
                        Inactif
                      </span>
                    )}
                  </div>
                  {c.fonction && <p className="text-xs text-muted-foreground">{c.fonction}</p>}
                  <p className="text-xs text-muted-foreground">{coordonnees || '—'}</p>
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => ouvrirEdition(c)}
                    aria-label={`Modifier ${nomComplet(c)}`}
                  >
                    <PencilIcon className="size-4" />
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => void supprimer(c)}
                    disabled={suppressionId === c.id}
                    aria-label={`Supprimer ${nomComplet(c)}`}
                  >
                    <Trash2Icon className="size-4 text-destructive" />
                  </Button>
                </div>
              </li>
            );
          })}
        </ul>
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
