import Link from 'next/link';

import { PageToolbar } from '@/components/layout/page-toolbar';
import { AbsencesListe } from '@/components/test-sirh/absences/absences-liste';
import { CompteursTable } from '@/components/test-sirh/absences/compteurs-table';
import { NouvelleDemandeAbsence } from '@/components/test-sirh/absences/nouvelle-demande-absence';
import { FilAnnonces } from '@/components/test-sirh/annonces/fil-annonces';
import { DocumentsListe } from '@/components/test-sirh/documents/documents-liste';
import { EntretiensEmployeListe } from '@/components/test-sirh/entretiens/entretiens-employe-liste';
import { FormationsEmployeListe } from '@/components/test-sirh/formation/formations-employe-liste';
import { MaterielEmployeListe } from '@/components/test-sirh/materiel/materiel-employe-liste';
import { CommentairesEntretiens } from '@/components/test-sirh/mon-espace/commentaires-entretiens';
import { MonProfilCarte } from '@/components/test-sirh/mon-espace/mes-informations';
import { NotesFraisTable } from '@/components/test-sirh/notes-frais/notes-frais-table';
import { MesTaches } from '@/components/test-sirh/onboarding/mes-taches';
import { SirhBloc } from '@/components/test-sirh/sirh-bloc';
import { FeuilleTempsTable } from '@/components/test-sirh/temps/feuille-temps-table';
import { HeuresSupSection } from '@/components/test-sirh/temps/heures-sup-section';
import { buttonVariants } from '@/components/ui/button';
import { annulerAbsence, demanderAbsence } from '@/lib/test-sirh/absences/demandes';
import {
  chargerMonContexteDemandeAbsence,
  listerMesAbsences,
  listerMesCompteurs,
} from '@/lib/test-sirh/absences/queries';
import { listerAnnoncesVisibles } from '@/lib/test-sirh/annonces/queries';
import { aujourdhuiIso } from '@/lib/test-sirh/calendrier';
import { baseSirh, exigerContexteSirhPage } from '@/lib/test-sirh/contexte';
import { marquerDocumentSigne } from '@/lib/test-sirh/documents/actions';
import { listerDocumentsEntrepriseVisibles } from '@/lib/test-sirh/documents/queries';
import { enregistrerCommentaireSalarie } from '@/lib/test-sirh/entretiens/entretiens';
import {
  listerEntretiensEmploye,
  listerObjectifsEmploye,
} from '@/lib/test-sirh/entretiens/queries';
import { compteRenduVerrouille } from '@/lib/test-sirh/entretiens/statuts';
import { listerFormationsEmploye } from '@/lib/test-sirh/formation/queries';
import { listerMaterielEmploye } from '@/lib/test-sirh/materiel/queries';
import { lireMonProfil } from '@/lib/test-sirh/mon-espace/queries';
import {
  deciderNoteFrais,
  enregistrerBrouillonNoteFrais,
  marquerNoteFraisRemboursee,
  soumettreBrouillonNoteFrais,
  soumettreNoteFrais,
  supprimerNoteFrais,
} from '@/lib/test-sirh/notes-frais/actions';
import { listerMesNotesFrais } from '@/lib/test-sirh/notes-frais/queries';
import { basculerTache } from '@/lib/test-sirh/onboarding/taches';
import { listerMesTaches } from '@/lib/test-sirh/onboarding/queries';
import { peutLireSirh } from '@/lib/test-sirh/permissions';
import {
  listerChantiersOptions,
  listerDossiersDocumentsOptions,
} from '@/lib/test-sirh/referentiels';
import {
  creerDocumentSirh,
  listerDocumentsEmployeSirh,
  preparerUploadSirh,
  urlTelechargementDocumentSirh,
} from '@/lib/test-sirh/stockage';
import { annulerHeuresSup, demanderHeuresSup } from '@/lib/test-sirh/temps/heures-sup-actions';
import { listerMesBadgeages, listerMesHeuresSup } from '@/lib/test-sirh/temps/queries';

/** Dossier GED amorcé pour ranger les justificatifs (cf. `DOSSIERS_DEFAUT`). */
const DOSSIER_JUSTIFICATIFS = 'Justificatifs';

