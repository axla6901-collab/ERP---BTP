import { IdCardIcon } from 'lucide-react';
import Link from 'next/link';
import { notFound } from 'next/navigation';

import { PageToolbar } from '@/components/layout/page-toolbar';
import { AbsencesListe } from '@/components/test-sirh/absences/absences-liste';
import { CompteursTable } from '@/components/test-sirh/absences/compteurs-table';
import { NouvelleDemandeAbsence } from '@/components/test-sirh/absences/nouvelle-demande-absence';
import { DocumentsListe } from '@/components/test-sirh/documents/documents-liste';
import { AjoutDocumentDossier } from '@/components/test-sirh/dossier/ajout-document-dossier';
import { BadgeagesRecents } from '@/components/test-sirh/dossier/badgeages-recents';
import { EntretiensEmployeListe } from '@/components/test-sirh/entretiens/entretiens-employe-liste';
import { FormationsEmployeListe } from '@/components/test-sirh/formation/formations-employe-liste';
import { MaterielEmployeListe } from '@/components/test-sirh/materiel/materiel-employe-liste';
import { NotesFraisTable } from '@/components/test-sirh/notes-frais/notes-frais-table';
import { MesTaches } from '@/components/test-sirh/onboarding/mes-taches';
import { ProcessusResume } from '@/components/test-sirh/onboarding/processus-resume';
import { AffectationSection } from '@/components/test-sirh/collaborateurs/affectation-section';
import { StatutCollaborateurBadge } from '@/components/test-sirh/collaborateurs/badges';
import { CompteUtilisateurSection } from '@/components/test-sirh/collaborateurs/compte-utilisateur-section';
import { ContratsSection } from '@/components/test-sirh/collaborateurs/contrats-section';
import { EquipesCollaborateur } from '@/components/test-sirh/collaborateurs/equipes-collaborateur';
import { SirhBloc } from '@/components/test-sirh/sirh-bloc';
import { buttonVariants } from '@/components/ui/button';
import { annulerAbsence, deciderAbsence, demanderAbsence } from '@/lib/test-sirh/absences/demandes';
import {
  chargerContexteDemandeAbsence,
  lireMonEmployeId,
  listerAbsencesEmploye,
  listerCompteursEmploye,
} from '@/lib/test-sirh/absences/queries';
import { ajouterJours, aujourdhuiIso } from '@/lib/test-sirh/calendrier';
import { enregistrerAffectation } from '@/lib/test-sirh/collaborateurs/affectation';
import {
  detacherCompteUtilisateur,
  rattacherCompteUtilisateur,
} from '@/lib/test-sirh/collaborateurs/compte-utilisateur';
import {
  enregistrerContrat,
  supprimerContrat,
  terminerContrat,
} from '@/lib/test-sirh/collaborateurs/contrats-actions';
import {
  garantirOption,
  optionsEmployes,
  type OptionSimple,
} from '@/lib/test-sirh/collaborateurs/options';
import {
  lireDossierCollaborateur,
  lirePrefillContratDepuisFicheRh,
  listerComptesRattaches,
  listerContratsEmploye,
  listerEquipesEmploye,
} from '@/lib/test-sirh/collaborateurs/queries';
import { baseSirh, exigerContexteSirhPage } from '@/lib/test-sirh/contexte';
import {
  listerEntretiensEmploye,
  listerObjectifsEmploye,
} from '@/lib/test-sirh/entretiens/queries';
import { listerFormationsEmploye } from '@/lib/test-sirh/formation/queries';
import { formatAnciennete, formatDateFr, nomComplet } from '@/lib/test-sirh/format';
import { listerMaterielEmploye } from '@/lib/test-sirh/materiel/queries';
import {
  deciderNoteFrais,
  enregistrerBrouillonNoteFrais,
  marquerNoteFraisRemboursee,
  soumettreBrouillonNoteFrais,
  soumettreNoteFrais,
  supprimerNoteFrais,
} from '@/lib/test-sirh/notes-frais/actions';
import { listerNotesFraisEmploye } from '@/lib/test-sirh/notes-frais/queries';
import { basculerTache } from '@/lib/test-sirh/onboarding/taches';
import { listerProcessusEmploye, listerTachesEmploye } from '@/lib/test-sirh/onboarding/queries';
import { listerPostes } from '@/lib/test-sirh/organisation/queries';
import {
  peutGererSirh,
  peutValiderSirh,
  peutVoirPaieSirh,
  ROLES_SIRH_LECTURE,
} from '@/lib/test-sirh/permissions';
import { lireRecrutementEmploye } from '@/lib/test-sirh/recrutement/queries';
import {
  listerChantiersOptions,
  listerDossiersDocumentsOptions,
  listerEmployesOptions,
  listerHorairesOptions,
  listerSitesOptions,
  listerSocietesOptions,
  listerUtilisateursOptions,
} from '@/lib/test-sirh/referentiels';
import {
  creerDocumentSirh,
  listerDocumentsEmployeSirh,
  preparerUploadSirh,
  urlTelechargementDocumentSirh,
} from '@/lib/test-sirh/stockage';
import { listerBadgeagesEmploye } from '@/lib/test-sirh/temps/queries';

