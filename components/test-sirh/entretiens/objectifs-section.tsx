'use client';

import { PencilIcon, PlusIcon } from 'lucide-react';
import { useState } from 'react';

import { BoutonConfirmation } from '@/components/test-sirh/bouton-confirmation';
import { SirhVide } from '@/components/test-sirh/sirh-bloc';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import type { ActionResult } from '@/lib/common/action-result';
import { objectifEnRetard, progressionObjectifs } from '@/lib/test-sirh/entretiens/progression';
import { formatDateFr } from '@/lib/test-sirh/format';
import type { ObjectifInput } from '@/lib/validation/test-sirh/entretiens';
import type { StatutObjectif, TypeEntretien } from '@/lib/validation/test-sirh/enums';
import { cn } from '@/lib/utils';

import { LIBELLES_COURTS_TYPE_ENTRETIEN, StatutObjectifBadge } from './badges';
import { BarreProgression } from './barre-progression';
import { ObjectifDialog } from './objectif-dialog';

/** Ligne affichée (sérialisable, préparée par la page serveur). */
export type ObjectifLigneUI = {
  id: string;
  employeId: string;
  entretienId: string | null;
  entretienType: TypeEntretien | null;
  entretienDate: string | null;
  libelle: string;
  description: string | null;
  dateEcheance: string | null;
  poids: number | null;
  progression: number;
  statut: StatutObjectif;
};

type Props = {
  objectifs: ObjectifLigneUI[];
  employeId: string;
  /** Entretien de la page (null hors fiche d'entretien). */
  entretienId: string | null;
  /** RH : tous les objectifs du salarié. */
  peutGererTout: boolean;
  /** Évaluateur : objectifs rattachés à cet entretien uniquement. */
  peutGererRattaches: boolean;
  /** Date du jour (serveur) pour signaler les échéances dépassées. */
  today: string;
  actions: {
    enregistrer: (input: ObjectifInput) => Promise<ActionResult<{ id: string }>>;
    supprimer: (id: string) => Promise<ActionResult>;
  };
};

