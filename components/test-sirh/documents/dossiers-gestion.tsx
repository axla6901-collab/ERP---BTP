'use client';

import { PencilIcon, PlusIcon } from 'lucide-react';
import { useMemo, useState } from 'react';

import { BoutonConfirmation } from '@/components/test-sirh/bouton-confirmation';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import type { ActionResult } from '@/lib/common/action-result';
import type { DossierDocumentsInput } from '@/lib/validation/test-sirh/documents';

import { DossierDialog } from './dossier-dialog';

export type DossierGed = {
  id: string;
  nom: string;
  description: string | null;
  visibleSalarie: boolean;
  ordre: number;
  nbDocuments: number;
};

export type ActionsDossiers = {
  enregistrer: (input: DossierDocumentsInput) => Promise<ActionResult<{ id: string }>>;
  supprimer: (id: string) => Promise<ActionResult>;
};

/** Bouton « + Nouveau » du rail des dossiers (gestion RH). */
export function NouveauDossierBouton({
  onEnregistrer,
  ordreSuivant,
}: {
  onEnregistrer: ActionsDossiers['enregistrer'];
  /** Ordre proposé (après le dernier dossier). */
  ordreSuivant: number;
}) {
  const [ouvert, setOuvert] = useState(false);
  // Objet stable : la modale se réinitialise quand son `dossier` change.
  const nouveau = useMemo(() => ({ ordre: ordreSuivant }), [ordreSuivant]);
  return (
    <>
      <Button
        type="button"
        variant="ghost"
        size="xs"
        onClick={() => setOuvert(true)}
        aria-label="Nouveau dossier"
      >
        <PlusIcon className="size-3" /> Nouveau
      </Button>
      <DossierDialog
        open={ouvert}
        onOpenChange={setOuvert}
        dossier={nouveau}
        onSubmit={onEnregistrer}
      />
    </>
  );
}

/**
 * En-tête du dossier sélectionné dans le rail : description, visibilité,
 * nombre de documents, et (gestion RH) modification / suppression — refusée
 * par le serveur tant que le dossier contient des documents.
 */
export function DossierCourantBandeau({
  dossier,
  peutGerer,
  actions,
  urlApresSuppression,
}: {
  dossier: DossierGed;
  peutGerer: boolean;
  actions: ActionsDossiers;
  urlApresSuppression: string;
}) {
  const [ouvert, setOuvert] = useState(false);
  return (
    <div className="flex flex-wrap items-start justify-between gap-3 rounded-xl border bg-card px-5 py-3">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <h3 className="font-semibold text-orange-700">{dossier.nom}</h3>
          {dossier.visibleSalarie ? (
            <Badge tone="emerald" shape="pill">
              Visible salarié
            </Badge>
          ) : (
            <Badge tone="neutral" shape="pill">
              RH uniquement
            </Badge>
          )}
          <span className="text-xs text-muted-foreground">
            {dossier.nbDocuments} document{dossier.nbDocuments > 1 ? 's' : ''}
          </span>
        </div>
        {dossier.description && (
          <p className="text-xs text-muted-foreground">{dossier.description}</p>
        )}
      </div>
      {peutGerer && (
        <div className="flex flex-wrap items-center gap-2">
          <Button type="button" variant="outline" size="sm" onClick={() => setOuvert(true)}>
            <PencilIcon className="size-3.5" /> Modifier
          </Button>
          <BoutonConfirmation
            libelle="Supprimer"
            question="Supprimer ce dossier ?"
            libelleConfirmer="Supprimer"
            messageSucces="Dossier supprimé"
            redirection={urlApresSuppression}
            onConfirm={() => actions.supprimer(dossier.id)}
          />
          <DossierDialog
            open={ouvert}
            onOpenChange={setOuvert}
            dossier={dossier}
            onSubmit={actions.enregistrer}
          />
        </div>
      )}
    </div>
  );
}
