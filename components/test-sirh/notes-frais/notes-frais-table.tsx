'use client';

import { CheckIcon, PencilIcon, PlusIcon, WalletIcon, XIcon } from 'lucide-react';
import { useState } from 'react';

import { BoutonConfirmation } from '@/components/test-sirh/bouton-confirmation';
import type { OptionListe } from '@/components/test-sirh/option-select';
import { StatutFraisBadge } from '@/components/test-sirh/statut-badges';
import { TelechargementDocument } from '@/components/test-sirh/telechargement-document';
import { Button } from '@/components/ui/button';
import { DataTable, type DataTableColumn } from '@/components/ui/data-table';
import type { ActionResult } from '@/lib/common/action-result';
import { formatDateFr, formatEuro } from '@/lib/test-sirh/format';
import { detailMontantNoteFrais } from '@/lib/test-sirh/notes-frais/calculs';
import type { NoteFraisLigne } from '@/lib/test-sirh/notes-frais/queries';
import type { DecisionInput } from '@/lib/validation/test-sirh/commun';
import { LIBELLES_CATEGORIE_FRAIS } from '@/lib/validation/test-sirh/enums';

import { DecisionNoteFraisDialog } from './decision-note-frais-dialog';
import { NoteFraisDialog, type ActionsNoteFraisDialog } from './note-frais-dialog';
import { RemboursementNoteFraisDialog } from './remboursement-dialog';

export type ResultatUrlDocument =
  | { ok: true; url: string; titre: string }
  | { ok: false; error: string };

/** Server actions de la liste (wrappers inline `'use server'` passés par la page). */
export type ActionsNotesFrais = ActionsNoteFraisDialog & {
  soumettreBrouillon: (id: string) => Promise<ActionResult>;
  decider: (input: DecisionInput) => Promise<ActionResult>;
  rembourser: (id: string, dateRemboursement: string) => Promise<ActionResult>;
  supprimer: (id: string) => Promise<ActionResult>;
  urlTelechargement: (id: string) => Promise<ResultatUrlDocument>;
};

type Props = {
  notes: NoteFraisLigne[];
  chantiers: readonly OptionListe[];
  /** Date du jour (serveur). */
  today: string;
  actions: ActionsNotesFrais;
  /** Colonne « Collaborateur » (masquée dans Mon espace / le dossier d'un salarié). */
  afficherEmploye?: boolean;
  /** Salariés sélectionnables à la création (gestion RH). */
  employes?: readonly OptionListe[];
  /** Salarié imposé à la création (libre-service, dossier collaborateur). */
  employeFixe?: OptionListe | null;
  /** Affiche « Nouvelle note de frais ». */
  peutCreer?: boolean;
  dossierJustificatifsId?: string | null;
  emptyMessage?: string;
};

/**
 * Liste des notes de frais avec les actions permises à l'utilisateur sur
 * chaque ligne (droits calculés côté serveur) : modifier, soumettre,
 * approuver / refuser, marquer remboursée, supprimer un brouillon.
 * Réutilisable dans Mon espace et le dossier collaborateur.
 */
