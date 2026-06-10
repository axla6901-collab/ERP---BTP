'use client';

import { UserPlusIcon } from 'lucide-react';
import { useState } from 'react';

import { ContactDialog } from '@/components/contacts/contact-dialog';
import { Button } from '@/components/ui/button';
import type { SourceContact } from '@/lib/contacts/types';

type Props = {
  source: SourceContact;
  tiersId: string;
};

/**
 * Bouton « Créer un contact » autonome (bouton + frame de création), destiné à
 * la barre d'actions en haut de la fiche d'un tiers. Encapsule son propre état
 * d'ouverture : il peut donc être passé en slot à un formulaire (Server → Client)
 * sans partager d'état avec le reste de la page.
 */
export function ContactCreateButton({ source, tiersId }: Props) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="gap-1.5"
        onClick={() => setOpen(true)}
      >
        <UserPlusIcon className="size-4" aria-hidden="true" />
        Créer un contact
      </Button>
      <ContactDialog source={source} tiersId={tiersId} open={open} onOpenChange={setOpen} />
    </>
  );
}
