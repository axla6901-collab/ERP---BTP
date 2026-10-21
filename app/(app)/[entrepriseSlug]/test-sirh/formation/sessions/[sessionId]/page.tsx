import { notFound } from 'next/navigation';

import { PageToolbar } from '@/components/layout/page-toolbar';
import { BarreProgression } from '@/components/test-sirh/entretiens/barre-progression';
import { StatutSessionBadge } from '@/components/test-sirh/formation/badges';
import { InscriptionsSection } from '@/components/test-sirh/formation/inscriptions-section';
import { SessionActions } from '@/components/test-sirh/formation/session-actions';
import { SirhBloc } from '@/components/test-sirh/sirh-bloc';
import { aujourdhuiIso } from '@/lib/test-sirh/calendrier';
import { baseSirh, exigerContexteSirhPage } from '@/lib/test-sirh/contexte';
import {
  inscrireEmployes,
  modifierInscription,
  retirerInscription,
} from '@/lib/test-sirh/formation/inscriptions';
import { listerFormationsOptions, lireSession } from '@/lib/test-sirh/formation/queries';
import {
  cloturerSession,
  enregistrerSession,
  supprimerSession,
} from '@/lib/test-sirh/formation/sessions';
import {
  libelleDatesSession,
  libelleValidite,
  tauxRemplissage,
} from '@/lib/test-sirh/formation/validite';
import { formatEuro, formatHeures } from '@/lib/test-sirh/format';
import { peutGererSirh, ROLES_SIRH_LECTURE } from '@/lib/test-sirh/permissions';
import { listerEmployesOptions } from '@/lib/test-sirh/referentiels';

function Ligne({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-3 py-1.5">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="text-right text-sm">{children}</dd>
    </div>
  );
}

/** Test SIRH › Formation › fiche session : participants, présence, résultats. */
export default async function SessionFormationPage({
  params,
}: {
  params: Promise<{ entrepriseSlug: string; sessionId: string }>;
}) {
  const ctx = await exigerContexteSirhPage(ROLES_SIRH_LECTURE);
  const { sessionId } = await params;
  const peutGerer = peutGererSirh(ctx.utilisateur.role);
  const [session, employes, formations] = await Promise.all([
    lireSession(sessionId),
    peutGerer ? listerEmployesOptions() : Promise.resolve([]),
    peutGerer ? listerFormationsOptions() : Promise.resolve([]),
  ]);
  if (!session) notFound();

  const base = baseSirh(ctx);
  const taux = tauxRemplissage(session.placesMax, session.nbInscrits);
  const id = session.id;

  return (
    <div className="space-y-5">
      <PageToolbar
        title={session.formationIntitule}
        subtitle={`Session du ${libelleDatesSession(session.dateDebut, session.dateFin)}${session.lieu ? ` · ${session.lieu}` : ''}`}
        backHref={`${base}/formation/sessions`}
        backLabel="Sessions"
        actions={
          <>
            <StatutSessionBadge statut={session.statut} />
            {peutGerer && (
              <SessionActions
                session={{
                  id: session.id,
                  formationId: session.formationId,
                  dateDebut: session.dateDebut,
                  dateFin: session.dateFin,
                  lieu: session.lieu,
                  formateur: session.formateur,
                  placesMax: session.placesMax,
                  coutHt: session.coutHt,
                  statut: session.statut,
                  notes: session.notes,
                }}
                formations={formations.map((f) => ({ id: f.id, label: f.label, actif: f.actif }))}
                peutCloturer={session.statut !== 'annulee' && session.statut !== 'realisee'}
                retour={`${base}/formation/sessions`}
                actions={{
                  enregistrer: async (input) => {
                    'use server';
                    return enregistrerSession(input);
                  },
                  cloturer: async () => {
                    'use server';
                    return cloturerSession(id);
                  },
                  supprimer: async () => {
                    'use server';
                    return supprimerSession(id);
                  },
                }}
              />
            )}
          </>
        }
      />

      <div className="flex flex-col gap-5 lg:flex-row lg:items-start">
        <div className="min-w-0 flex-1">
          <SirhBloc
            title="Participants"
            description="Inscriptions, présence et résultats. « Clôturer la session » passe les inscrits présents et réussis par défaut."
          >
            <InscriptionsSection
              sessionId={session.id}
              sessionStatut={session.statut}
              dateFinSession={session.dateFin}
              validiteMois={session.formationValiditeMois}
              placesRestantes={session.placesRestantes}
              inscriptions={session.inscriptions.map((i) => ({
                id: i.id,
                employeId: i.employeId,
                employeNom: i.employeNom,
                matricule: i.matricule,
                statut: i.statut,
                resultat: i.resultat,
                heuresRealisees: i.heuresRealisees,
                dateValidite: i.dateValidite,
                commentaire: i.commentaire,
              }))}
              employes={employes.map((e) => ({ id: e.id, label: e.label, matricule: e.matricule }))}
              peutGerer={peutGerer}
              today={aujourdhuiIso()}
              actions={{
                inscrire: async (input) => {
                  'use server';
                  return inscrireEmployes(input);
                },
                modifier: async (input) => {
                  'use server';
                  return modifierInscription(input);
                },
                retirer: async (inscriptionId) => {
                  'use server';
                  return retirerInscription(inscriptionId);
                },
              }}
            />
          </SirhBloc>
        </div>

        <aside className="space-y-5 lg:w-80 lg:shrink-0">
          <SirhBloc title="Session">
            <dl className="divide-y">
              <Ligne label="Dates">{libelleDatesSession(session.dateDebut, session.dateFin)}</Ligne>
              <Ligne label="Lieu">{session.lieu ?? '—'}</Ligne>
              <Ligne label="Formateur">{session.formateur ?? '—'}</Ligne>
              <Ligne label="Durée catalogue">{formatHeures(session.formationDureeHeures)}</Ligne>
              <Ligne label="Validité">{libelleValidite(session.formationValiditeMois)}</Ligne>
              <Ligne label="Participants">
                <span className="tabular-nums">
                  {session.nbInscrits}
                  {session.placesMax !== null ? ` / ${session.placesMax}` : ''}
                </span>
              </Ligne>
              <Ligne label="Présents">
                <span className="tabular-nums">{session.nbPresents}</span>
              </Ligne>
              <Ligne label="Coût HT">
                {formatEuro(session.coutEstime)}
                {session.coutHt === null && (
                  <span className="block text-xs text-muted-foreground">
                    estimé (catalogue × participants)
                  </span>
                )}
              </Ligne>
            </dl>
            {taux !== null && (
              <div className="mt-3 space-y-1">
                <BarreProgression
                  valeur={taux}
                  ton={taux >= 100 ? 'rose' : 'amber'}
                  libelle="Remplissage de la session"
                />
                <p className="text-xs tabular-nums text-muted-foreground">Remplissage {taux} %</p>
              </div>
            )}
            {session.notes && (
              <p className="mt-3 whitespace-pre-line text-xs text-muted-foreground">
                {session.notes}
              </p>
            )}
          </SirhBloc>
        </aside>
      </div>
    </div>
  );
}
