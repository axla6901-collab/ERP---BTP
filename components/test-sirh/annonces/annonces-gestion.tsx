'use client';

import { PencilIcon, PinIcon, PinOffIcon, PlusIcon } from 'lucide-react';
import { useMemo, useState, useTransition } from 'react';
import { toast } from 'sonner';

import { BoutonConfirmation } from '@/components/test-sirh/bouton-confirmation';
import type { OptionListe } from '@/components/test-sirh/option-select';
import { Button } from '@/components/ui/button';
import { FilterPills } from '@/components/ui/filter-pills';
import type { ActionResult } from '@/lib/common/action-result';
import type { AnnonceAffichee } from '@/lib/test-sirh/annonces/types';
import {
  compterParStatut,
  filtrerAnnoncesParStatut,
  LIBELLES_STATUT_ANNONCE,
  STATUTS_ANNONCE,
  type FiltreStatutAnnonce,
} from '@/lib/test-sirh/annonces/visibilite';
import type { AnnonceInput, EpingleAnnonceInput } from '@/lib/validation/test-sirh/annonces';

import { AnnonceDialog } from './annonce-dialog';
import { FilAnnonces } from './fil-annonces';

type Props = {
  annonces: AnnonceAffichee[];
  today: string;
  sites: readonly OptionListe[];
  equipes: readonly OptionListe[];
  actions: {
    enregistrer: (input: AnnonceInput) => Promise<ActionResult<{ id: string }>>;
    supprimer: (id: string) => Promise<ActionResult>;
    basculerEpingle: (input: EpingleAnnonceInput) => Promise<ActionResult>;
  };
};

/** Libellés des filtres de statut (au pluriel). */
const LIBELLES_FILTRE: Record<FiltreStatutAnnonce, string> = {
  en_ligne: LIBELLES_STATUT_ANNONCE.en_ligne,
  programmee: 'Programmées',
  brouillon: 'Brouillons',
  expiree: 'Expirées',
  toutes: 'Toutes',
};

/**
 * Vue gestionnaire des annonces : toutes audiences, filtre par statut (en
 * ligne, programmées, brouillons, expirées), rédaction, épinglage, suppression.
 */
export function AnnoncesGestion({ annonces, today, sites, equipes, actions }: Props) {
  const [isPending, startTransition] = useTransition();
  const [filtre, setFiltre] = useState<FiltreStatutAnnonce>('en_ligne');
  const [dialog, setDialog] = useState<{ ouvert: boolean; annonce: AnnonceAffichee | null }>({
    ouvert: false,
    annonce: null,
  });

  const compteurs = useMemo(() => compterParStatut(annonces, today), [annonces, today]);
  const affichees = useMemo(
    () => filtrerAnnoncesParStatut(annonces, filtre, today),
    [annonces, filtre, today],
  );
  const annonceEditee = useMemo<Partial<AnnonceInput> | null>(
    () =>
      dialog.annonce
        ? {
            id: dialog.annonce.id,
            titre: dialog.annonce.titre,
            contenu: dialog.annonce.contenu,
            categorie: dialog.annonce.categorie,
            epinglee: dialog.annonce.epinglee,
            publiee: dialog.annonce.publiee,
            datePublication: dialog.annonce.datePublication,
            dateExpiration: dialog.annonce.dateExpiration,
            siteId: dialog.annonce.siteId,
            equipeId: dialog.annonce.equipeId,
          }
        : null,
    [dialog.annonce],
  );

  function basculerEpingle(a: AnnonceAffichee) {
    startTransition(async () => {
      const r = await actions.basculerEpingle({ id: a.id, epinglee: !a.epinglee });
      if (!r.ok) {
        toast.error(r.error);
        return;
      }
      toast.success(a.epinglee ? 'Annonce désépinglée' : 'Annonce épinglée');
    });
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <FilterPills
          aria-label="Filtrer par statut"
          items={[
            ...STATUTS_ANNONCE.map((s) => ({
              key: s,
              label: LIBELLES_FILTRE[s],
              count: compteurs[s],
              active: filtre === s,
              onClick: () => setFiltre(s),
            })),
            {
              key: 'toutes',
              label: LIBELLES_FILTRE.toutes,
              count: annonces.length,
              active: filtre === 'toutes',
              onClick: () => setFiltre('toutes'),
            },
          ]}
        />
        <Button size="sm" onClick={() => setDialog({ ouvert: true, annonce: null })}>
          <PlusIcon className="mr-1 size-4" /> Nouvelle annonce
        </Button>
      </div>

      <FilAnnonces
        annonces={affichees}
        today={today}
        afficherStatut
        vide={
          annonces.length === 0
            ? 'Aucune annonce. Publiez la première information à destination des équipes.'
            : 'Aucune annonce pour ce filtre.'
        }
        renderActions={(a) => (
          <>
            <Button
              variant="ghost"
              size="sm"
              className="h-7 w-7 p-0"
              disabled={isPending}
              onClick={() => basculerEpingle(a)}
              title={a.epinglee ? 'Désépingler' : 'Épingler'}
              aria-label={a.epinglee ? `Désépingler ${a.titre}` : `Épingler ${a.titre}`}
            >
              {a.epinglee ? <PinOffIcon className="size-3.5" /> : <PinIcon className="size-3.5" />}
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="h-7 w-7 p-0"
              onClick={() => setDialog({ ouvert: true, annonce: a })}
              title="Modifier"
              aria-label={`Modifier ${a.titre}`}
            >
              <PencilIcon className="size-3.5" />
            </Button>
            <BoutonConfirmation
              libelle="Supprimer"
              question="Supprimer cette annonce ?"
              libelleConfirmer="Supprimer"
              messageSucces="Annonce supprimée"
              onConfirm={() => actions.supprimer(a.id)}
            />
          </>
        )}
      />

      <AnnonceDialog
        open={dialog.ouvert}
        onOpenChange={(ouvert) => setDialog((s) => ({ ...s, ouvert }))}
        annonce={annonceEditee}
        today={today}
        sites={sites}
        equipes={equipes}
        onSubmit={actions.enregistrer}
      />
    </div>
  );
}
