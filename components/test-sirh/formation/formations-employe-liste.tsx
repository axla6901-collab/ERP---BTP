import Link from 'next/link';

import { SirhVide } from '@/components/test-sirh/sirh-bloc';
import { libelleDatesSession, type StatutQualification } from '@/lib/test-sirh/formation/validite';
import { formatDateFr, formatHeures } from '@/lib/test-sirh/format';
import type {
  ResultatFormation,
  StatutInscription,
  StatutSession,
} from '@/lib/validation/test-sirh/enums';

import {
  ResultatFormationBadge,
  StatutInscriptionBadge,
  StatutQualificationBadge,
  StatutSessionBadge,
} from './badges';

/** Sous-ensemble de `FormationEmployeLigne` (lib/test-sirh/formation/queries) affiché ici. */
export type FormationEmployeLigneUI = {
  inscriptionId: string;
  sessionId: string;
  formationIntitule: string;
  formationCode: string | null;
  dateDebut: string;
  dateFin: string;
  sessionStatut: StatutSession;
  statut: StatutInscription;
  resultat: ResultatFormation;
  heuresRealisees: string | null;
  dateValidite: string | null;
  statutQualification: StatutQualification | null;
  remplacee: boolean;
};

type Props = {
  formations: readonly FormationEmployeLigneUI[];
  /** Préfixe `/<slug>/test-sirh` : rend les sessions cliquables (omettre si l'utilisateur n'y a pas accès). */
  baseHref?: string;
};

/**
 * Historique de formation d'un collaborateur (sessions, présence, résultat,
 * validité des qualifications) — composant de présentation server-compatible
 * pour le dossier collaborateur et « Mon espace ».
 */
export function FormationsEmployeListe({ formations, baseHref }: Props) {
  if (formations.length === 0) return <SirhVide>Aucune formation suivie.</SirhVide>;

  return (
    <div className="overflow-x-auto rounded-md border">
      <table className="w-full text-sm">
        <thead className="bg-muted/40 text-left text-xs uppercase tracking-widest text-muted-foreground">
          <tr>
            <th className="px-4 py-2 font-medium">Formation</th>
            <th className="px-4 py-2 font-medium">Session</th>
            <th className="px-4 py-2 font-medium">Présence</th>
            <th className="px-4 py-2 font-medium">Résultat</th>
            <th className="px-4 py-2 text-right font-medium">Heures</th>
            <th className="px-4 py-2 font-medium">Validité</th>
          </tr>
        </thead>
        <tbody className="divide-y">
          {formations.map((f) => (
            <tr key={f.inscriptionId} className={f.remplacee ? 'opacity-70' : undefined}>
              <td className="px-4 py-2">
                {baseHref ? (
                  <Link
                    href={`${baseHref}/formation/sessions/${f.sessionId}`}
                    className="font-medium underline-offset-2 hover:underline"
                  >
                    {f.formationIntitule}
                  </Link>
                ) : (
                  <span className="font-medium">{f.formationIntitule}</span>
                )}
                {f.formationCode && (
                  <span className="ml-2 text-xs text-muted-foreground">{f.formationCode}</span>
                )}
              </td>
              <td className="px-4 py-2">
                <span className="block whitespace-nowrap tabular-nums">
                  {libelleDatesSession(f.dateDebut, f.dateFin)}
                </span>
                {f.sessionStatut !== 'realisee' && <StatutSessionBadge statut={f.sessionStatut} />}
              </td>
              <td className="px-4 py-2">
                <StatutInscriptionBadge statut={f.statut} />
              </td>
              <td className="px-4 py-2">
                <ResultatFormationBadge resultat={f.resultat} />
              </td>
              <td className="px-4 py-2 text-right tabular-nums">
                {formatHeures(f.heuresRealisees)}
              </td>
              <td className="px-4 py-2">
                {f.resultat !== 'reussi' ? (
                  <span className="text-muted-foreground">—</span>
                ) : f.remplacee ? (
                  <span className="text-xs text-muted-foreground">Renouvelée depuis</span>
                ) : (
                  <span className="flex flex-wrap items-center gap-2">
                    <span className="tabular-nums">
                      {f.dateValidite ? formatDateFr(f.dateValidite) : 'Sans échéance'}
                    </span>
                    {f.statutQualification && f.dateValidite && (
                      <StatutQualificationBadge statut={f.statutQualification} />
                    )}
                  </span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