export function NotesFraisTable({
  notes,
  chantiers,
  today,
  actions,
  afficherEmploye = true,
  employes = [],
  employeFixe = null,
  peutCreer = false,
  dossierJustificatifsId = null,
  emptyMessage = 'Aucune note de frais pour ces critères.',
}: Props) {
  const [dialogOuvert, setDialogOuvert] = useState(false);
  const [edite, setEdite] = useState<NoteFraisLigne | null>(null);
  const [aDecider, setADecider] = useState<{
    note: NoteFraisLigne;
    decision: 'approuver' | 'refuser';
  } | null>(null);
  const [aRembourser, setARembourser] = useState<NoteFraisLigne | null>(null);

  function ouvrir(note: NoteFraisLigne | null) {
    setEdite(note);
    setDialogOuvert(true);
  }

  const colonnes: DataTableColumn<NoteFraisLigne>[] = [
    {
      id: 'date',
      header: 'Date',
      cell: (n) => <span className="tabular-nums">{formatDateFr(n.dateDepense)}</span>,
      sortAccessor: (n) => n.dateDepense,
    },
  ];
  if (afficherEmploye) {
    colonnes.push({
      id: 'employe',
      header: 'Collaborateur',
      cell: (n) => <span className="font-medium">{n.employeNom}</span>,
      sortAccessor: (n) => n.employeNom,
      searchAccessor: (n) => n.employeNom,
    });
  }
  colonnes.push(
    {
      id: 'libelle',
      header: 'Dépense',
      cell: (n) => {
        const detail = detailMontantNoteFrais(n);
        return (
          <div className="min-w-0">
            <span className="block">{n.libelle}</span>
            <span className="block text-xs text-muted-foreground">
              {LIBELLES_CATEGORIE_FRAIS[n.categorie]}
              {detail && ` · ${detail}`}
              {n.chantierLabel && ` · ${n.chantierLabel}`}
            </span>
          </div>
        );
      },
      sortAccessor: (n) => n.libelle,
      searchAccessor: (n) =>
        `${n.libelle} ${LIBELLES_CATEGORIE_FRAIS[n.categorie]} ${n.chantierLabel ?? ''}`,
    },
    {
      id: 'montant',
      header: 'Montant',
      align: 'right',
      cell: (n) => (
        <div className="tabular-nums">
          <span className="font-medium">{formatEuro(n.montantTtc)}</span>
          {n.montantTva !== null && n.montantTva > 0 && (
            <span className="block text-xs text-muted-foreground">
              dont TVA {formatEuro(n.montantTva)}
            </span>
          )}
        </div>
      ),
      sortAccessor: (n) => n.montantTtc,
    },
    {
      id: 'statut',
      header: 'Statut',
      cell: (n) => (
        <div className="space-y-0.5">
          <StatutFraisBadge statut={n.statut} />
          {n.statut === 'remboursee' && n.dateRemboursement && (
            <span className="block text-xs text-muted-foreground">
              le {formatDateFr(n.dateRemboursement)}
            </span>
          )}
          {n.commentaireDecision && (n.statut === 'refusee' || n.statut === 'approuvee') && (
            <span
              className="block max-w-xs truncate text-xs text-muted-foreground"
              title={n.commentaireDecision}
            >
              « {n.commentaireDecision} »
            </span>
          )}
        </div>
      ),
      sortAccessor: (n) => n.statut,
    },
    {
      id: 'piece',
      header: 'Pièce',
      align: 'center',
      cell: (n) =>
        n.justificatifDocumentId ? (
          <TelechargementDocument
            documentId={n.justificatifDocumentId}
            obtenirUrl={actions.urlTelechargement}
            libelle={n.justificatifTitre ?? 'Justificatif'}
            compact
          />
        ) : (
          <span className="text-muted-foreground">—</span>
        ),
    },
    {
      id: 'actions',
      header: '',
      align: 'right',
      cell: (n) => (
        <div className="flex flex-wrap items-center justify-end gap-1">
          {n.droits.modifier && (
            <Button
              variant="ghost"
              size="sm"
              className="h-7 w-7 p-0"
              onClick={() => ouvrir(n)}
              title="Modifier"
              aria-label={`Modifier ${n.libelle}`}
            >
              <PencilIcon className="size-3.5" />
            </Button>
          )}
          {n.droits.soumettre && (
            <BoutonConfirmation
              libelle="Soumettre"
              question="Soumettre à validation ?"
              libelleConfirmer="Soumettre"
              messageSucces="Note soumise à validation"
              variante="default"
              onConfirm={() => actions.soumettreBrouillon(n.id)}
            />
          )}
          {n.droits.decider && (
            <>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setADecider({ note: n, decision: 'approuver' })}
                aria-label={`Approuver ${n.libelle}`}
              >
                <CheckIcon className="size-3.5" /> Approuver
              </Button>
              <Button
                variant="destructive"
                size="sm"
                onClick={() => setADecider({ note: n, decision: 'refuser' })}
                aria-label={`Refuser ${n.libelle}`}
              >
                <XIcon className="size-3.5" /> Refuser
              </Button>
            </>
          )}
          {n.droits.rembourser && (
            <Button variant="outline" size="sm" onClick={() => setARembourser(n)}>
              <WalletIcon className="size-3.5" /> Rembourser
            </Button>
          )}
          {n.droits.supprimer && (
            <BoutonConfirmation
              libelle="Supprimer"
              question="Supprimer ce brouillon ?"
              libelleConfirmer="Supprimer"
              messageSucces="Brouillon supprimé"
              onConfirm={() => actions.supprimer(n.id)}
            />
          )}
        </div>
      ),
    },
  );

  return (
    <>
      <DataTable
        columns={colonnes}
        rows={notes}
        rowKey={(n) => n.id}
        searchPlaceholder="Rechercher une note…"
        emptyMessage={emptyMessage}
        defaultSort={{ id: 'date', dir: 'desc' }}
        rowClassName={(n) => (n.statut === 'refusee' ? 'opacity-70' : undefined)}
        rightActions={
          peutCreer ? (
            <Button size="sm" onClick={() => ouvrir(null)}>
              <PlusIcon className="mr-1 size-4" /> Nouvelle note de frais
            </Button>
          ) : null
        }
      />
      <NoteFraisDialog
        open={dialogOuvert}
        onOpenChange={setDialogOuvert}
        note={edite}
        employeFixe={edite ? { id: edite.employeId, label: edite.employeNom } : employeFixe}
        employes={employes}
        chantiers={chantiers}
        today={today}
        dossierJustificatifsId={dossierJustificatifsId}
        actions={actions}
      />
      <DecisionNoteFraisDialog
        note={aDecider?.note ?? null}
        decision={aDecider?.decision ?? 'approuver'}
        onClose={() => setADecider(null)}
        onDecider={actions.decider}
      />
      <RemboursementNoteFraisDialog
        note={aRembourser}
        today={today}
        onClose={() => setARembourser(null)}
        onRembourser={actions.rembourser}
      />
    </>
  );
}
