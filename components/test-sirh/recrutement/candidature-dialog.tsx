'use client';

import Link from 'next/link';
import { useState, useTransition, type ReactNode } from 'react';
import { toast } from 'sonner';

import { BoutonConfirmation } from '@/components/test-sirh/bouton-confirmation';
import { OptionSelect } from '@/components/test-sirh/option-select';
import { Button, buttonVariants } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import type { ActionResult } from '@/lib/common/action-result';
import { formatDateFr, nomComplet } from '@/lib/test-sirh/format';
import { formatEntretien } from '@/lib/test-sirh/recrutement/fuseau';
import { estEtapePipeline } from '@/lib/test-sirh/recrutement/pipeline';
import type { CandidatureOffre } from '@/lib/test-sirh/recrutement/queries';
import {
  ETAPES_PIPELINE,
  LIBELLES_ETAPE_CANDIDATURE,
  LIBELLES_MOTIF_REFUS,
  LIBELLES_SOURCE_CANDIDAT,
  type EtapeCandidature,
} from '@/lib/validation/test-sirh/enums';
import type {
  AvisCandidatureInput,
  CommentaireCandidatureInput,
  EntretienCandidatureInput,
  EtapeCandidatureInput,
  NoteCandidatureInput,
  RefusCandidatureInput,
} from '@/lib/validation/test-sirh/recrutement';

import { AvisSection } from './avis-section';
import { EtapeCandidatureBadge } from './badges-recrutement';
import { CommentaireForm, EntretienForm, RefusForm } from './candidature-formulaires';
import { NoteEtoiles } from './note-etoiles';

/** Server actions du pipeline utilisées par la fiche de candidature. */
export type ActionsCandidature = {
  deplacer: (input: EtapeCandidatureInput) => Promise<ActionResult>;
  refuser: (input: RefusCandidatureInput) => Promise<ActionResult>;
  desister: (id: string) => Promise<ActionResult>;
  rouvrir: (input: EtapeCandidatureInput) => Promise<ActionResult>;
  planifierEntretien: (input: EntretienCandidatureInput) => Promise<ActionResult>;
  noter: (input: NoteCandidatureInput) => Promise<ActionResult>;
  commenter: (input: CommentaireCandidatureInput) => Promise<ActionResult>;
  retirer: (id: string) => Promise<ActionResult>;
  ajouterAvis: (input: AvisCandidatureInput) => Promise<ActionResult<{ id: string }>>;
  supprimerAvis: (id: string) => Promise<ActionResult>;
};

type Props = {
  candidature: CandidatureOffre | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  base: string;
  peutGerer: boolean;
  utilisateurId: string;
  actions: ActionsCandidature;
  /** Ouvre la confirmation d'embauche (modale dédiée). */
  onEmbaucher: (id: string) => void;
};

function Rubrique({ titre, children }: { titre: string; children: ReactNode }) {
  return (
    <section className="space-y-2 border-t pt-4">
      <h3 className="text-sm font-semibold text-orange-700">{titre}</h3>
      {children}
    </section>
  );
}

