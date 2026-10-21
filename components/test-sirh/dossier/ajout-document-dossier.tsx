'use client';

import { PlusIcon } from 'lucide-react';
import { useState } from 'react';

import {
  DocumentTeleversementDialog,
  type OptionDossierGed,
} from '@/components/test-sirh/documents/document-televersement-dialog';
import type { ActionsTeleversement } from '@/components/test-sirh/televersement-document';
import { Button } from '@/components/ui/button';

/**
 * Bouton « Ajouter un document » du dossier collaborateur : ouvre le dialogue de
 * téléversement de la GED, pré-ciblé sur le salarié (le dialogue rafraîchit la
 * page une fois le document créé).
 */
export function AjoutDocumentDossier({
  employe,
  dossiers,
  actions,
}: {
  employe: { id: string; label: string };
  dossiers: readonly OptionDossierGed[];
  actions: ActionsTeleversement;
}) {
  const [ouvert, setOuvert] = useState(false);
  return (
    <>
      <Button type="button" size="sm" variant="outline" onClick={() => setOuvert(true)}>
        <PlusIcon className="mr-1 size-4" /> Ajouter un document
      </Button>
      <DocumentTeleversementDialog
        open={ouvert}
        onOpenChange={setOuvert}
        employes={[employe]}
        dossiers={dossiers}
        initiales={{ cibleType: 'employe', employeId: employe.id }}
        actions={actions}
      />
    </>
  );
}
