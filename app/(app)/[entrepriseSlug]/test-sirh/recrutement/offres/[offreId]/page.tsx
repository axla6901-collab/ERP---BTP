import { notFound } from 'next/navigation';

import { PageToolbar } from '@/components/layout/page-toolbar';
import { SirhBloc } from '@/components/test-sirh/sirh-bloc';
import { ActionsStatutOffre } from '@/components/test-sirh/recrutement/actions-statut-offre';
import { BoutonAjoutCandidature } from '@/components/test-sirh/recrutement/ajout-candidature-dialog';
import { StatutOffreBadge } from '@/components/test-sirh/recrutement/badges-recrutement';
import { BoutonModifierOffre } from '@/components/test-sirh/recrutement/offre-dialog';
import { PipelineOffre } from '@/components/test-sirh/recrutement/pipeline-offre';
import { StatCard, StatGrid } from '@/components/ui/stat-card';
import { aujourdhuiIso } from '@/lib/test-sirh/calendrier';
import { baseSirh, exigerContexteSirhPage } from '@/lib/test-sirh/contexte';
import { formatDateFr } from '@/lib/test-sirh/format';
import { peutGererSirh, ROLES_SIRH_LECTURE } from '@/lib/test-sirh/permissions';
import {
  ajouterAvis,
  ajouterCandidature,
  commenterCandidature,
  deplacerCandidature,
  marquerDesistement,
  noterCandidature,
  planifierEntretien,
  refuserCandidature,
  retirerCandidature,
  rouvrirCandidature,
  supprimerAvis,
} from '@/lib/test-sirh/recrutement/candidatures';
import { embaucherCandidat } from '@/lib/test-sirh/recrutement/embauche';
import { changerStatutOffre, enregistrerOffre } from '@/lib/test-sirh/recrutement/offres';
import {
  formatFourchetteSalaire,
  offreAccepteCandidatures,
  statistiquesPipeline,
} from '@/lib/test-sirh/recrutement/pipeline';
import {
  lireOffre,
  listerCandidatsOptions,
  listerCandidaturesOffre,
} from '@/lib/test-sirh/recrutement/queries';
import {
  listerEmployesOptions,
  listerPostesOptions,
  listerSitesOptions,
  type OptionEmploye,
  type OptionSirh,
} from '@/lib/test-sirh/referentiels';
import { LIBELLES_TYPE_CONTRAT } from '@/lib/validation/test-sirh/enums';