/** Dossier GED amorcé pour ranger les justificatifs (cf. `DOSSIERS_DEFAUT`). */
const DOSSIER_JUSTIFICATIFS = 'Justificatifs';

/** Ajoute aux options les valeurs référencées par l'historique (éléments désactivés depuis). */
function avecValeursCourantes(
  options: readonly OptionSimple[],
  valeurs: ReadonlyArray<{ id: string | null; label: string | null }>,
): OptionSimple[] {
  return valeurs.reduce<OptionSimple[]>(
    (acc, v) => garantirOption(acc, v.id, v.label),
    options.map((o) => ({ id: o.id, label: o.label })),
  );
}

/**
 * Test SIRH › Dossier collaborateur : suite de sections `SirhBloc` (affectation,
 * compte utilisateur, contrats, équipes). L'identité reste sur la fiche RH.
 */
export default async function DossierCollaborateurPage({
  params,
}: {
  params: Promise<{ entrepriseSlug: string; employeId: string }>;
}) {
  const ctx = await exigerContexteSirhPage(ROLES_SIRH_LECTURE);
  const { employeId } = await params;
  const role = ctx.utilisateur.role;
  const gestion = peutGererSirh(role);
  const paie = peutVoirPaieSirh(role);

  const [
    dossier,
    contrats,
    equipes,
    postes,
    sites,
    employes,
    horaires,
    societes,
    utilisateurs,
    comptesRattaches,
    prefill,
  ] = await Promise.all([
    lireDossierCollaborateur(employeId),
    listerContratsEmploye(employeId),
    listerEquipesEmploye(employeId),
    listerPostes(),
    listerSitesOptions(),
    listerEmployesOptions({ inclureInactifs: true }),
    listerHorairesOptions(),
    listerSocietesOptions(),
    gestion ? listerUtilisateursOptions() : Promise.resolve([]),
    gestion ? listerComptesRattaches() : Promise.resolve([]),
    gestion ? lirePrefillContratDepuisFicheRh(employeId) : Promise.resolve(null),
  ]);
  if (!dossier) notFound();

  const today = aujourdhuiIso();
  const base = baseSirh(ctx);
  const a = dossier.affectation;
  const valideur = peutValiderSirh(role);

  // Sections des autres domaines, chargées une fois l'existence du dossier établie
  // (leurs lectures « LECTURE ou soi-même » refusent un employé inexistant).
  const [
    absencesEmploye,
    compteursEmploye,
    contexteAbsence,
    badgeages,
    notesFrais,
    chantiers,
    entretiens,
    objectifs,
    formations,
    processus,
    taches,
    materiel,
    documents,
    dossiersGed,
    recrutement,
    monEmployeId,
  ] = await Promise.all([
    listerAbsencesEmploye(employeId),
    listerCompteursEmploye(employeId),
    gestion ? chargerContexteDemandeAbsence(employeId) : Promise.resolve(null),
    listerBadgeagesEmploye(employeId, ajouterJours(today, -27), today),
    listerNotesFraisEmploye(employeId),
    listerChantiersOptions(),
    listerEntretiensEmploye(employeId),
    listerObjectifsEmploye(employeId),
    listerFormationsEmploye(employeId),
    listerProcessusEmploye(employeId),
    listerTachesEmploye(employeId),
    listerMaterielEmploye(employeId),
    listerDocumentsEmployeSirh(employeId),
    listerDossiersDocumentsOptions(),
    lireRecrutementEmploye(employeId),
    lireMonEmployeId(),
  ]);
  const employeOption = {
    id: dossier.employeId,
    label: nomComplet(dossier.prenom, dossier.nom),
  };
  const televersement = {
    preparerUpload: async (
      cible: Parameters<typeof preparerUploadSirh>[0],
      contentType: string,
      filename: string,
      tailleBytes: number,
    ) => {
      'use server';
      return preparerUploadSirh(cible, contentType, filename, tailleBytes);
    },
    creerDocument: async (input: Parameters<typeof creerDocumentSirh>[0]) => {
      'use server';
      return creerDocumentSirh(input);
    },
  };
  const obtenirUrl = async (id: string) => {
    'use server';
    return urlTelechargementDocumentSirh(id);
  };
  const libellePoste = (p: { intitule: string; niveau: string | null }) =>
    p.niveau ? `${p.intitule} (${p.niveau})` : p.intitule;
  const postesActifs = postes.filter((p) => p.actif);

  const optionsAffectation = {
    postes: avecValeursCourantes(
      postesActifs.map((p) => ({ id: p.id, label: libellePoste(p) })),
      [{ id: a?.posteId ?? null, label: a?.posteIntitule ?? null }],
    ),
    sites: avecValeursCourantes(sites, [{ id: a?.siteId ?? null, label: a?.siteNom ?? null }]),
    managers: optionsEmployes(employes, {
      valeurCourante: a?.managerId ?? null,
      exclure: dossier.employeId,
    }),
    horaires: avecValeursCourantes(horaires, [
      { id: a?.horaireId ?? null, label: a?.horaireNom ?? null },
    ]),
    societes: avecValeursCourantes(societes, [
      { id: a?.societeId ?? null, label: a?.societeLibelle ?? null },
    ]),
  };

  const optionsContrat = {
    postes: postes
      .filter((p) => p.actif || contrats.some((c) => c.posteId === p.id))
      .map((p) => ({
        id: p.id,
        label: p.actif ? libellePoste(p) : `${libellePoste(p)} (inactif)`,
        intitule: p.intitule,
        categorie: p.categorie,
        niveau: p.niveau,
        coefficient: p.coefficient,
      })),
    sites: avecValeursCourantes(
      sites,
      contrats.map((c) => ({ id: c.siteId, label: c.siteNom })),
    ),
    societes: avecValeursCourantes(
      societes,
      contrats.map((c) => ({ id: c.societeId, label: c.societeLibelle })),
    ),
  };

  const sousTitre =
    [
      dossier.posteLibelle,
      dossier.siteLibelle,
      dossier.dateAnciennete
        ? `${formatAnciennete(dossier.dateAnciennete, today)} d’ancienneté`
        : null,
    ]
      .filter(Boolean)
      .join(' · ') || 'Affectation non renseignée';

  return (
    <div className="space-y-5">
      <PageToolbar
        title={
          <span className="inline-flex items-center gap-2">
            {nomComplet(dossier.prenom, dossier.nom)}
            <StatutCollaborateurBadge statut={dossier.statut} />
          </span>
        }
        subtitle={sousTitre}
        backHref={`${base}/collaborateurs`}
        backLabel="Collaborateurs"
        actions={
          <Link
            href={`/${ctx.entreprise.slug}/rh/employes/${dossier.employeId}`}
            className={buttonVariants({ variant: 'outline', size: 'sm' })}
          >
            <IdCardIcon className="mr-1 size-4" />
            Fiche RH
          </Link>
        }
      />

      <SirhBloc
        title="Affectation"
        description="Poste, site, manager, horaire de travail et société employeuse."
      >
        <AffectationSection
          employeId={dossier.employeId}
          affectation={a}
          dateAncienneteEffective={dossier.dateAnciennete}
          today={today}
          peutGerer={gestion}
          options={optionsAffectation}
          onSubmit={async (input) => {
            'use server';
            return enregistrerAffectation(input);
          }}
        />
      </SirhBloc>

      {gestion && (
        <SirhBloc
          title="Compte utilisateur"
          description="Compte de connexion rattaché : donne accès à « Mon espace » (congés, notes de frais, documents…)."
        >
          <CompteUtilisateurSection
            employeId={dossier.employeId}
            compte={
              dossier.utilisateurId
                ? { utilisateurId: dossier.utilisateurId, email: dossier.utilisateurEmail }
                : null
            }
            utilisateurs={utilisateurs}
            comptesRattaches={comptesRattaches}
            actions={{
              rattacher: async (input) => {
                'use server';
                return rattacherCompteUtilisateur(input);
              },
              detacher: async (id) => {
                'use server';
                return detacherCompteUtilisateur(id);
              },
            }}
          />
        </SirhBloc>
      )}

      <SirhBloc
        title="Contrats"
        description={
          paie
            ? 'Historique des versions : un avenant ou un renouvellement crée une nouvelle version.'
            : 'Historique des versions : un avenant ou un renouvellement crée une nouvelle version. Rémunération masquée (droit Paie requis).'
        }
      >
        <ContratsSection
          employeId={dossier.employeId}
          contrats={contrats}
          today={today}
          peutGerer={gestion}
          avecRemuneration={paie}
          options={optionsContrat}
          prefill={prefill}
          actions={{
            enregistrer: async (input) => {
              'use server';
              return enregistrerContrat(input);
            },
            terminer: async (input) => {
              'use server';
              return terminerContrat(input);
            },
            supprimer: async (id) => {
              'use server';
              return supprimerContrat(id);
            },
          }}
        />
      </SirhBloc>

      <SirhBloc title="Équipes" description="Appartenances aux équipes, en cours et passées.">
        <EquipesCollaborateur
          equipes={equipes}
          today={today}
          lienEquipes={`${base}/organisation/equipes`}
        />
      </SirhBloc>

      <SirhBloc
        title="Absences & compteurs"
        description="Soldes par type d’absence et historique des demandes."
        actions={
          contexteAbsence && contexteAbsence.employes.length > 0 ? (
            <NouvelleDemandeAbsence
              contexte={contexteAbsence}
              today={today}
              employeFixeId={dossier.employeId}
              peutApprouverDirectement={gestion}
              taille="sm"
              variante="outline"
              actions={{
                demander: async (input) => {
                  'use server';
                  return demanderAbsence(input);
                },
                televersement,
              }}
            />
          ) : null
        }
      >
        <div className="space-y-4">
          <CompteursTable
            compteurs={compteursEmploye}
            today={today}
            masquerEmploye
            emptyMessage="Aucun compteur ouvert (Absences › Compteurs)."
          />
          <AbsencesListe
            absences={absencesEmploye}
            today={today}
            masquerEmploye
            droits={{
              peutValider: valideur,
              estGestionnaire: gestion,
              monEmployeId,
              monUtilisateurId: ctx.utilisateur.id,
            }}
            actions={{
              decider: async (input) => {
                'use server';
                return deciderAbsence(input);
              },
              annuler: async (id) => {
                'use server';
                return annulerAbsence(id);
              },
              obtenirUrlJustificatif: obtenirUrl,
            }}
            emptyMessage="Aucune demande d’absence."
          />
        </div>
      </SirhBloc>

      <SirhBloc
        title="Temps de travail"
        description="Badgeages des quatre dernières semaines (saisie et validation dans Temps de travail)."
      >
        <BadgeagesRecents badgeages={badgeages} lienFeuille={`${base}/temps`} />
      </SirhBloc>

      <SirhBloc title="Notes de frais">
        <NotesFraisTable
          notes={notesFrais}
          chantiers={chantiers}
          today={today}
          afficherEmploye={false}
          employeFixe={employeOption}
          peutCreer={gestion}
          dossierJustificatifsId={
            dossiersGed.find((d) => d.label === DOSSIER_JUSTIFICATIFS)?.id ?? null
          }
          actions={{
            enregistrerBrouillon: async (input) => {
              'use server';
              return enregistrerBrouillonNoteFrais(input);
            },
            soumettre: async (input) => {
              'use server';
              return soumettreNoteFrais(input);
            },
            soumettreBrouillon: async (id) => {
              'use server';
              return soumettreBrouillonNoteFrais(id);
            },
            decider: async (input) => {
              'use server';
              return deciderNoteFrais(input);
            },
            rembourser: async (id, dateRemboursement) => {
              'use server';
              return marquerNoteFraisRemboursee(id, dateRemboursement);
            },
            supprimer: async (id) => {
              'use server';
              return supprimerNoteFrais(id);
            },
            urlTelechargement: obtenirUrl,
            televersement,
          }}
          emptyMessage="Aucune note de frais."
        />
      </SirhBloc>

      <SirhBloc
        title="Entretiens & objectifs"
        description="Entretiens annuels et professionnels, objectifs en cours."
      >
        <EntretiensEmployeListe
          entretiens={entretiens}
          objectifs={objectifs}
          today={today}
          baseHref={`${base}/entretiens`}
        />
      </SirhBloc>

      <SirhBloc
        title="Formations & habilitations"
        description="Sessions suivies, résultats et validité des qualifications (recyclages)."
      >
        <FormationsEmployeListe formations={formations} baseHref={`${base}/formation`} />
      </SirhBloc>

      <SirhBloc title="Onboarding & tâches">
        <div className="space-y-4">
          <ProcessusResume processus={processus} today={today} baseFiches={`${base}/onboarding`} />
          <MesTaches
            taches={taches}
            today={today}
            baseProcessus={`${base}/onboarding`}
            utilisateurId={ctx.utilisateur.id}
            peutGerer={gestion}
            basculer={async (id, faite) => {
              'use server';
              return basculerTache(id, faite);
            }}
            vide="Aucune tâche concernant ce collaborateur."
          />
        </div>
      </SirhBloc>

      <SirhBloc title="Matériel & EPI" description="Dotations en cours et restituées.">
        <MaterielEmployeListe
          lignes={materiel}
          today={today}
          emptyMessage="Aucun matériel attribué."
        />
      </SirhBloc>

      <SirhBloc
        title="Documents"
        description="Pièces du dossier salarié (GED RH)."
        actions={
          gestion ? (
            <AjoutDocumentDossier
              employe={employeOption}
              dossiers={dossiersGed}
              actions={televersement}
            />
          ) : null
        }
      >
        <DocumentsListe
          documents={documents}
          today={today}
          obtenirUrl={obtenirUrl}
          dossiers={dossiersGed}
          emptyMessage="Aucun document dans le dossier."
        />
      </SirhBloc>

      {recrutement && (
        <SirhBloc title="Recrutement" description="Origine de l’embauche.">
          <p className="text-sm">
            Embauché·e via{' '}
            {recrutement.offreTitre ? (
              <Link
                href={`${base}/recrutement/offres/${recrutement.offreId}`}
                className="font-medium text-amber-700 hover:underline"
              >
                {recrutement.offreTitre}
                {recrutement.offreReference ? ` (${recrutement.offreReference})` : ''}
              </Link>
            ) : (
              'une candidature spontanée'
            )}
            {recrutement.dateCandidature
              ? ` — candidature du ${formatDateFr(recrutement.dateCandidature)}`
              : ''}
            .{' '}
            <Link
              href={`${base}/recrutement/candidats/${recrutement.candidatId}`}
              className="text-amber-700 hover:underline"
            >
              Fiche candidat ({recrutement.nbDocuments} pièce
              {recrutement.nbDocuments > 1 ? 's' : ''})
            </Link>
          </p>
        </SirhBloc>
      )}
    </div>
  );
}
