'use client';

import { PencilIcon } from 'lucide-react';
import { useState, type ReactNode } from 'react';

import { Button } from '@/components/ui/button';
import type { ActionResult } from '@/lib/common/action-result';
import { formatAnciennete, formatDateFr } from '@/lib/test-sirh/format';
import type { AffectationInput } from '@/lib/validation/test-sirh/collaborateurs';

import {
  AffectationDialog,
  type AffectationEditable,
  type OptionsAffectation,
} from './affectation-dialog';

/** Affectation affichée (identifiants + libellés résolus côté serveur). */
export type AffectationAffichee = AffectationEditable & {
  posteIntitule: string | null;
  siteNom: string | null;
  managerNom: string | null;
  horaireNom: string | null;
  societeLibelle: string | null;
};

type Props = {
  employeId: string;
  affectation: AffectationAffichee | null;
  /** Date d'ancienneté effective (reprise SIRH, sinon embauche / entrée). */
  dateAncienneteEffective: string | null;
  today: string;
  peutGerer: boolean;
  options: OptionsAffectation;
  onSubmit: (values: AffectationInput) => Promise<ActionResult<{ id: string }>>;
};

function Champ({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="mt-0.5 break-words text-sm">{children}</dd>
    </div>
  );
}

const vide = <span className="text-muted-foreground">—</span>;

/** Section « Affectation » du dossier : lecture + édition en modale (gestion). */
export function AffectationSection({
  employeId,
  affectation,
  dateAncienneteEffective,
  today,
  peutGerer,
  options,
  onSubmit,
}: Props) {
  const [ouvert, setOuvert] = useState(false);

  return (
    <div className="space-y-4">
      {!affectation && (
        <p className="text-sm text-muted-foreground">
          Aucune affectation SIRH : poste, site et manager ne sont pas encore renseignés.
        </p>
      )}
      <dl className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <Champ label="Poste">{affectation?.posteIntitule ?? vide}</Champ>
        <Champ label="Site">{affectation?.siteNom ?? vide}</Champ>
        <Champ label="Manager">{affectation?.managerNom ?? vide}</Champ>
        <Champ label="Horaire">{affectation?.horaireNom ?? vide}</Champ>
        <Champ label="Société employeuse">{affectation?.societeLibelle ?? vide}</Champ>
        <Champ label="Ancienneté">
          {dateAncienneteEffective ? (
            <>
              {formatAnciennete(dateAncienneteEffective, today)}
              <span className="text-xs text-muted-foreground">
                {' '}
                · depuis le {formatDateFr(dateAncienneteEffective)}
                {affectation?.dateAnciennete ? ' (reprise)' : ''}
              </span>
            </>
          ) : (
            vide
          )}
        </Champ>
        <Champ label="Email professionnel">
          {affectation?.emailProfessionnel ? (
            <a href={`mailto:${affectation.emailProfessionnel}`} className="hover:underline">
              {affectation.emailProfessionnel}
            </a>
          ) : (
            vide
          )}
        </Champ>
        <Champ label="Téléphone professionnel">{affectation?.telephoneProfessionnel ?? vide}</Champ>
        {affectation?.notes && <Champ label="Notes">{affectation.notes}</Champ>}
      </dl>

      {peutGerer && (
        <>
          <div className="flex justify-end">
            <Button variant="outline" size="sm" onClick={() => setOuvert(true)}>
              <PencilIcon className="mr-1 size-3.5" />
              {affectation ? 'Modifier l’affectation' : 'Renseigner l’affectation'}
            </Button>
          </div>
          <AffectationDialog
            open={ouvert}
            onOpenChange={setOuvert}
            employeId={employeId}
            affectation={affectation}
            options={options}
            onSubmit={onSubmit}
          />
        </>
      )}
    </div>
  );
}