/** Test SIRH › Recrutement › Pipeline d'une offre (Factorial ats/Application + HiringStage). */
export default async function OffrePipelinePage({
  params,
}: {
  params: Promise<{ entrepriseSlug: string; offreId: string }>;
}) {
  const ctx = await exigerContexteSirhPage(ROLES_SIRH_LECTURE);
  const { offreId } = await params;
  const peutGerer = peutGererSirh(ctx.utilisateur.role);

  const [offre, candidatures, candidats, postes, sites, employes] = await Promise.all([
    lireOffre(offreId),
    listerCandidaturesOffre(offreId),
    peutGerer ? listerCandidatsOptions() : Promise.resolve<OptionSirh[]>([]),
    peutGerer ? listerPostesOptions() : Promise.resolve<OptionSirh[]>([]),
    peutGerer ? listerSitesOptions() : Promise.resolve<OptionSirh[]>([]),
    peutGerer
      ? listerEmployesOptions({ inclureInactifs: true })
      : Promise.resolve<OptionEmploye[]>([]),
  ]);
  if (!offre) notFound();

  const base = baseSirh(ctx);
  const today = aujourdhuiIso();
  const stats = statistiquesPipeline(candidatures, new Date());
  const dejaPositionnes = new Set(candidatures.map((c) => c.candidatId));
  const optionsOffre = {
    postes,
    sites,
    responsables: employes.map((e) => ({
      id: e.id,
      label: e.actif ? e.label : `${e.label} (inactif)`,
      actif: e.actif,
    })),
  };

  return (
    <div className="space-y-5">
      <PageToolbar
        title={offre.titre}
        subtitle={[
          offre.reference,
          LIBELLES_TYPE_CONTRAT[offre.typeContrat],
          offre.siteNom,
          `${offre.nbPostes} poste${offre.nbPostes > 1 ? 's' : ''}`,
        ]
          .filter(Boolean)
          .join(' · ')}
        backHref={`${base}/recrutement`}
        backLabel="Recrutement"
        actions={
          <>
            <StatutOffreBadge statut={offre.statut} />
            {peutGerer && (
              <ActionsStatutOffre
                offreId={offre.id}
                statut={offre.statut}
                onChanger={async (input) => {
                  'use server';
                  return changerStatutOffre(input);
                }}
              />
            )}
            {peutGerer && (
              <BoutonModifierOffre
                offre={offre}
                options={optionsOffre}
                onSubmit={async (input) => {
                  'use server';
                  return enregistrerOffre(input);
                }}
              />
            )}
            {peutGerer && offreAccepteCandidatures(offre.statut) && (
              <BoutonAjoutCandidature
                offreId={offre.id}
                candidats={candidats.filter((c) => !dejaPositionnes.has(c.id))}
                today={today}
                onSubmit={async (input) => {
                  'use server';
                  return ajouterCandidature(input);
                }}
              />
            )}
          </>
        }
      />

      <StatGrid>
        <StatCard label="Candidatures en cours" value={stats.actives} tone="amber" />
        <StatCard
          label="Entretiens planifiés"
          value={stats.entretiensPlanifies}
          tone="sky"
          hint="à venir"
        />
        <StatCard
          label="Postes pourvus"
          value={`${stats.embauches} / ${offre.nbPostes}`}
          tone="emerald"
        />
        <StatCard label="Refus & désistements" value={stats.closesSansEmbauche} />
      </StatGrid>

      <PipelineOffre
        candidatures={candidatures}
        typeContratOffre={offre.typeContrat}
        base={base}
        today={today}
        peutGerer={peutGerer}
        utilisateurId={ctx.utilisateur.id}
        actions={{
          deplacer: async (input) => {
            'use server';
            return deplacerCandidature(input);
          },
          refuser: async (input) => {
            'use server';
            return refuserCandidature(input);
          },
          desister: async (id) => {
            'use server';
            return marquerDesistement(id);
          },
          rouvrir: async (input) => {
            'use server';
            return rouvrirCandidature(input);
          },
          planifierEntretien: async (input) => {
            'use server';
            return planifierEntretien(input);
          },
          noter: async (input) => {
            'use server';
            return noterCandidature(input);
          },
          commenter: async (input) => {
            'use server';
            return commenterCandidature(input);
          },
          retirer: async (id) => {
            'use server';
            return retirerCandidature(id);
          },
          ajouterAvis: async (input) => {
            'use server';
            return ajouterAvis(input);
          },
          supprimerAvis: async (id) => {
            'use server';
            return supprimerAvis(id);
          },
          embaucher: async (input) => {
            'use server';
            return embaucherCandidat(input);
          },
        }}
      />

      <SirhBloc title="Détail de l’offre">
        <dl className="grid grid-cols-1 gap-4 text-sm sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <dt className="text-xs text-muted-foreground">Poste</dt>
            <dd>{offre.posteLibelle ?? '—'}</dd>
          </div>
          <div>
            <dt className="text-xs text-muted-foreground">Responsable du recrutement</dt>
            <dd>{offre.responsableNom ?? '—'}</dd>
          </div>
          <div>
            <dt className="text-xs text-muted-foreground">Salaire brut mensuel</dt>
            <dd className="tabular-nums">
              {formatFourchetteSalaire(offre.salaireMin, offre.salaireMax)}
            </dd>
          </div>
          <div>
            <dt className="text-xs text-muted-foreground">Publication / clôture</dt>
            <dd className="tabular-nums">
              {formatDateFr(offre.datePublication)} → {formatDateFr(offre.dateCloture)}
            </dd>
          </div>
        </dl>
        {(offre.description || offre.profilRecherche) && (
          <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <h3 className="text-xs font-medium uppercase tracking-widest text-muted-foreground">
                Description du poste
              </h3>
              <p className="mt-1 whitespace-pre-line text-sm">{offre.description ?? '—'}</p>
            </div>
            <div>
              <h3 className="text-xs font-medium uppercase tracking-widest text-muted-foreground">
                Profil recherché
              </h3>
              <p className="mt-1 whitespace-pre-line text-sm">{offre.profilRecherche ?? '—'}</p>
            </div>
          </div>
        )}
      </SirhBloc>
    </div>
  );
}
