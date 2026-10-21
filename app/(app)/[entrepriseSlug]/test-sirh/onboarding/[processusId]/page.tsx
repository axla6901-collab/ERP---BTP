import { notFound } from 'next/navigation';

import { PageToolbar } from '@/components/layout/page-toolbar';
import {
  ActionsProcessus,
  PropositionTerminer,
  SuppressionProcessus,
} from '@/components/test-sirh/onboarding/actions-processus';
import {
  BarreProgression,
  StatutProcessusBadge,
  TypeProcessusBadge,
} from '@/components/test-sirh/onboarding/badges-onboarding';
import { ChecklistTaches } from '@/components/test-sirh/onboarding/checklist-taches';
import { SirhBloc } from '@/components/test-sirh/sirh-bloc';
import { aujourdhuiIso } from '@/lib/test-sirh/calendrier';
import { baseSirh, exigerContexteSirhPage } from '@/lib/test-sirh/contexte';
import { formatDateFr, formatDateHeure } from '@/lib/test-sirh/format';
import { libelleDateReference } from '@/lib/test-sirh/onboarding/planification';
import { changerStatutProcessus, supprimerProcessus } from '@/lib/test-sirh/onboarding/processus';
import { lireProcessus } from '@/lib/test-sirh/onboarding/queries';
import {
  basculerTache,
  changerStatutTache,
  enregistrerTache,
  supprimerTache,
} from '@/lib/test-sirh/onboarding/taches';
import { peutGererSirh, ROLES_SIRH_LECTURE } from '@/lib/test-sirh/permissions';
import { listerUtilisateursOptions, type OptionSirh } from '@/lib/test-sirh/referentiels';
import { LIBELLES_TYPE_PROCESSUS } from '@/lib/validation/test-sirh/enums';

/** Ligne « libellé : valeur » du rail de synthèse. */
function Info({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-3 text-sm">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="text-right tabular-nums">{children}</dd>
    </div>
  );
}

/** Test SIRH › Onboarding › fiche d'un processus (checklist des tâches). */
export default async function ProcessusFichePage({
  params,
}: {
  params: Promise<{ entrepriseSlug: string; processusId: string }>;
}) {
  const ctx = await exigerContexteSirhPage(ROLES_SIRH_LECTURE);
  const { processusId } = await params;
  const peutGerer = peutGererSirh(ctx.utilisateur.role);
  const [fiche, utilisateurs] = await Promise.all([
    lireProcessus(processusId),
    peutGerer ? listerUtilisateursOptions() : Promise.resolve<OptionSirh[]>([]),
  ]);
  if (!fiche) notFound();

  const base = baseSirh(ctx);
  const today = aujourdhuiIso();
  const enCours = fiche.statut === 'en_cours';

  return (
    <div className="space-y-5">
      <PageToolbar
        title={fiche.libelle}
        subtitle={`${fiche.employeNom} · ${LIBELLES_TYPE_PROCESSUS[fiche.typeProcessus]} · ${libelleDateReference(fiche.typeProcessus)} : ${formatDateFr(fiche.dateReference)}`}
        backHref={`${base}/onboarding`}
        backLabel="Onboarding"
        actions={
          peutGerer ? (
            <ActionsProcessus
              processusId={fiche.id}
              statut={fiche.statut}
              ouvertes={fiche.ouvertes}
              changerStatut={async (input) => {
                'use server';
                return changerStatutProcessus(input);
              }}
            />
          ) : (
            <StatutProcessusBadge statut={fiche.statut} />
          )
        }
      />

      {peutGerer && enCours && fiche.terminable && (
        <PropositionTerminer
          processusId={fiche.id}
          changerStatut={async (input) => {
            'use server';
            return changerStatutProcessus(input);
          }}
        />
      )}

      <div className="flex flex-col gap-5 lg:flex-row lg:items-start">
        <div className="min-w-0 flex-1">
          <SirhBloc
            title="Checklist"
            description={
              peutGerer
                ? 'Cochez les tâches réalisées ; les échéances dépassées apparaissent en rose.'
                : 'Vous pouvez cocher les tâches qui vous sont assignées.'
            }
          >
            <ChecklistTaches
              processusId={fiche.id}
              processusOuvert={enCours}
              taches={fiche.taches}
              today={today}
              peutGerer={peutGerer}
              utilisateurId={ctx.utilisateur.id}
              utilisateurs={utilisateurs}
              actions={{
                basculer: async (id, faite) => {
                  'use server';
                  return basculerTache(id, faite);
                },
                changerStatut: async (input) => {
                  'use server';
                  return changerStatutTache(input);
                },
                enregistrer: async (input) => {
                  'use server';
                  return enregistrerTache(input);
                },
                supprimer: async (id) => {
                  'use server';
                  return supprimerTache(id);
                },
              }}
            />
          </SirhBloc>
        </div>

        <aside className="space-y-4 lg:w-80 lg:shrink-0">
          <SirhBloc title="Synthèse">
            <div className="space-y-4">
              <div className="flex flex-wrap items-center gap-2">
                <TypeProcessusBadge type={fiche.typeProcessus} />
                <StatutProcessusBadge statut={fiche.statut} />
              </div>
              <BarreProgression
                faites={fiche.faites}
                total={fiche.total}
                pourcent={fiche.pourcent}
              />
              <dl className="space-y-2">
                <Info label="Collaborateur">{fiche.employeNom}</Info>
                <Info label={libelleDateReference(fiche.typeProcessus)}>
                  {formatDateFr(fiche.dateReference)}
                </Info>
                <Info label="Prochaine échéance">{formatDateFr(fiche.prochaineEcheance)}</Info>
                <Info label="Tâches en retard">
                  <span
                    className={
                      fiche.enRetard > 0
                        ? 'font-medium text-rose-700 dark:text-rose-300'
                        : undefined
                    }
                  >
                    {fiche.enRetard}
                  </span>
                </Info>
                <Info label="Modèle">{fiche.modeleNom ?? '—'}</Info>
                <Info label="Lancé le">{formatDateHeure(fiche.createdAt)}</Info>
                {fiche.lancePar && <Info label="Par">{fiche.lancePar}</Info>}
              </dl>
            </div>
          </SirhBloc>
        </aside>
      </div>

      {peutGerer && (
        <SuppressionProcessus
          redirection={`${base}/onboarding`}
          supprimer={async () => {
            'use server';
            return supprimerProcessus(processusId);
          }}
        />
      )}
    </div>
  );
}
