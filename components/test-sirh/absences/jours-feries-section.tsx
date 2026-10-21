'use client';

import {
  CalendarPlusIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  PencilIcon,
  PlusIcon,
} from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';

import { BoutonConfirmation } from '@/components/test-sirh/bouton-confirmation';
import type { OptionListe } from '@/components/test-sirh/option-select';
import { SirhVide } from '@/components/test-sirh/sirh-bloc';
import { Badge } from '@/components/ui/badge';
import { Button, buttonVariants } from '@/components/ui/button';
import type { ActionResult } from '@/lib/common/action-result';
import type { JourFerieLigne } from '@/lib/test-sirh/absences/types';
import { formatJourCourt } from '@/lib/test-sirh/format';
import type { GenerationFeriesInput, JourFerieInput } from '@/lib/validation/test-sirh/absences';

import { GenererFeriesDialog } from './generer-feries-dialog';
import { JourFerieDialog } from './jour-ferie-dialog';

type Props = {
  annee: number;
  feries: JourFerieLigne[];
  sites: readonly OptionListe[];
  /** URL de la page (navigation `?annee=`). */
  baseHref: string;
  peutGerer: boolean;
  actions: {
    enregistrer: (input: JourFerieInput) => Promise<ActionResult<{ id: string }>>;
    supprimer: (id: string) => Promise<ActionResult>;
    generer: (
      input: GenerationFeriesInput,
    ) => Promise<ActionResult<{ crees: number; ignores: number }>>;
  };
};

/** Jours fériés d'une année (Factorial CompanyHoliday) : navigation, génération, CRUD. */
export function JoursFeriesSection({ annee, feries, sites, baseHref, peutGerer, actions }: Props) {
  const [edition, setEdition] = useState<{ ouvert: boolean; ferie: JourFerieLigne | null }>({
    ouvert: false,
    ferie: null,
  });
  const [generation, setGeneration] = useState(false);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <nav className="flex items-center gap-1" aria-label="Année">
          <Link
            href={`${baseHref}?annee=${annee - 1}`}
            className={buttonVariants({ variant: 'ghost', size: 'sm' })}
            aria-label={`Année ${annee - 1}`}
          >
            <ChevronLeftIcon className="size-4" />
          </Link>
          <span className="min-w-12 text-center text-sm font-semibold tabular-nums">{annee}</span>
          <Link
            href={`${baseHref}?annee=${annee + 1}`}
            className={buttonVariants({ variant: 'ghost', size: 'sm' })}
            aria-label={`Année ${annee + 1}`}
          >
            <ChevronRightIcon className="size-4" />
          </Link>
        </nav>
        <span className="text-xs text-muted-foreground">
          {feries.length} jour{feries.length > 1 ? 's' : ''} férié{feries.length > 1 ? 's' : ''}
        </span>
        {peutGerer && (
          <div className="ml-auto flex flex-wrap gap-2">
            <Button size="sm" variant="outline" onClick={() => setGeneration(true)}>
              <CalendarPlusIcon className="mr-1 size-4" />
              Générer l’année {annee}
            </Button>
            <Button size="sm" onClick={() => setEdition({ ouvert: true, ferie: null })}>
              <PlusIcon className="mr-1 size-4" />
              Ajouter un jour férié
            </Button>
          </div>
        )}
      </div>

      {feries.length === 0 ? (
        <SirhVide>
          Aucun jour férié en {annee}.{peutGerer ? ' Utilisez « Générer l’année ».' : ''}
        </SirhVide>
      ) : (
        <div className="overflow-x-auto rounded-xl border">
          <table className="w-full text-sm">
            <thead className="bg-muted/40 text-left text-xs uppercase tracking-widest text-muted-foreground">
              <tr>
                <th className="px-4 py-2 font-medium">Date</th>
                <th className="px-4 py-2 font-medium">Libellé</th>
                <th className="px-4 py-2 font-medium">Site</th>
                <th className="px-4 py-2 font-medium">Chômé</th>
                {peutGerer && <th className="px-4 py-2" />}
              </tr>
            </thead>
            <tbody className="divide-y">
              {feries.map((f) => (
                <tr key={f.id} className={f.chome ? undefined : 'text-muted-foreground'}>
                  <td className="whitespace-nowrap px-4 py-2 tabular-nums">
                    {formatJourCourt(f.dateFerie)}
                  </td>
                  <td className="px-4 py-2">{f.libelle}</td>
                  <td className="px-4 py-2">
                    {f.site ?? <span className="text-muted-foreground">Tous les sites</span>}
                  </td>
                  <td className="px-4 py-2">
                    {f.chome ? (
                      <Badge tone="emerald" shape="pill">
                        Chômé
                      </Badge>
                    ) : (
                      <Badge tone="neutral" shape="pill">
                        Travaillé
                      </Badge>
                    )}
                  </td>
                  {peutGerer && (
                    <td className="px-4 py-2">
                      <div className="flex items-center justify-end gap-1">
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 w-7 p-0"
                          onClick={() => setEdition({ ouvert: true, ferie: f })}
                          title="Modifier"
                          aria-label={`Modifier ${f.libelle}`}
                        >
                          <PencilIcon className="size-3.5" />
                        </Button>
                        <BoutonConfirmation
                          libelle="Supprimer"
                          question="Supprimer ce jour férié ?"
                          libelleConfirmer="Supprimer"
                          messageSucces="Jour férié supprimé"
                          onConfirm={() => actions.supprimer(f.id)}
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
          <JourFerieDialog
            open={edition.ouvert}
            onOpenChange={(o) => setEdition((e) => ({ ...e, ouvert: o }))}
            ferie={edition.ferie}
            annee={annee}
            sites={sites}
            onSubmit={actions.enregistrer}
          />
          <GenererFeriesDialog
            open={generation}
            onOpenChange={setGeneration}
            annee={annee}
            sites={sites}
            onGenerer={actions.generer}
          />
        </>
      )}
    </div>
  );
}
