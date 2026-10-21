'use client';

import { useState, useTransition } from 'react';
import { toast } from 'sonner';

import { SirhBloc, SirhVide } from '@/components/test-sirh/sirh-bloc';
import type { ActionResult } from '@/lib/common/action-result';
import type { ResultatEmbauche } from '@/lib/test-sirh/recrutement/embauche';
import { regrouperParColonne } from '@/lib/test-sirh/recrutement/pipeline';
import type { CandidatureOffre } from '@/lib/test-sirh/recrutement/queries';
import {
  LIBELLES_ETAPE_CANDIDATURE,
  type EtapeCandidature,
  type TypeContratSirh,
} from '@/lib/validation/test-sirh/enums';
import type { EmbaucheInput } from '@/lib/validation/test-sirh/recrutement';

import { CandidatureDialog, type ActionsCandidature } from './candidature-dialog';
import { CarteCandidature } from './carte-candidature';
import { EmbaucheDialog } from './embauche-dialog';

export type ActionsPipeline = ActionsCandidature & {
  embaucher: (input: EmbaucheInput) => Promise<ActionResult<ResultatEmbauche>>;
};

type Props = {
  candidatures: CandidatureOffre[];
  /** Type de contrat de l'offre (proposé par défaut à l'embauche). */
  typeContratOffre: TypeContratSirh;
  /** Préfixe du module : `/<slug>/test-sirh`. */
  base: string;
  today: string;
  peutGerer: boolean;
  utilisateurId: string;
  actions: ActionsPipeline;
};

const TITRES_CLOSES: Partial<Record<EtapeCandidature, string>> = {
  embauche: 'Embauches',
  refusee: 'Refus',
  desistement: 'Désistements',
};

/**
 * Pipeline d'une offre en colonnes (kanban SANS glisser-déposer) : une colonne
 * par étape active (`ETAPES_PIPELINE`), puis le volet des candidatures closes.
 * Les déplacements passent par les boutons des cartes ou la fiche candidature.
 */
export function PipelineOffre({
  candidatures,
  typeContratOffre,
  base,
  today,
  peutGerer,
  utilisateurId,
  actions,
}: Props) {
  const [isPending, startTransition] = useTransition();
  const [detailId, setDetailId] = useState<string | null>(null);
  const [embaucheId, setEmbaucheId] = useState<string | null>(null);

  const { colonnes, closes } = regrouperParColonne(candidatures);
  const detail = candidatures.find((c) => c.id === detailId) ?? null;
  const aEmbaucher = candidatures.find((c) => c.id === embaucheId) ?? null;
  const nbCloses = closes.reduce((n, g) => n + g.candidatures.length, 0);

  function deplacer(id: string, etape: EtapeCandidature) {
    startTransition(async () => {
      const r = await actions.deplacer({ id, etape });
      if (!r.ok) {
        toast.error(r.error);
        return;
      }
      toast.success(`Candidature déplacée : ${LIBELLES_ETAPE_CANDIDATURE[etape]}`);
    });
  }

  function ouvrirEmbauche(id: string) {
    setDetailId(null);
    setEmbaucheId(id);
  }

  const carte = (c: CandidatureOffre) => (
    <CarteCandidature
      key={c.id}
      candidature={c}
      base={base}
      today={today}
      peutGerer={peutGerer}
      occupe={isPending}
      onOuvrir={setDetailId}
      onDeplacer={deplacer}
      onEmbaucher={ouvrirEmbauche}
    />
  );

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-5">
        {colonnes.map((col) => (
          <section
            key={col.etape}
            aria-label={`Étape ${LIBELLES_ETAPE_CANDIDATURE[col.etape]}`}
            className="flex min-w-0 flex-col rounded-xl border bg-muted/30"
          >
            <header className="flex items-center justify-between border-b px-3 py-2">
              <h3 className="text-sm font-semibold text-orange-700">
                {LIBELLES_ETAPE_CANDIDATURE[col.etape]}
              </h3>
              <span className="text-xs tabular-nums text-muted-foreground">
                {col.candidatures.length}
              </span>
            </header>
            <div className="flex flex-col gap-2 p-2">
              {col.candidatures.length === 0 ? (
                <p className="py-4 text-center text-xs text-muted-foreground">Aucune candidature</p>
              ) : (
                col.candidatures.map(carte)
              )}
            </div>
          </section>
        ))}
      </div>

      <SirhBloc
        title={`Clôturées (${nbCloses})`}
        description="Embauches, refus et désistements. Une candidature close ne bouge plus, sauf réouverture explicite."
      >
        {nbCloses === 0 ? (
          <SirhVide>Aucune candidature close pour l’instant.</SirhVide>
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {closes.map((groupe) => (
              <div key={groupe.etape} className="min-w-0 space-y-2">
                <h3 className="text-xs font-medium uppercase tracking-widest text-muted-foreground">
                  {TITRES_CLOSES[groupe.etape] ?? LIBELLES_ETAPE_CANDIDATURE[groupe.etape]} (
                  {groupe.candidatures.length})
                </h3>
                {groupe.candidatures.length === 0 ? (
                  <p className="text-xs text-muted-foreground">—</p>
                ) : (
                  groupe.candidatures.map(carte)
                )}
              </div>
            ))}
          </div>
        )}
      </SirhBloc>

      <CandidatureDialog
        key={detailId ?? 'aucune'}
        candidature={detail}
        open={detail !== null}
        onOpenChange={(ouvert) => {
          if (!ouvert) setDetailId(null);
        }}
        base={base}
        peutGerer={peutGerer}
        utilisateurId={utilisateurId}
        actions={actions}
        onEmbaucher={ouvrirEmbauche}
      />

      {peutGerer && (
        <EmbaucheDialog
          open={aEmbaucher !== null}
          onOpenChange={(ouvert) => {
            if (!ouvert) setEmbaucheId(null);
          }}
          candidature={aEmbaucher}
          typeContratDefaut={typeContratOffre}
          today={today}
          base={base}
          onSubmit={actions.embaucher}
        />
      )}
    </div>
  );
}
