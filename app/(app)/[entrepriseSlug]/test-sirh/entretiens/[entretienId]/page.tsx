import Link from 'next/link';
import { notFound } from 'next/navigation';

import { PageToolbar } from '@/components/layout/page-toolbar';
import { BoutonConfirmation } from '@/components/test-sirh/bouton-confirmation';
import {
  LIBELLES_COURTS_TYPE_ENTRETIEN,
  StatutEntretienBadge,
} from '@/components/test-sirh/entretiens/badges';
import { CompteRenduForm } from '@/components/test-sirh/entretiens/compte-rendu-form';
import { ObjectifsSection } from '@/components/test-sirh/entretiens/objectifs-section';
import { PlanificationEntretien } from '@/components/test-sirh/entretiens/planification-dialog';
import { SirhBloc, SirhVide } from '@/components/test-sirh/sirh-bloc';
import { aujourdhuiIso } from '@/lib/test-sirh/calendrier';
import { baseSirh, exigerContexteSirhPage } from '@/lib/test-sirh/contexte';
import {
  enregistrerCompteRendu,
  planifierEntretien,
  supprimerEntretien,
} from '@/lib/test-sirh/entretiens/entretiens';
import { enregistrerObjectif, supprimerObjectif } from '@/lib/test-sirh/entretiens/objectifs';
import {
  lireEntretien,
  listerEntretiensEmploye,
  listerObjectifsEmploye,
} from '@/lib/test-sirh/entretiens/queries';
import { compteRenduVerrouille, entretienSupprimable } from '@/lib/test-sirh/entretiens/statuts';
import { formatDateFr } from '@/lib/test-sirh/format';
import { peutGererSirh, ROLES_SIRH_LECTURE } from '@/lib/test-sirh/permissions';
import { listerEmployesOptions } from '@/lib/test-sirh/referentiels';
import { LIBELLES_TYPE_ENTRETIEN } from '@/lib/validation/test-sirh/enums';

function Ligne({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-3 py-1.5">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="text-right text-sm">{children}</dd>
    </div>
  );
}

