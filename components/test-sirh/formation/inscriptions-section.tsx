'use client';

import { PencilIcon, UserPlusIcon } from 'lucide-react';
import { useState } from 'react';

import { BoutonConfirmation } from '@/components/test-sirh/bouton-confirmation';
import { SirhVide } from '@/components/test-sirh/sirh-bloc';
import { Button } from '@/components/ui/button';
import type { ActionResult } from '@/lib/common/action-result';
import { statutQualification } from '@/lib/test-sirh/formation/validite';
import { formatDateFr, formatHeures } from '@/lib/test-sirh/format';
import type {
  ResultatFormation,
  StatutInscription,
  StatutSession,
} from '@/lib/validation/test-sirh/enums';
import type { InscriptionInput, InscriptionsInput } from '@/lib/validation/test-sirh/formation';

import { AjoutInscritsDialog, type EmployeInscriptibleUI } from './ajout-inscrits-dialog';
import { ResultatFormationBadge, StatutInscriptionBadge, StatutQualificationBadge } from './badges';
import { InscriptionDialog, type InscriptionAModifier } from './inscription-dialog';

/** Ligne affichée (sérialisable, préparée par la page serveur). */
export type InscriptionLigneUI = {
  id: string;
  employeId: string;
  /** « Prénom Nom ». */
  employeNom: string;
  matricule: string | null;
  statut: StatutInscription;
  resultat: ResultatFormation;
  heuresRealisees: string | null;
  dateValidite: string | null;
  commentaire: string | null;
};

type Props = {
  sessionId: string;
  sessionStatut: StatutSession;
  dateFinSession: string;
  validiteMois: number | null;
  placesRestantes: number | null;
  inscriptions: InscriptionLigneUI[];
  /** Collaborateurs actifs (ajout). */
  employes: EmployeInscriptibleUI[];
  peutGerer: boolean;
  /** Date du jour (serveur) : statut des validités. */
  today: string;
  actions: {
    inscrire: (
      input: InscriptionsInput,
    ) => Promise<ActionResult<{ inscrits: number; dejaInscrits: number }>>;
    modifier: (input: InscriptionInput) => Promise<ActionResult<{ id: string }>>;
    retirer: (id: string) => Promise<ActionResult>;
  };
};

/** Participants d'une session : inscriptions, présence, résultats et validité. */
export function InscriptionsSection({
  sessionId,
  sessionStatut,
  dateFinSession,
  validiteMois,
  placesRestantes,
  inscriptions,
  employes,
  peutGerer,
  today,
  actions,
}: Props) {
  const [ajoutOuvert, setAjoutOuvert] = useState(false);
  const [edition, setEdition] = useState<{
    ouvert: boolean;
    inscription: InscriptionAModifier | null;
  }>({ ouvert: false, inscription: null });
  const complet = placesRestantes !== null && placesRestantes <= 0;
  const fermee = sessionStatut === 'annulee';

  function modifier(i: InscriptionLigneUI) {
    setEdition({
      ouvert: true,
      inscription: {
        id: i.id,
        employeNom: i.employeNom,
        statut: i.statut,
        resultat: i.resultat,
        heuresRealisees: i.heuresRealisees,
        commentaire: i.commentaire,
      },
    });
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-muted-foreground">
          {inscriptions.length} participant{inscriptions.length > 1 ? 's' : ''}
          {placesRestantes !== null &&
            ` · ${placesRestantes} place${placesRestantes > 1 ? 's' : ''} restante${placesRestantes > 1 ? 's' : ''}`}
        </p>
        {peutGerer && !fermee && (
          <Button
            size="sm"
            variant="outline"
            onClick={() => setAjoutOuvert(true)}
            disabled={complet}
            title={complet ? 'Session complète' : undefined}
          >
            <UserPlusIcon className="mr-1 size-4" /> Inscrire des collaborateurs
          </Button>
        )}
      </div>

      {inscriptions.length === 0 ? (
        <SirhVide>Aucun participant inscrit.</SirhVide>
      ) : (
        <div className="overflow-x-auto rounded-md border">
          <table className="w-full text-sm">
            <thead className="bg-muted/40 text-left text-xs uppercase tracking-widest text-muted-foreground">
              <tr>
                <th className="px-4 py-2 font-medium">Collaborateur</th>
                <th className="px-4 py-2 font-medium">Présence</th>
                <th className="px-4 py-2 font-medium">Résultat</th>
                <th className="px-4 py-2 text-right font-medium">Heures</th>
                <th className="px-4 py-2 font-medium">Validité</th>
                {peutGerer && <th className="px-4 py-2" />}
              </tr>
            </thead>
            <tbody className="divide-y">
              {inscriptions.map((i) => (
                <tr key={i.id} className={i.statut === 'annule' ? 'opacity-60' : undefined}>
                  <td className="px-4 py-2">
                    <span className="font-medium">{i.employeNom}</span>
                    {i.matricule && (
                      <span className="ml-2 text-xs text-muted-foreground">{i.matricule}</span>
                    )}
                    {i.commentaire && (
                      <span className="block text-xs text-muted-foreground">{i.commentaire}</span>
                    )}
                  </td>
                  <td className="px-4 py-2">
                    <StatutInscriptionBadge statut={i.statut} />
                  </td>
                  <td className="px-4 py-2">
                    <ResultatFormationBadge resultat={i.resultat} />
                  </td>
                  <td className="px-4 py-2 text-right tabular-nums">
                    {formatHeures(i.heuresRealisees)}
                  </td>
                  <td className="px-4 py-2">
                    {i.resultat === 'reussi' ? (
                      <span className="flex flex-wrap items-center gap-2">
                        <span className="tabular-nums">
                          {i.dateValidite ? formatDateFr(i.dateValidite) : 'Sans échéance'}
                        </span>
                        {i.dateValidite && (
                          <StatutQualificationBadge
                            statut={statutQualification(i.dateValidite, today)}
                          />
                        )}
                      </span>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </td>
                  {peutGerer && (
                    <td className="px-4 py-2 text-right">
                      <div className="flex items-center justify-end gap-1">
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 w-7 p-0"
                          onClick={() => modifier(i)}
                          title="Présence et résultat"
                          aria-label={`Modifier la participation de ${i.employeNom}`}
                        >
                          <PencilIcon className="size-3.5" />
                        </Button>
                        <BoutonConfirmation
                          libelle="Retirer"
                          question="Retirer ce participant ?"
                          libelleConfirmer="Retirer"
                          messageSucces="Participant retiré"
                          onConfirm={() => actions.retirer(i.id)}
                        />
                      </div>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {peutGerer && (
        <>
          <AjoutInscritsDialog
            open={ajoutOuvert}
            onOpenChange={setAjoutOuvert}
            sessionId={sessionId}
            employes={employes}
            dejaInscrits={inscriptions.map((i) => i.employeId)}
            placesRestantes={placesRestantes}
            onInscrire={actions.inscrire}
          />
          <InscriptionDialog
            open={edition.ouvert}
            onOpenChange={(ouvert) => setEdition((e) => ({ ...e, ouvert }))}
            inscription={edition.inscription}
            dateFinSession={dateFinSession}
            validiteMois={validiteMois}
            onSubmit={actions.modifier}
          />
        </>
      )}
    </div>
  );
}
