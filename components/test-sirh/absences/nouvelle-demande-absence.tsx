'use client';

import { PlusIcon } from 'lucide-react';
import { useState } from 'react';

import { Button } from '@/components/ui/button';

import { DemandeAbsenceDialog, type DemandeAbsenceDialogProps } from './demande-absence-dialog';

type Props = Omit<DemandeAbsenceDialogProps, 'open' | 'onOpenChange'> & {
  libelle?: string;
  variante?: 'default' | 'outline';
  taille?: 'sm' | 'default';
};

/**
 * Bouton « Nouvelle demande » + dialogue de demande d'absence (bandeau de la
 * liste des absences, Mon espace, dossier collaborateur).
 */
export function NouvelleDemandeAbsence({
  libelle = 'Nouvelle demande',
  variante = 'default',
  taille = 'sm',
  ...props
}: Props) {
  const [ouvert, setOuvert] = useState(false);
  return (
    <>
      <Button size={taille} variant={variante} onClick={() => setOuvert(true)}>
        <PlusIcon className="mr-1 size-4" />
        {libelle}
      </Button>
      <DemandeAbsenceDialog open={ouvert} onOpenChange={setOuvert} {...props} />
    </>
  );
}