/** Objectifs individuels : avancement pondéré, échéances, CRUD en modale. */
export function ObjectifsSection({
  objectifs,
  employeId,
  entretienId,
  peutGererTout,
  peutGererRattaches,
  today,
  actions,
}: Props) {
  const [edition, setEdition] = useState<{ ouvert: boolean; objectif: ObjectifInput | null }>({
    ouvert: false,
    objectif: null,
  });
  const peutCreer = peutGererTout || (peutGererRattaches && entretienId !== null);
  const peutModifier = (o: ObjectifLigneUI) =>
    peutGererTout || (peutGererRattaches && entretienId !== null && o.entretienId === entretienId);
  const atteinte = progressionObjectifs(objectifs);

  function ouvrir(o: ObjectifLigneUI | null) {
    setEdition({
      ouvert: true,
      objectif: o
        ? {
            id: o.id,
            employeId: o.employeId,
            entretienId: o.entretienId,
            libelle: o.libelle,
            description: o.description,
            dateEcheance: o.dateEcheance,
            poids: o.poids,
            progression: o.progression,
            statut: o.statut,
          }
        : null,
    });
  }

  function libelleRattachement(o: ObjectifLigneUI): React.ReactNode {
    if (!o.entretienId) return <span className="text-muted-foreground">—</span>;
    if (o.entretienId === entretienId) {
      return (
        <Badge tone="orange" shape="pill">
          Cet entretien
        </Badge>
      );
    }
    return (
      <span className="text-xs text-muted-foreground">
        {o.entretienType ? LIBELLES_COURTS_TYPE_ENTRETIEN[o.entretienType] : 'Entretien'}
        {o.entretienDate ? ` du ${formatDateFr(o.entretienDate)}` : ''}
      </span>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-muted-foreground">
          {objectifs.length === 0 ? (
            'Aucun objectif.'
          ) : (
            <>
              {objectifs.length} objectif{objectifs.length > 1 ? 's' : ''} · atteinte pondérée{' '}
              <span className="font-semibold tabular-nums text-foreground">
                {atteinte === null ? '—' : `${atteinte} %`}
              </span>
            </>
          )}
        </p>
        {peutCreer && (
          <Button size="sm" variant="outline" onClick={() => ouvrir(null)}>
            <PlusIcon className="mr-1 size-4" /> Nouvel objectif
          </Button>
        )}
      </div>

      {objectifs.length === 0 ? (
        <SirhVide>Fixez des objectifs mesurables lors de l’entretien.</SirhVide>
      ) : (
        <div className="overflow-x-auto rounded-md border">
          <table className="w-full text-sm">
            <thead className="bg-muted/40 text-left text-xs uppercase tracking-widest text-muted-foreground">
              <tr>
                <th className="px-4 py-2 font-medium">Objectif</th>
                <th className="px-4 py-2 font-medium">Échéance</th>
                <th className="px-4 py-2 text-right font-medium">Poids</th>
                <th className="px-4 py-2 font-medium">Avancement</th>
                <th className="px-4 py-2 font-medium">Statut</th>
                <th className="px-4 py-2 font-medium">Entretien</th>
                <th className="px-4 py-2" />
              </tr>
            </thead>
            <tbody className="divide-y">
              {objectifs.map((o) => {
                const retard = objectifEnRetard(o, today);
                return (
                  <tr key={o.id} className={o.statut === 'abandonne' ? 'opacity-60' : undefined}>
                    <td className="px-4 py-2">
                      <span className="font-medium">{o.libelle}</span>
                      {o.description && (
                        <span className="block text-xs text-muted-foreground">{o.description}</span>
                      )}
                    </td>
                    <td
                      className={cn(
                        'whitespace-nowrap px-4 py-2 tabular-nums',
                        retard && 'font-medium text-rose-700',
                      )}
                    >
                      {formatDateFr(o.dateEcheance)}
                      {retard && <span className="block text-xs">Échéance dépassée</span>}
                    </td>
                    <td className="px-4 py-2 text-right tabular-nums">
                      {o.poids === null ? '—' : `${o.poids} %`}
                    </td>
                    <td className="px-4 py-2">
                      <div className="flex w-36 items-center gap-2">
                        <BarreProgression
                          valeur={o.progression}
                          ton={o.progression >= 100 ? 'emerald' : 'amber'}
                          libelle={`Avancement de ${o.libelle}`}
                        />
                        <span className="w-10 text-right text-xs tabular-nums">
                          {o.progression} %
                        </span>
                      </div>
                    </td>
                    <td className="px-4 py-2">
                      <StatutObjectifBadge statut={o.statut} />
                    </td>
                    <td className="px-4 py-2">{libelleRattachement(o)}</td>
                    <td className="px-4 py-2 text-right">
                      {peutModifier(o) && (
                        <div className="flex items-center justify-end gap-1">
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 w-7 p-0"
                            onClick={() => ouvrir(o)}
                            title="Modifier"
                            aria-label={`Modifier ${o.libelle}`}
                          >
                            <PencilIcon className="size-3.5" />
                          </Button>
                          <BoutonConfirmation
                            libelle="Supprimer"
                            question="Supprimer cet objectif ?"
                            libelleConfirmer="Supprimer"
                            messageSucces="Objectif supprimé"
                            onConfirm={() => actions.supprimer(o.id)}
                          />
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {peutCreer && (
        <ObjectifDialog
          open={edition.ouvert}
          onOpenChange={(ouvert) => setEdition((e) => ({ ...e, ouvert }))}
          employeId={employeId}
          entretienId={entretienId}
          objectif={edition.objectif}
          rattachementImpose={!peutGererTout}
          onSubmit={actions.enregistrer}
        />
      )}
    </div>
  );
}
