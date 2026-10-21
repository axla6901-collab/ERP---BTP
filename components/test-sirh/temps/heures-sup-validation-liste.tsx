'use client';

import { CheckIcon, XIcon } from 'lucide-react';
import { useState } from 'react';

import { SirhVide } from '@/components/test-sirh/sirh-bloc';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import type { ActionResult } from '@/lib/common/action-result';
import { formatDateFr, formatHeures } from '@/lib/test-sirh/format';
import {
  libelleMajoration,
  LIBELLES_COURTS_COMPENSATION,
  resumeHeuresSup,
} from '@/lib/test-sirh/temps/heures-sup';
import type { DecisionInput } from '@/lib/validation/test-sirh/commun';
import type { CompensationHs } from '@/lib/validation/test-sirh/enums';

import { DecisionHeuresSupDialog, type DemandeADecider } from './decision-heures-sup-dialog';

/** Demande en attente telle que fournie par `listerHeuresSupEnAttente()` (sous-ensemble). */
export type HeuresSupAValider = {
  id: string;
  employeNom: string;
  employePrenom: string;
  matricule: string | null;
  dateHeures: string;
  dureeHeures: number;
  majorationPct: number;
  compensation: CompensationHs;
  chantierLabel: string | null;
  motif: string | null;
  demandeParEmail: string | null;
  /** Faux pour sa propre demande (sauf gestionnaire RH). */
  peutDecider: boolean;
};

/**
 * Demandes d'heures sup. en attente avec boutons Approuver / Refuser (écran
 * Validations, onglet Heures sup.). Un valideur ne décide pas de sa propre demande.
 */
export function HeuresSupValidationListe({
  demandes,
  onDecider,
  messageVide = 'Aucune demande d’heures supplémentaires en attente.',
}: {
  demandes: readonly HeuresSupAValider[];
  onDecider: (input: DecisionInput) => Promise<ActionResult>;
  messageVide?: string;
}) {
  const [aDecider, setADecider] = useState<DemandeADecider | null>(null);

  if (demandes.length === 0) return <SirhVide>{messageVide}</SirhVide>;

  return (
    <>
      <div className="overflow-x-auto rounded-xl border bg-card">
        <table className="w-full min-w-[720px] text-sm">
          <thead className="bg-muted/40 text-left text-xs uppercase tracking-widest text-muted-foreground">
            <tr>
              <th className="px-4 py-2 font-medium">Collaborateur</th>
              <th className="px-4 py-2 font-medium">Date</th>
              <th className="px-4 py-2 text-right font-medium">Durée</th>
              <th className="px-4 py-2 font-medium">Majoration</th>
              <th className="px-4 py-2 font-medium">Chantier / motif</th>
              <th className="px-4 py-2" />
            </tr>
          </thead>
          <tbody className="divide-y">
            {demandes.map((d) => (
              <tr key={d.id}>
                <td className="px-4 py-2">
                  <span className="font-medium">{`${d.employeNom} ${d.employePrenom}`.trim()}</span>
                  {d.matricule && (
                    <span className="ml-2 text-xs text-muted-foreground">{d.matricule}</span>
                  )}
                  {d.demandeParEmail && (
                    <span className="block text-xs text-muted-foreground">
                      Demandée par {d.demandeParEmail}
                    </span>
                  )}
                </td>
                <td className="whitespace-nowrap px-4 py-2 tabular-nums">
                  {formatDateFr(d.dateHeures)}
                </td>
                <td className="whitespace-nowrap px-4 py-2 text-right font-medium tabular-nums">
                  {formatHeures(d.dureeHeures)}
                </td>
                <td className="whitespace-nowrap px-4 py-2">
                  <Badge tone="orange">{libelleMajoration(d.majorationPct)}</Badge>
                  <span className="ml-2 text-xs text-muted-foreground">
                    {LIBELLES_COURTS_COMPENSATION[d.compensation]}
                  </span>
                </td>
                <td className="max-w-[260px] px-4 py-2 text-muted-foreground">
                  {d.chantierLabel && <span className="block truncate">{d.chantierLabel}</span>}
                  {d.motif && <span className="block truncate text-xs">{d.motif}</span>}
                  {!d.chantierLabel && !d.motif && '—'}
                </td>
                <td className="px-4 py-2">
                  <div className="flex justify-end gap-1">
                    <Button
                      type="button"
                      size="sm"
                      disabled={!d.peutDecider}
                      title={
                        d.peutDecider
                          ? undefined
                          : 'Vous ne pouvez pas décider de votre propre demande'
                      }
                      onClick={() =>
                        setADecider({ id: d.id, decision: 'approuver', resume: resumeHeuresSup(d) })
                      }
                      aria-label={`Approuver la demande de ${d.employePrenom} ${d.employeNom}`}
                    >
                      <CheckIcon className="mr-1 size-3.5" /> Approuver
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="destructive"
                      disabled={!d.peutDecider}
                      onClick={() =>
                        setADecider({ id: d.id, decision: 'refuser', resume: resumeHeuresSup(d) })
                      }
                      aria-label={`Refuser la demande de ${d.employePrenom} ${d.employeNom}`}
                    >
                      <XIcon className="mr-1 size-3.5" /> Refuser
                    </Button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <DecisionHeuresSupDialog
        demande={aDecider}
        onOpenChange={(open) => !open && setADecider(null)}
        onDecider={onDecider}
      />
    </>
  );
}
