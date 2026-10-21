'use client';

import { ArrowDownIcon, ArrowUpIcon, PencilIcon, PlusIcon } from 'lucide-react';
import { useMemo, useState, useTransition } from 'react';
import { toast } from 'sonner';

import { BoutonConfirmation } from '@/components/test-sirh/bouton-confirmation';
import { SirhBloc, SirhVide } from '@/components/test-sirh/sirh-bloc';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { FilterPills } from '@/components/ui/filter-pills';
import type { ActionResult } from '@/lib/common/action-result';
import { formatDelai } from '@/lib/test-sirh/onboarding/planification';
import type { ModeleProcessusLigne, ModeleTacheLigne } from '@/lib/test-sirh/onboarding/types';
import { cn } from '@/lib/utils';
import type {
  DeplacerModeleTacheInput,
  ModeleProcessusInput,
  ModeleTacheInput,
} from '@/lib/validation/test-sirh/onboarding';

import { ResponsableBadge, TypeProcessusBadge } from './badges-onboarding';
import { ModeleDialog } from './modele-dialog';
import { ModeleTacheDialog } from './modele-tache-dialog';

type FiltreActif = 'actifs' | 'inactifs' | 'tous';

type Props = {
  modeles: ModeleProcessusLigne[];
  actions: {
    enregistrerModele: (input: ModeleProcessusInput) => Promise<ActionResult<{ id: string }>>;
    supprimerModele: (id: string) => Promise<ActionResult>;
    enregistrerTache: (input: ModeleTacheInput) => Promise<ActionResult<{ id: string }>>;
    supprimerTache: (id: string) => Promise<ActionResult>;
    deplacerTache: (input: DeplacerModeleTacheInput) => Promise<ActionResult>;
  };
};

