'use client';

import { PencilIcon } from 'lucide-react';
import { useState } from 'react';

import { BoutonConfirmation } from '@/components/test-sirh/bouton-confirmation';
import { Button } from '@/components/ui/button';
import type { ActionResult } from '@/lib/common/action-result';
import type { SessionInput } from '@/lib/validation/test-sirh/formation';

import { SessionDialog, type FormationOptionUI } from './session-dialog';

type Props = {
  /** Valeurs de la session (toutes les clés). */
  session: SessionInput;
  formations: FormationOptionUI[];
  /** Clôture proposée (session ni annulée ni déjà réalisée). */
  peutCloturer: boolean;
  /** Liste des sessions (redirection après suppression). */
  retour: string;
  actions: {
    enregistrer: (input: SessionInput) => Promise<ActionResult<{ id: string }>>;
    cloturer: () => Promise<ActionResult<{ misesAJour: number }>>;
    supprimer: () => Promise<ActionResult>;
  };
};

/** Actions de la fiche session (bandeau) : modifier, clôturer, supprimer. */
export function SessionActions({ session, formations, peutCloturer, retour, actions }: Props) {
  const [ouvert, setOuvert] = useState(false);
  return (
    <>
      <Button variant="outline" size="sm" onClick={() => setOuvert(true)}>
        <PencilIcon className="mr-1 size-3.5" /> Modifier
      </Button>
      {peutCloturer && (
        <BoutonConfirmation
          libelle="Clôturer la session"
          question="Inscrits présents et réussis par défaut ?"
          libelleConfirmer="Clôturer"
          messageSucces="Session clôturée"
          variante="default"
          onConfirm={actions.cloturer}
        />
      )}
      <BoutonConfirmation
        libelle="Supprimer"
        question="Supprimer cette session ?"
        libelleConfirmer="Supprimer"
        messageSucces="Session supprimée"
        redirection={retour}
        onConfirm={actions.supprimer}
      />
      <SessionDialog
        open={ouvert}
        onOpenChange={setOuvert}
        session={session}
        formations={formations}
        onSubmit={actions.enregistrer}
      />
    </>
  );
}
