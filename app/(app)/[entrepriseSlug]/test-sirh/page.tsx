import Link from 'next/link';
import { redirect } from 'next/navigation';

import { PageToolbar } from '@/components/layout/page-toolbar';
import { FilAnnonces } from '@/components/test-sirh/annonces/fil-annonces';
import { ListeAlertesContrats } from '@/components/test-sirh/collaborateurs/alertes-contrats';
import { StatutPeriodeBadge } from '@/components/test-sirh/paie/statut-periode-badge';
import { EntretiensRecrutementAVenir } from '@/components/test-sirh/recrutement/entretiens-a-venir';
import { SirhBloc } from '@/components/test-sirh/sirh-bloc';
import {
  AbsentsDuJourListe,
  EntretiensProEnRetardListe,
  RecyclagesListe,
} from '@/components/test-sirh/tableau-de-bord/alertes-rh';
import { TuilesModules } from '@/components/test-sirh/tableau-de-bord/tuiles-modules';
import { buttonVariants } from '@/components/ui/button';
import { StatCard, StatGrid } from '@/components/ui/stat-card';
import { absentsDuJour, kpiAbsences } from '@/lib/test-sirh/absences/queries';
import { listerAnnoncesVisibles } from '@/lib/test-sirh/annonces/queries';
import { aujourdhuiIso } from '@/lib/test-sirh/calendrier';
import { kpiCollaborateurs, listerAlertesContrats } from '@/lib/test-sirh/collaborateurs/queries';
import { baseSirh, exigerContexteSirhPage } from '@/lib/test-sirh/contexte';
import { kpiDocuments } from '@/lib/test-sirh/documents/queries';
import {
  kpiEntretiens,
  listerEntretiensProfessionnelsEnRetard,
} from '@/lib/test-sirh/entretiens/queries';
import { kpiFormation, listerRecyclagesAPrevoir } from '@/lib/test-sirh/formation/queries';
import { formatDateFr, formatEuroArrondi, formatMinutes, formatMois } from '@/lib/test-sirh/format';
import { kpiMateriel } from '@/lib/test-sirh/materiel/queries';
import { kpiNotesFrais } from '@/lib/test-sirh/notes-frais/queries';
import { kpiOnboarding } from '@/lib/test-sirh/onboarding/queries';
import { kpiPaie } from '@/lib/test-sirh/paie/queries';
import { peutLireSirh, peutValiderSirh, peutVoirPaieSirh } from '@/lib/test-sirh/permissions';
import {
  kpiRecrutement,
  listerEntretiensRecrutementAVenir,
} from '@/lib/test-sirh/recrutement/queries';
import { kpiTemps } from '@/lib/test-sirh/temps/queries';

const pluriel = (n: number, mot: string) => `${n} ${mot}${n > 1 ? 's' : ''}`;

/**
 * Test SIRH › Tableau de bord RH : indicateurs de tous les domaines, alertes
 * (contrats, recyclages, entretiens professionnels), absents du jour, annonces.
 * Les rôles sans accès aux écrans de gestion sont renvoyés vers « Mon espace ».
 */