/** Tâches ordonnées d'un modèle (tableau) avec réordonnancement. */
function TachesModele({
  taches,
  enCours,
  onDeplacer,
  onModifier,
  onSupprimer,
}: {
  taches: ModeleTacheLigne[];
  enCours: boolean;
  onDeplacer: (id: string, sens: 'haut' | 'bas') => void;
  onModifier: (t: ModeleTacheLigne) => void;
  onSupprimer: (id: string) => Promise<ActionResult>;
}) {
  if (taches.length === 0) return <SirhVide>Aucune tâche dans ce modèle.</SirhVide>;
  return (
    <div className="overflow-x-auto rounded-md border">
      <table className="w-full text-sm">
        <thead className="bg-muted/40 text-left text-xs uppercase tracking-widest text-muted-foreground">
          <tr>
            <th className="w-10 px-3 py-2 font-medium">#</th>
            <th className="px-3 py-2 font-medium">Tâche</th>
            <th className="px-3 py-2 font-medium">Responsable</th>
            <th className="px-3 py-2 text-right font-medium">Échéance</th>
            <th className="px-3 py-2" />
          </tr>
        </thead>
        <tbody className="divide-y">
          {taches.map((t, i) => (
            <tr key={t.id}>
              <td className="px-3 py-2 tabular-nums text-muted-foreground">{i + 1}</td>
              <td className="px-3 py-2">
                <span className="font-medium">{t.libelle}</span>
                {t.description && (
                  <span className="block whitespace-pre-line text-xs text-muted-foreground">
                    {t.description}
                  </span>
                )}
              </td>
              <td className="px-3 py-2">
                <ResponsableBadge responsable={t.responsable} />
              </td>
              <td className="whitespace-nowrap px-3 py-2 text-right tabular-nums">
                {formatDelai(t.delaiJours)}
              </td>
              <td className="px-3 py-2">
                <div className="flex items-center justify-end gap-1">
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 w-7 p-0"
                    disabled={enCours || i === 0}
                    onClick={() => onDeplacer(t.id, 'haut')}
                    title="Monter"
                    aria-label={`Monter ${t.libelle}`}
                  >
                    <ArrowUpIcon className="size-3.5" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 w-7 p-0"
                    disabled={enCours || i === taches.length - 1}
                    onClick={() => onDeplacer(t.id, 'bas')}
                    title="Descendre"
                    aria-label={`Descendre ${t.libelle}`}
                  >
                    <ArrowDownIcon className="size-3.5" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 w-7 p-0"
                    onClick={() => onModifier(t)}
                    title="Modifier"
                    aria-label={`Modifier ${t.libelle}`}
                  >
                    <PencilIcon className="size-3.5" />
                  </Button>
                  <BoutonConfirmation
                    libelle="Supprimer"
                    question="Retirer cette tâche du modèle ?"
                    libelleConfirmer="Retirer"
                    messageSucces="Tâche retirée du modèle"
                    onConfirm={() => onSupprimer(t.id)}
                  />
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/**
 * Modèles de processus (Factorial processes) : CRUD, tâches ordonnées
 * (ajout, modification, suppression, monter / descendre, délai ± jours,
 * responsable). Un modèle ayant servi ne se supprime pas : on le désactive.
 */
export function ModelesSection({ modeles, actions }: Props) {
  const [isPending, startTransition] = useTransition();
  const [filtre, setFiltre] = useState<FiltreActif>('actifs');
  const [modeleDialog, setModeleDialog] = useState<{
    ouvert: boolean;
    modele: ModeleProcessusLigne | null;
  }>({ ouvert: false, modele: null });
  const [tacheDialog, setTacheDialog] = useState<{
    ouvert: boolean;
    modeleId: string;
    tache: ModeleTacheLigne | null;
  }>({ ouvert: false, modeleId: '', tache: null });

  const visibles = modeles.filter((m) =>
    filtre === 'tous' ? true : filtre === 'actifs' ? m.actif : !m.actif,
  );

  // Objets stables pour ne pas réinitialiser les modales à chaque rendu.
  const modeleEdite = useMemo<Partial<ModeleProcessusInput> | null>(
    () =>
      modeleDialog.modele
        ? {
            id: modeleDialog.modele.id,
            nom: modeleDialog.modele.nom,
            typeProcessus: modeleDialog.modele.typeProcessus,
            description: modeleDialog.modele.description,
            actif: modeleDialog.modele.actif,
          }
        : null,
    [modeleDialog.modele],
  );
  const tacheEditee = useMemo<Partial<ModeleTacheInput> | null>(
    () =>
      tacheDialog.tache
        ? {
            id: tacheDialog.tache.id,
            modeleId: tacheDialog.tache.modeleId,
            libelle: tacheDialog.tache.libelle,
            description: tacheDialog.tache.description,
            responsable: tacheDialog.tache.responsable,
            delaiJours: tacheDialog.tache.delaiJours,
          }
        : null,
    [tacheDialog.tache],
  );

  function deplacer(id: string, sens: 'haut' | 'bas') {
    startTransition(async () => {
      const r = await actions.deplacerTache({ id, sens });
      if (!r.ok) {
        toast.error(r.error);
        return;
      }
    });
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <FilterPills
          aria-label="Filtrer les modèles"
          items={[
            {
              key: 'actifs',
              label: 'Actifs',
              count: modeles.filter((m) => m.actif).length,
              active: filtre === 'actifs',
              onClick: () => setFiltre('actifs'),
            },
            {
              key: 'inactifs',
              label: 'Inactifs',
              count: modeles.filter((m) => !m.actif).length,
              active: filtre === 'inactifs',
              onClick: () => setFiltre('inactifs'),
            },
            {
              key: 'tous',
              label: 'Tous',
              count: modeles.length,
              active: filtre === 'tous',
              onClick: () => setFiltre('tous'),
            },
          ]}
        />
        <Button size="sm" onClick={() => setModeleDialog({ ouvert: true, modele: null })}>
          <PlusIcon className="mr-1 size-4" /> Nouveau modèle
        </Button>
      </div>

      {visibles.length === 0 ? (
        <SirhVide>
          {modeles.length === 0
            ? 'Aucun modèle. Créez un parcours d’intégration ou de départ.'
            : 'Aucun modèle pour ce filtre.'}
        </SirhVide>
      ) : (
        visibles.map((m) => (
          <SirhBloc
            key={m.id}
            className={cn(!m.actif && 'opacity-75')}
            title={
              <span className="flex flex-wrap items-center gap-2">
                {m.nom}
                <TypeProcessusBadge type={m.typeProcessus} />
                {!m.actif && (
                  <Badge tone="neutral" shape="pill">
                    Inactif
                  </Badge>
                )}
              </span>
            }
            description={[
              m.description,
              `${m.taches.length} tâche${m.taches.length > 1 ? 's' : ''}`,
              m.nbProcessus > 0 ? `utilisé par ${m.nbProcessus} processus` : 'jamais utilisé',
            ]
              .filter(Boolean)
              .join(' · ')}
            actions={
              <>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setTacheDialog({ ouvert: true, modeleId: m.id, tache: null })}
                >
                  <PlusIcon className="mr-1 size-3.5" /> Ajouter une tâche
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setModeleDialog({ ouvert: true, modele: m })}
                  aria-label={`Modifier le modèle ${m.nom}`}
                >
                  <PencilIcon className="mr-1 size-3.5" /> Modifier
                </Button>
                <BoutonConfirmation
                  libelle={m.actif ? 'Désactiver' : 'Réactiver'}
                  question={
                    m.actif
                      ? 'Désactiver ce modèle ? Il ne sera plus proposé au lancement.'
                      : 'Réactiver ce modèle ?'
                  }
                  libelleConfirmer={m.actif ? 'Désactiver' : 'Réactiver'}
                  messageSucces={m.actif ? 'Modèle désactivé' : 'Modèle réactivé'}
                  variante="default"
                  onConfirm={() =>
                    actions.enregistrerModele({
                      id: m.id,
                      nom: m.nom,
                      typeProcessus: m.typeProcessus,
                      description: m.description,
                      actif: !m.actif,
                    })
                  }
                />
                {m.nbProcessus === 0 && (
                  <BoutonConfirmation
                    libelle="Supprimer"
                    question="Supprimer ce modèle et ses tâches ?"
                    libelleConfirmer="Supprimer"
                    messageSucces="Modèle supprimé"
                    onConfirm={() => actions.supprimerModele(m.id)}
                  />
                )}
              </>
            }
          >
            <TachesModele
              taches={m.taches}
              enCours={isPending}
              onDeplacer={deplacer}
              onModifier={(t) => setTacheDialog({ ouvert: true, modeleId: m.id, tache: t })}
              onSupprimer={actions.supprimerTache}
            />
          </SirhBloc>
        ))
      )}

      <ModeleDialog
        open={modeleDialog.ouvert}
        onOpenChange={(ouvert) => setModeleDialog((s) => ({ ...s, ouvert }))}
        modele={modeleEdite}
        onSubmit={actions.enregistrerModele}
      />
      <ModeleTacheDialog
        open={tacheDialog.ouvert}
        onOpenChange={(ouvert) => setTacheDialog((s) => ({ ...s, ouvert }))}
        modeleId={tacheDialog.modeleId}
        tache={tacheEditee}
        onSubmit={actions.enregistrerTache}
      />
    </div>
  );
}
