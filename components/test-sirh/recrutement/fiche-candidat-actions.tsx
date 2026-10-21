'use client';

import { PencilIcon } from 'lucide-react';
import { useState } from 'react';

import { BoutonConfirmation } from '@/components/test-sirh/bouton-confirmation';
import { Button } from '@/components/ui/button';
import type { ActionResult } from '@/lib/common/action-result';
import type { CandidatInput } from '@/lib/validation/test-sirh/recrutement';

import { CandidatDialog, type ActionEnregistrerCandidat } from './candidat-dialog';

/** Actions de gestion de la fiche candidat : modification (modale) et suppression (purge). */
export function FicheCandidatActions({
  candidat,
  today,
  lienVivier,
  actions,
}: {
  candidat: CandidatInput;
  today: string;
  /** Redirection après suppression (vivier). */
  lienVivier: string;
  actions: {
    enregistrer: ActionEnregistrerCandidat;
    supprimer: (id: string) => Promise<ActionResult>;
  };
}) {
  const [ouvert, setOuvert] = useState(false);
  const id = candidat.id ?? '';

  return (
    <>
      <Button size="sm" variant="outline" onClick={() => setOuvert(true)}>
        <PencilIcon className="mr-1 size-3.5" /> Modifier
      </Button>
      <BoutonConfirmation
        libelle="Supprimer"
        question="Supprimer ce candidat et ses pièces ?"
        libelleConfirmer="Supprimer"
        messageSucces="Candidat supprimé"
        redirection={lienVivier}
        onConfirm={() => actions.supprimer(id)}
      />
      <CandidatDialog
        open={ouvert}
        onOpenChange={setOuvert}
        candidat={candidat}
        today={today}
        onSubmit={actions.enregistrer}
      />
    </>
  );
}