export default async function TestSirhTableauDeBordPage() {
  const ctx = await exigerContexteSirhPage();
  const base = baseSirh(ctx);
  const role = ctx.utilisateur.role;
  if (!peutLireSirh(role)) redirect(`${base}/mon-espace`);

  const today = aujourdhuiIso();
  const valideur = peutValiderSirh(role);
  const paie = peutVoirPaieSirh(role);

  const [
    collaborateurs,
    alertesContrats,
    absences,
    absents,
    temps,
    kpiPaieCourant,
    frais,
    materiel,
    documents,
    recrutement,
    entretiensRecrutement,
    entretiens,
    entretiensEnRetard,
    formation,
    recyclages,
    onboarding,
    annonces,
  ] = await Promise.all([
    kpiCollaborateurs(),
    listerAlertesContrats(),
    kpiAbsences(today),
    absentsDuJour(today),
    kpiTemps(),
    paie ? kpiPaie() : Promise.resolve(null),
    kpiNotesFrais(),
    kpiMateriel(),
    kpiDocuments(),
    kpiRecrutement(),
    listerEntretiensRecrutementAVenir({ jours: 7, limite: 5 }),
    kpiEntretiens(),
    listerEntretiensProfessionnelsEnRetard(),
    kpiFormation(),
    listerRecyclagesAPrevoir(90),
    kpiOnboarding(),
    listerAnnoncesVisibles(3),
  ]);

  const hsEnAttente = temps?.heuresSupEnAttente ?? 0;
  const aValider = absences.enAttente + hsEnAttente + frais.aValider.nombre;

  return (
    <div className="space-y-5">
      <PageToolbar
        title="Test SIRH"
        subtitle={`Tableau de bord RH · ${formatDateFr(today)}`}
        actions={
          <>
            <Link
              href={`${base}/mon-espace`}
              className={buttonVariants({ variant: 'outline', size: 'sm' })}
            >
              Mon espace
            </Link>
            {valideur && (
              <Link href={`${base}/validations`} className={buttonVariants({ size: 'sm' })}>
                Validations{aValider > 0 ? ` (${aValider})` : ''}
              </Link>
            )}
          </>
        }
      />

      <StatGrid>
        <StatCard
          label="Effectif actif"
          value={collaborateurs.effectifActif}
          hint={`+${collaborateurs.arrivees30j} arrivée(s) · −${collaborateurs.departs30j} départ(s) sur 30 j`}
        />
        <StatCard
          label="Absents aujourd’hui"
          value={absences.absentsAujourdhui}
          hint={pluriel(absences.arretsMaladieEnCours, 'arrêt') + ' maladie / accident en cours'}
        />
        <StatCard
          label="Demandes à valider"
          value={aValider}
          tone={aValider > 0 ? 'amber' : 'default'}
          hint={`${absences.enAttente} absence(s) · ${hsEnAttente} heures sup. · ${frais.aValider.nombre} frais`}
        />
        <StatCard
          label="Fins de contrat ≤ 60 j"
          value={collaborateurs.finsContrat60j}
          tone={collaborateurs.finsContrat60j > 0 ? 'rose' : 'default'}
          hint={`${collaborateurs.repartition.cddInterim} CDD / intérim en cours`}
        />
      </StatGrid>

      <StatGrid>
        <StatCard
          label="Offres publiées"
          value={recrutement.offresPubliees}
          hint={`${pluriel(recrutement.candidaturesActives, 'candidature')} active(s) · ${recrutement.embauches90j} embauche(s) / 90 j`}
        />
        <StatCard
          label="Entretiens à planifier"
          value={entretiens.aPlanifier}
          tone={entretiens.professionnelsEnRetard > 0 ? 'rose' : 'default'}
          hint={`${entretiens.professionnelsEnRetard} entretien(s) professionnel(s) en retard`}
        />
        <StatCard
          label="Recyclages ≤ 90 j"
          value={formation.recyclagesAPrevoir}
          tone={formation.qualificationsExpirees > 0 ? 'amber' : 'default'}
          hint={`${formation.qualificationsExpirees} expirée(s) · ${formation.sessionsAVenir} session(s) à venir`}
        />
        <StatCard
          label="Onboardings en cours"
          value={onboarding.onboardingsEnCours}
          tone={onboarding.tachesEnRetard > 0 ? 'amber' : 'default'}
          hint={`${onboarding.offboardingsEnCours} départ(s) · ${onboarding.tachesEnRetard} tâche(s) en retard`}
        />
      </StatGrid>

      <StatGrid>
        <StatCard
          label="Heures badgées (semaine)"
          value={temps ? formatMinutes(temps.minutesBadgeesSemaine) : '—'}
          hint={
            temps
              ? `${temps.badgeagesNonValidesSemaine} à valider · ${temps.badgeagesEnCours} en cours`
              : undefined
          }
        />
        <StatCard
          label="Frais à rembourser"
          value={formatEuroArrondi(frais.aRembourser.montant)}
          tone="sky"
          hint={pluriel(frais.aRembourser.nombre, 'note') + ' approuvée(s)'}
        />
        <StatCard
          label="Matériel attribué"
          value={materiel.attribues}
          tone={materiel.alertesControle > 0 ? 'amber' : 'default'}
          hint={`${materiel.alertesControle} contrôle(s) ≤ 30 j · ${materiel.enStock} en stock`}
        />
        <StatCard
          label="Documents à signer"
          value={documents.aSigner}
          tone={documents.expires > 0 ? 'rose' : 'default'}
          hint={`${documents.expires} expiré(s) · ${documents.bientot} expirent ≤ 30 j`}
        />
      </StatGrid>

      <div className="flex flex-col gap-5 lg:flex-row lg:items-start">
        <div className="min-w-0 flex-1 space-y-5">
          <SirhBloc
            title="Contrats à surveiller"
            description="Fins de période d’essai et de CDD, contrats échus sans motif de fin."
          >
            <ListeAlertesContrats
              alertes={alertesContrats}
              lienDossier={`${base}/collaborateurs`}
            />
          </SirhBloc>
          <SirhBloc
            title="Habilitations à recycler"
            description="CACES, SST, AIPR… expirées ou expirant dans les 90 jours, sans recyclage programmé."
          >
            <RecyclagesListe qualifications={recyclages} lien={`${base}/formation/habilitations`} />
          </SirhBloc>
          <SirhBloc
            title="Entretiens professionnels en retard"
            description="Obligation légale : un entretien professionnel tous les 2 ans (art. L6315-1 C. trav.)."
          >
            <EntretiensProEnRetardListe
              lignes={entretiensEnRetard}
              lien={`${base}/entretiens/suivi`}
            />
          </SirhBloc>
        </div>

        <aside className="space-y-5 lg:w-96 lg:shrink-0">
          <SirhBloc title="Absents aujourd’hui">
            <AbsentsDuJourListe absents={absents} lienCalendrier={`${base}/absences/calendrier`} />
          </SirhBloc>
          <SirhBloc title="Entretiens de recrutement (7 jours)">
            <EntretiensRecrutementAVenir
              entretiens={entretiensRecrutement}
              base={base}
              vide="Aucun entretien de recrutement cette semaine."
            />
          </SirhBloc>
          {kpiPaieCourant && (
            <SirhBloc
              title="Paie"
              actions={
                <Link href={`${base}/paie`} className="text-xs text-amber-700 hover:underline">
                  Ouvrir →
                </Link>
              }
            >
              {kpiPaieCourant.periode ? (
                <div className="space-y-1 text-sm">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-medium capitalize">
                      {formatMois(kpiPaieCourant.periode.annee, kpiPaieCourant.periode.mois)}
                    </span>
                    <StatutPeriodeBadge statut={kpiPaieCourant.periode.statut} />
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {pluriel(kpiPaieCourant.nbVariables, 'variable')} pour{' '}
                    {pluriel(kpiPaieCourant.nbEmployes, 'collaborateur')} ·{' '}
                    {formatEuroArrondi(kpiPaieCourant.montantTotal)}
                  </p>
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">Aucune période de paie ouverte.</p>
              )}
            </SirhBloc>
          )}
          <SirhBloc
            title="Annonces"
            actions={
              <Link href={`${base}/annonces`} className="text-xs text-amber-700 hover:underline">
                Tout voir →
              </Link>
            }
          >
            <FilAnnonces annonces={annonces} today={today} compact vide="Aucune annonce." />
          </SirhBloc>
        </aside>
      </div>

      <SirhBloc title="Rubriques" description="Accès direct aux sous-modules du SIRH.">
        <TuilesModules base={base} role={role} />
      </SirhBloc>
    </div>
  );
}
