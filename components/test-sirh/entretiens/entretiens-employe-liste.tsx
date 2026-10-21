import Link from 'next/link';

import { SirhVide } from '@/components/test-sirh/sirh-bloc';
import { objectifEnRetard, progressionObjectifs } from '@/lib/test-sirh/entretiens/progression';
import { formatDateFr } from '@/lib/test-sirh/format';
import type {
  StatutEntretien,
  StatutObjectif,
  TypeEntretien,
} from '@/lib/validation/test-sirh/enums';
import { cn } from '@/lib/utils';

import {
  LIBELLES_COURTS_TYPE_ENTRETIEN,
  StatutEntretienBadge,
  StatutObjectifBadge,
} from './badges';
import { BarreProgression } from './barre-progression';

/** Sous-ensemble de `EntretienEmployeLigne` (lib/test-sirh/entretiens/queries) affiché ici. */
export type EntretienEmployeLigneUI = {
  id: string;
  campagneLibelle: string | null;
  evaluateurNom: string | null;
  typeEntretien: TypeEntretien;
  datePrevue: string | null;
  dateRealisation: string | null;
  statut: StatutEntretien;
  noteGlobale: number | null;
  synthese?: string | null;
};

/** Sous-ensemble de `ObjectifLigne` (lib/test-sirh/entretiens/queries) affiché ici. */
export type ObjectifEmployeLigneUI = {
  id: string;
  libelle: string;
  dateEcheance: string | null;
  poids: number | null;
  progression: number;
  statut: StatutObjectif;
};

type Props = {
  entretiens: readonly EntretienEmployeLigneUI[];
  /** Objectifs du salarié (bloc masqué si non fourni). */
  objectifs?: readonly ObjectifEmployeLigneUI[];
  /** Préfixe `/<slug>/test-sirh` : rend les entretiens cliquables (omettre si l'utilisateur n'a pas accès aux fiches). */
  baseHref?: string;
  /** Date du jour (serveur), pour signaler les objectifs en retard. */
  today: string;
  /** Affiche la synthèse sous chaque entretien (« Mon espace »). */
  afficherSynthese?: boolean;
};

/**
 * Entretiens et objectifs d'un collaborateur — composant de présentation
 * (server-compatible) pour le dossier collaborateur et « Mon espace ».
 */
export function EntretiensEmployeListe({
  entretiens,
  objectifs,
  baseHref,
  today,
  afficherSynthese = false,
}: Props) {
  const atteinte = objectifs ? progressionObjectifs(objectifs) : null;

  return (
    <div className="space-y-4">
      {entretiens.length === 0 ? (
        <SirhVide>Aucun entretien enregistré.</SirhVide>
      ) : (
        <div className="overflow-x-auto rounded-md border">
          <table className="w-full text-sm">
            <thead className="bg-muted/40 text-left text-xs uppercase tracking-widest text-muted-foreground">
              <tr>
                <th className="px-4 py-2 font-medium">Date</th>
                <th className="px-4 py-2 font-medium">Entretien</th>
                <th className="px-4 py-2 font-medium">Évaluateur</th>
                <th className="px-4 py-2 font-medium">Statut</th>
                <th className="px-4 py-2 text-right font-medium">Note</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {entretiens.map((e) => {
                const date = e.dateRealisation ?? e.datePrevue;
                const libelle = LIBELLES_COURTS_TYPE_ENTRETIEN[e.typeEntretien];
                return (
                  <tr key={e.id}>
                    <td className="whitespace-nowrap px-4 py-2 align-top tabular-nums">
                      {formatDateFr(date)}
                      {!e.dateRealisation && e.datePrevue && (
                        <span className="block text-xs text-muted-foreground">prévu</span>
                      )}
                    </td>
                    <td className="px-4 py-2 align-top">
                      {baseHref ? (
                        <Link
                          href={`${baseHref}/entretiens/${e.id}`}
                          className="font-medium underline-offset-2 hover:underline"
                        >
                          {libelle}
                        </Link>
                      ) : (
                        <span className="font-medium">{libelle}</span>
                      )}
                      <span className="block text-xs text-muted-foreground">
                        {e.campagneLibelle ?? 'Hors campagne'}
                      </span>
                      {afficherSynthese && e.synthese && (
                        <p className="mt-1 whitespace-pre-line text-xs text-foreground/80">
                          {e.synthese}
                        </p>
                      )}
                    </td>
                    <td className="px-4 py-2 align-top text-muted-foreground">
                      {e.evaluateurNom ?? '—'}
                    </td>
                    <td className="px-4 py-2 align-top">
                      <StatutEntretienBadge statut={e.statut} />
                    </td>
                    <td className="px-4 py-2 text-right align-top tabular-nums">
                      {e.noteGlobale !== null ? `${e.noteGlobale} / 5` : '—'}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {objectifs && (
        <div className="space-y-2">
          <div className="flex items-baseline justify-between gap-2">
            <h3 className="text-sm font-semibold">Objectifs</h3>
            {atteinte !== null && (
              <span className="text-xs text-muted-foreground">
                Atteinte pondérée{' '}
                <span className="font-semibold tabular-nums text-foreground">{atteinte} %</span>
              </span>
            )}
          </div>
          {objectifs.length === 0 ? (
            <SirhVide>Aucun objectif.</SirhVide>
          ) : (
            <ul className="divide-y rounded-md border">
              {objectifs.map((o) => {
                const retard = objectifEnRetard(o, today);
                return (
                  <li
                    key={o.id}
                    className="flex flex-col gap-2 px-4 py-2 sm:flex-row sm:items-center sm:justify-between"
                  >
                    <div className="min-w-0">
                      <span className="font-medium">{o.libelle}</span>
                      <span
                        className={cn(
                          'block text-xs',
                          retard ? 'text-rose-700' : 'text-muted-foreground',
                        )}
                      >
                        Échéance {formatDateFr(o.dateEcheance)}
                        {retard ? ' · dépassée' : ''}
                        {o.poids !== null ? ` · poids ${o.poids} %` : ''}
                      </span>
                    </div>
                    <div className="flex shrink-0 items-center gap-3">
                      <div className="flex w-32 items-center gap-2">
                        <BarreProgression
                          valeur={o.progression}
                          ton={o.progression >= 100 ? 'emerald' : 'amber'}
                          libelle={`Avancement de ${o.libelle}`}
                        />
                        <span className="w-9 text-right text-xs tabular-nums">
                          {o.progression} %
                        </span>
                      </div>
                      <StatutObjectifBadge statut={o.statut} />
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