/** Test SIRH › Entretiens › fiche : compte rendu, objectifs, planification. */
export default async function EntretienPage({
  params,
}: {
  params: Promise<{ entrepriseSlug: string; entretienId: string }>;
}) {
  const ctx = await exigerContexteSirhPage(ROLES_SIRH_LECTURE);
  const { entretienId } = await params;
  const resultat = await lireEntretien(entretienId);
  if (!resultat) notFound();
  const { entretien, estEvaluateur } = resultat;

  const peutGerer = peutGererSirh(ctx.utilisateur.role);
  const [objectifs, historique, employes] = await Promise.all([
    listerObjectifsEmploye(entretien.employeId),
    listerEntretiensEmploye(entretien.employeId),
    peutGerer ? listerEmployesOptions() : Promise.resolve([]),
  ]);

  const base = baseSirh(ctx);
  const today = aujourdhuiIso();
  const verrouille = compteRenduVerrouille(entretien.statut);
  const peutEcrire = peutGerer || estEvaluateur;
  const autres = historique.filter((h) => h.id !== entretien.id);
  // Évaluateurs possibles : collaborateurs actifs hors salarié évalué, + l'évaluateur actuel
  // (même devenu inactif) pour que la modale affiche la valeur enregistrée.
  const evaluateurs = employes
    .filter((e) => e.id !== entretien.employeId)
    .map((e) => ({ id: e.id, label: e.label }));
  if (
    entretien.evaluateurId &&
    entretien.evaluateurNom &&
    !evaluateurs.some((e) => e.id === entretien.evaluateurId)
  ) {
    evaluateurs.unshift({ id: entretien.evaluateurId, label: entretien.evaluateurNom });
  }
  const motifLectureSeule = verrouille
    ? entretien.statut === 'signe'
      ? 'Entretien signé : le compte rendu est verrouillé.'
      : 'Entretien annulé : le compte rendu est verrouillé.'
    : 'Seuls la RH et l’évaluateur désigné peuvent compléter ce compte rendu.';

  return (
    <div className="space-y-5">
      <PageToolbar
        title={`Entretien — ${entretien.employeNom}`}
        subtitle={`${LIBELLES_TYPE_ENTRETIEN[entretien.typeEntretien]} · ${entretien.campagneLibelle ?? 'Hors campagne'}`}
        backHref={`${base}/entretiens/liste`}
        backLabel="Entretiens"
        actions={
          <>
            <StatutEntretienBadge statut={entretien.statut} />
            {peutGerer && entretienSupprimable(entretien.statut) && (
              <BoutonConfirmation
                libelle="Supprimer"
                question="Supprimer cet entretien ?"
                libelleConfirmer="Supprimer"
                messageSucces="Entretien supprimé"
                redirection={`${base}/entretiens/liste`}
                onConfirm={async () => {
                  'use server';
                  return supprimerEntretien(entretien.id);
                }}
              />
            )}
          </>
        }
      />

      <div className="flex flex-col gap-5 lg:flex-row lg:items-start">
        <div className="min-w-0 flex-1 space-y-5">
          <SirhBloc
            title="Compte rendu"
            description="Bilan de la période, points forts, axes de progrès et souhaits du salarié. Un entretien signé est verrouillé."
          >
            <CompteRenduForm
              valeurs={{
                id: entretien.id,
                statut: entretien.statut,
                datePrevue: entretien.datePrevue,
                dateRealisation: entretien.dateRealisation,
                noteGlobale: entretien.noteGlobale,
                synthese: entretien.synthese,
                pointsForts: entretien.pointsForts,
                axesAmelioration: entretien.axesAmelioration,
                souhaitsFormation: entretien.souhaitsFormation,
                souhaitsEvolution: entretien.souhaitsEvolution,
                commentaireSalarie: entretien.commentaireSalarie,
              }}
              statutActuel={entretien.statut}
              modifiable={peutEcrire && !verrouille}
              motifLectureSeule={motifLectureSeule}
              onSubmit={async (values) => {
                'use server';
                return enregistrerCompteRendu(values);
              }}
            />
          </SirhBloc>

          <SirhBloc
            title="Objectifs"
            description="Objectifs individuels du collaborateur ; ceux fixés pendant cet entretien y sont rattachés."
          >
            <ObjectifsSection
              objectifs={objectifs}
              employeId={entretien.employeId}
              entretienId={entretien.id}
              peutGererTout={peutGerer}
              peutGererRattaches={estEvaluateur}
              today={today}
              actions={{
                enregistrer: async (input) => {
                  'use server';
                  return enregistrerObjectif(input);
                },
                supprimer: async (id) => {
                  'use server';
                  return supprimerObjectif(id);
                },
              }}
            />
          </SirhBloc>
        </div>

        <aside className="space-y-5 lg:w-80 lg:shrink-0">
          <SirhBloc
            title="Synthèse"
            actions={
              peutGerer && !verrouille ? (
                <PlanificationEntretien
                  valeurs={{
                    id: entretien.id,
                    evaluateurId: entretien.evaluateurId,
                    typeEntretien: entretien.typeEntretien,
                    datePrevue: entretien.datePrevue,
                  }}
                  evaluateurs={evaluateurs}
                  onSubmit={async (values) => {
                    'use server';
                    return planifierEntretien(values);
                  }}
                />
              ) : null
            }
          >
            <dl className="divide-y">
              <Ligne label="Collaborateur">
                {entretien.employeNom}
                {entretien.employeMatricule && (
                  <span className="block text-xs text-muted-foreground">
                    {entretien.employeMatricule}
                  </span>
                )}
              </Ligne>
              <Ligne label="Évaluateur">{entretien.evaluateurNom ?? 'Non désigné'}</Ligne>
              <Ligne label="Type">{LIBELLES_COURTS_TYPE_ENTRETIEN[entretien.typeEntretien]}</Ligne>
              <Ligne label="Campagne">
                {entretien.campagneId && entretien.campagneLibelle ? (
                  <Link
                    href={`${base}/entretiens/liste?campagne=${entretien.campagneId}`}
                    className="underline-offset-2 hover:underline"
                  >
                    {entretien.campagneLibelle}
                  </Link>
                ) : (
                  'Hors campagne'
                )}
              </Ligne>
              <Ligne label="Date prévue">{formatDateFr(entretien.datePrevue)}</Ligne>
              <Ligne label="Réalisé le">{formatDateFr(entretien.dateRealisation)}</Ligne>
              <Ligne label="Note globale">
                {entretien.noteGlobale !== null ? `${entretien.noteGlobale} / 5` : '—'}
              </Ligne>
            </dl>
            {estEvaluateur && (
              <p className="mt-3 text-xs text-orange-700">
                Vous êtes l’évaluateur de cet entretien.
              </p>
            )}
          </SirhBloc>

          <SirhBloc title="Historique" description="Autres entretiens du collaborateur.">
            {autres.length === 0 ? (
              <SirhVide>Aucun autre entretien.</SirhVide>
            ) : (
              <ul className="divide-y text-sm">
                {autres.map((h) => (
                  <li key={h.id} className="flex items-center justify-between gap-2 py-2">
                    <Link
                      href={`${base}/entretiens/${h.id}`}
                      className="min-w-0 underline-offset-2 hover:underline"
                    >
                      <span className="block truncate font-medium">
                        {LIBELLES_COURTS_TYPE_ENTRETIEN[h.typeEntretien]}
                      </span>
                      <span className="block text-xs tabular-nums text-muted-foreground">
                        {formatDateFr(h.dateRealisation ?? h.datePrevue)}
                      </span>
                    </Link>
                    <StatutEntretienBadge statut={h.statut} />
                  </li>
                ))}
              </ul>
            )}
          </SirhBloc>
        </aside>
      </div>
    </div>
  );
}