/** Fiche d'une candidature : étapes, refus / désistement / réouverture, entretien, évaluation, avis. */
export function CandidatureDialog({
  candidature: c,
  open,
  onOpenChange,
  base,
  peutGerer,
  utilisateurId,
  actions,
  onEmbaucher,
}: Props) {
  const [isPending, startTransition] = useTransition();
  const [refusOuvert, setRefusOuvert] = useState(false);
  const [etapeCible, setEtapeCible] = useState<EtapeCandidature | null>(null);

  function executer(action: () => Promise<ActionResult>, succes: string) {
    startTransition(async () => {
      const r = await action();
      if (!r.ok) {
        toast.error(r.error);
        return;
      }
      toast.success(succes);
      setEtapeCible(null);
    });
  }

  function changerOuverture(ouvert: boolean) {
    if (!ouvert) {
      setRefusOuvert(false);
      setEtapeCible(null);
    }
    onOpenChange(ouvert);
  }

  if (!c) return null;

  const nom = nomComplet(c.prenom, c.nom);
  const active = estEtapePipeline(c.etape);
  const reouvrable = c.etape === 'refusee' || c.etape === 'desistement';
  const optionsEtapes = ETAPES_PIPELINE.filter((e) => e !== c.etape).map((e) => ({
    id: e,
    label: LIBELLES_ETAPE_CANDIDATURE[e],
  }));

  return (
    <Dialog open={open} onOpenChange={changerOuverture}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{nom}</DialogTitle>
          <DialogDescription>
            {LIBELLES_SOURCE_CANDIDAT[c.source]} · candidature du {formatDateFr(c.dateCandidature)}
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-wrap items-center gap-3 text-sm">
          <EtapeCandidatureBadge etape={c.etape} />
          {c.email && <span className="text-muted-foreground">{c.email}</span>}
          {c.telephone && <span className="text-muted-foreground">{c.telephone}</span>}
          <Link
            href={`${base}/recrutement/candidats/${c.candidatId}`}
            className="text-orange-700 underline-offset-4 hover:underline"
          >
            Fiche candidat
          </Link>
        </div>
        {c.etape === 'refusee' && c.motifRefus && (
          <p className="text-sm text-rose-700 dark:text-rose-300">
            Motif du refus : {LIBELLES_MOTIF_REFUS[c.motifRefus]}
          </p>
        )}

        {c.etape === 'embauche' && c.employeId && (
          <div className="flex flex-wrap gap-2">
            <Link
              href={`${base}/collaborateurs/${c.employeId}`}
              className={buttonVariants({ size: 'sm' })}
            >
              Dossier collaborateur
            </Link>
            <Link
              href={`${base}/onboarding`}
              className={buttonVariants({ variant: 'outline', size: 'sm' })}
            >
              Onboarding
            </Link>
          </div>
        )}

        {peutGerer && active && (
          <Rubrique titre="Étape du recrutement">
            <div className="flex flex-wrap items-center gap-2">
              <div className="w-56">
                <OptionSelect
                  options={optionsEtapes}
                  value={etapeCible}
                  onChange={(v) => setEtapeCible(v as EtapeCandidature | null)}
                  libelleAucune="Déplacer vers…"
                  aria-label="Déplacer vers l’étape"
                />
              </div>
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={!etapeCible || isPending}
                onClick={() =>
                  etapeCible &&
                  executer(
                    () => actions.deplacer({ id: c.id, etape: etapeCible }),
                    `Candidature déplacée : ${LIBELLES_ETAPE_CANDIDATURE[etapeCible]}`,
                  )
                }
              >
                Déplacer
              </Button>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Button type="button" size="sm" onClick={() => onEmbaucher(c.id)}>
                Embaucher
              </Button>
              <Button
                type="button"
                size="sm"
                variant="destructive"
                onClick={() => setRefusOuvert((o) => !o)}
                aria-expanded={refusOuvert}
              >
                Refuser…
              </Button>
              <BoutonConfirmation
                libelle="Désistement"
                question="Le candidat se désiste ?"
                libelleConfirmer="Confirmer"
                messageSucces="Désistement enregistré"
                variante="default"
                onConfirm={() => actions.desister(c.id)}
              />
              <BoutonConfirmation
                libelle="Retirer de l’offre"
                question="Retirer cette candidature ?"
                libelleConfirmer="Retirer"
                messageSucces="Candidature retirée"
                onConfirm={() => actions.retirer(c.id)}
              />
            </div>
            {refusOuvert && (
              <RefusForm
                key={c.id}
                candidatureId={c.id}
                onRefuser={actions.refuser}
                onAnnuler={() => setRefusOuvert(false)}
              />
            )}
          </Rubrique>
        )}

        {peutGerer && reouvrable && (
          <Rubrique titre="Réouverture">
            <p className="text-xs text-muted-foreground">
              Une candidature close ne bouge plus : la rouvrir la replace dans le pipeline.
            </p>
            <div className="flex flex-wrap items-center gap-2">
              <div className="w-56">
                <OptionSelect
                  options={optionsEtapes}
                  value={etapeCible}
                  onChange={(v) => setEtapeCible(v as EtapeCandidature | null)}
                  libelleAucune="Rouvrir vers…"
                  aria-label="Rouvrir vers l’étape"
                />
              </div>
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={!etapeCible || isPending}
                onClick={() =>
                  etapeCible &&
                  executer(
                    () => actions.rouvrir({ id: c.id, etape: etapeCible }),
                    'Candidature rouverte',
                  )
                }
              >
                Rouvrir
              </Button>
              <BoutonConfirmation
                libelle="Retirer de l’offre"
                question="Retirer cette candidature ?"
                libelleConfirmer="Retirer"
                messageSucces="Candidature retirée"
                onConfirm={() => actions.retirer(c.id)}
              />
            </div>
          </Rubrique>
        )}

        <Rubrique titre="Entretien">
          {peutGerer && active ? (
            <EntretienForm
              key={`${c.id}-${c.dateEntretien ?? 'aucun'}`}
              candidatureId={c.id}
              dateEntretien={c.dateEntretien}
              onPlanifier={actions.planifierEntretien}
            />
          ) : (
            <p className="text-sm text-muted-foreground">
              {c.dateEntretien
                ? `Le ${formatEntretien(c.dateEntretien)}`
                : 'Aucun entretien planifié.'}
            </p>
          )}
        </Rubrique>

        <Rubrique titre="Évaluation">
          <div className="flex items-center gap-2 text-sm">
            <span className="text-muted-foreground">Note globale</span>
            {peutGerer ? (
              <NoteEtoiles
                note={c.note}
                taille="md"
                disabled={isPending}
                onChange={(note) =>
                  executer(
                    () => actions.noter({ id: c.id, note }),
                    note ? `Note : ${note}/5` : 'Note retirée',
                  )
                }
              />
            ) : (
              <NoteEtoiles note={c.note} taille="md" />
            )}
          </div>
          {peutGerer ? (
            <CommentaireForm
              key={`${c.id}-${c.commentaire ?? ''}`}
              candidatureId={c.id}
              commentaire={c.commentaire}
              onCommenter={actions.commenter}
            />
          ) : (
            c.commentaire && (
              <p className="whitespace-pre-line text-sm text-muted-foreground">{c.commentaire}</p>
            )
          )}
        </Rubrique>

        <Rubrique titre={`Avis des évaluateurs (${c.avis.length})`}>
          <AvisSection
            key={c.id}
            candidatureId={c.id}
            avis={c.avis}
            utilisateurId={utilisateurId}
            peutGerer={peutGerer}
            onAjouter={actions.ajouterAvis}
            onSupprimer={actions.supprimerAvis}
          />
        </Rubrique>
      </DialogContent>
    </Dialog>
  );
}