/**
 * Test SIRH › Mon espace (libre-service, TOUS les rôles) : compteurs et
 * demandes d'absence, semaine de travail, heures sup., notes de frais, tâches,
 * entretiens, formations, matériel, documents et annonces — uniquement pour la
 * fiche employé rattachée au compte de l'utilisateur.
 */
export default async function MonEspacePage() {
  const ctx = await exigerContexteSirhPage();
  const base = baseSirh(ctx);
  const today = aujourdhuiIso();
  const lecteur = peutLireSirh(ctx.utilisateur.role);

  const [profil, annonces] = await Promise.all([lireMonProfil(), listerAnnoncesVisibles(5)]);

  if (!profil) {
    return (
      <div className="space-y-5">
        <PageToolbar
          title="Mon espace"
          subtitle="Compte non rattaché à une fiche employé"
          backHref={lecteur ? base : undefined}
          backLabel="Test SIRH"
        />
        <SirhBloc title="Accès au libre-service">
          <p className="text-sm text-muted-foreground">
            Votre compte n’est rattaché à aucune fiche employé : demandez au service RH de le
            rattacher depuis votre dossier collaborateur (section « Compte utilisateur »). Vous
            pourrez alors consulter vos compteurs, poser vos congés et déposer vos notes de frais.
          </p>
          {lecteur && (
            <Link
              href={`${base}/collaborateurs`}
              className={buttonVariants({ variant: 'outline', size: 'sm', className: 'mt-3' })}
            >
              Ouvrir les collaborateurs
            </Link>
          )}
        </SirhBloc>
        <SirhBloc title="Annonces">
          <FilAnnonces annonces={annonces} today={today} compact vide="Aucune annonce." />
        </SirhBloc>
      </div>
    );
  }

  const employeId = profil.employeId;
  const moi = { id: employeId, label: profil.nomComplet };

  const [
    absences,
    compteurs,
    contexteAbsence,
    heuresSup,
    semaine,
    notesFrais,
    chantiers,
    dossiers,
    taches,
    entretiens,
    objectifs,
    formations,
    materiel,
    mesDocuments,
    documentsEntreprise,
  ] = await Promise.all([
    listerMesAbsences(),
    listerMesCompteurs(),
    chargerMonContexteDemandeAbsence(),
    listerMesHeuresSup(),
    listerMesBadgeages(null),
    listerMesNotesFrais(),
    listerChantiersOptions(),
    listerDossiersDocumentsOptions(),
    listerMesTaches(),
    listerEntretiensEmploye(employeId),
    listerObjectifsEmploye(employeId),
    listerFormationsEmploye(employeId),
    listerMaterielEmploye(employeId),
    listerDocumentsEmployeSirh(employeId),
    listerDocumentsEntrepriseVisibles(),
  ]);

  const dossierJustificatifsId =
    dossiers.find((d) => d.label === DOSSIER_JUSTIFICATIFS)?.id ?? null;
  const entretiensCommentables = entretiens.filter((e) => !compteRenduVerrouille(e.statut));
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

  return (
    <div className="space-y-5">
      <PageToolbar
        title="Mon espace"
        subtitle={[profil.nomComplet, profil.poste].filter(Boolean).join(' · ')}
        backHref={lecteur ? base : undefined}
        backLabel="Test SIRH"
        actions={
          contexteAbsence.employes.length > 0 ? (
            <NouvelleDemandeAbsence
              contexte={contexteAbsence}
              today={today}
              employeFixeId={employeId}
              peutApprouverDirectement={false}
              libelle="Demander une absence"
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
      />

      <div className="flex flex-col gap-5 lg:flex-row lg:items-start">
        <div className="min-w-0 flex-1 space-y-5">
          <SirhBloc
            title="Mes compteurs"
            description="Droits, jours pris et solde par type d’absence (congés payés, RTT…)."
          >
            <CompteursTable
              compteurs={compteurs}
              today={today}
              masquerEmploye
              emptyMessage="Aucun compteur ouvert pour vous."
            />
          </SirhBloc>

          <SirhBloc title="Mes absences" description="Demandes en cours et historique.">
            <AbsencesListe
              absences={absences}
              today={today}
              masquerEmploye
              droits={{
                peutValider: false,
                estGestionnaire: false,
                monEmployeId: employeId,
                monUtilisateurId: ctx.utilisateur.id,
              }}
              actions={{
                annuler: async (id) => {
                  'use server';
                  return annulerAbsence(id);
                },
                obtenirUrlJustificatif: obtenirUrl,
              }}
              emptyMessage="Aucune demande d’absence."
            />
          </SirhBloc>

          <SirhBloc
            title="Ma semaine"
            description="Badgeages de la semaine en cours, heures travaillées et écart au théorique."
          >
            <FeuilleTempsTable
              feuille={semaine.feuille}
              today={today}
              sansFiltre
              messageVide="Aucun badgeage cette semaine."
            />
          </SirhBloc>

          <SirhBloc title="Mes heures supplémentaires">
            <HeuresSupSection
              demandes={heuresSup}
              today={today}
              peutValider={false}
              peutGerer={false}
              monEmployeId={employeId}
              employeFixe={moi}
              employes={[]}
              chantiers={chantiers}
              masquerCollaborateur
              actions={{
                demander: async (input) => {
                  'use server';
                  return demanderHeuresSup(input);
                },
                annuler: async (id) => {
                  'use server';
                  return annulerHeuresSup(id);
                },
              }}
              emptyMessage="Aucune demande d’heures supplémentaires."
            />
          </SirhBloc>

          <SirhBloc
            title="Mes notes de frais"
            description="Dépenses, indemnités kilométriques et forfaits ; justificatif joint au dépôt."
          >
            <NotesFraisTable
              notes={notesFrais}
              chantiers={chantiers}
              today={today}
              afficherEmploye={false}
              employeFixe={moi}
              peutCreer
              dossierJustificatifsId={dossierJustificatifsId}
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
                // Jamais proposés ici (droits par ligne calculés côté serveur, qui
                // refuse aussi l'auto-validation) ; requis par le contrat de la table.
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
            title="Mes tâches"
            description="Tâches d’intégration ou RH qui vous sont assignées."
          >
            <MesTaches
              taches={taches}
              today={today}
              baseProcessus={lecteur ? `${base}/onboarding` : null}
              basculer={async (id, faite) => {
                'use server';
                return basculerTache(id, faite);
              }}
              vide="Aucune tâche en cours."
            />
          </SirhBloc>

          <SirhBloc
            title="Mes entretiens & objectifs"
            description="Entretiens annuels et professionnels ; ajoutez votre commentaire avant la signature."
          >
            <div className="space-y-4">
              <EntretiensEmployeListe
                entretiens={entretiens}
                objectifs={objectifs}
                today={today}
                {...(lecteur ? { baseHref: `${base}/entretiens` } : {})}
              />
              {entretiensCommentables.length > 0 && (
                <CommentairesEntretiens
                  entretiens={entretiensCommentables}
                  onEnregistrer={async (input) => {
                    'use server';
                    return enregistrerCommentaireSalarie(input);
                  }}
                />
              )}
            </div>
          </SirhBloc>

          <SirhBloc title="Mes formations & habilitations">
            <FormationsEmployeListe formations={formations} />
          </SirhBloc>

          <SirhBloc title="Mon matériel & EPI">
            <MaterielEmployeListe
              lignes={materiel}
              today={today}
              emptyMessage="Aucun matériel ni EPI ne vous est attribué."
            />
          </SirhBloc>

          <SirhBloc
            title="Mes documents"
            description="Contrats, bulletins, attestations partagés avec vous ; signez les documents demandés."
          >
            <DocumentsListe
              documents={mesDocuments}
              today={today}
              obtenirUrl={obtenirUrl}
              dossiers={dossiers}
              onSigner={async (id) => {
                'use server';
                return marquerDocumentSigne(id);
              }}
              emptyMessage="Aucun document partagé avec vous."
            />
          </SirhBloc>

          <SirhBloc
            title="Documents de l’entreprise"
            description="Règlement intérieur, accords, notes de service."
          >
            <DocumentsListe
              documents={documentsEntreprise}
              today={today}
              obtenirUrl={obtenirUrl}
              dossiers={dossiers}
              emptyMessage="Aucun document d’entreprise publié."
            />
          </SirhBloc>
        </div>

        <aside className="space-y-5 lg:w-80 lg:shrink-0">
          <SirhBloc title="Mon profil">
            <MonProfilCarte profil={profil} today={today} />
          </SirhBloc>
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
    </div>
  );
}
