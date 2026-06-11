import { notFound } from 'next/navigation';

import { DeleteButton } from '@/components/catalogue/delete-button';
import { DocumentsList } from '@/components/rh/documents-list';
import { EmployeForm } from '@/components/rh/employe-form';
import { HabilitationsList } from '@/components/rh/habilitations-list';
import { PermisList } from '@/components/rh/permis-list';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { requireAuthWithMfa } from '@/lib/auth/guards';
import {
  enregistrerDocument,
  listerDocuments,
  preparerUploadDocument,
  supprimerDocument,
  urlTelechargementDocument,
} from '@/lib/rh/employe-documents';
import { lireEmploye, mettreAJourEmploye, supprimerEmploye } from '@/lib/rh/employes';
import {
  creerHabilitation,
  listerHabilitations,
  supprimerHabilitation,
} from '@/lib/rh/habilitations';
import { peutEcrireEmploye } from '@/lib/rh/permissions';
import { creerPermis, listerPermis, supprimerPermis } from '@/lib/rh/permis';
import type {
  Aptitude,
  CategoriePermis,
  Classification,
  EmployeInput,
  Sexe,
  SituationFamiliale,
  TypeContrat,
  TypeDocumentEmploye,
  TypeHabilitation,
  ZoneDeplacement,
} from '@/lib/validation/rh';

export default async function EmployeDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const utilisateur = await requireAuthWithMfa();
  const employe = await lireEmploye(id);
  if (!employe) notFound();

  const peutEcrire = peutEcrireEmploye(utilisateur.role);

  const [habilitations, permis, documents] = await Promise.all([
    listerHabilitations(id),
    listerPermis(id),
    listerDocuments(id),
  ]);

  if (!peutEcrire) {
    return (
      <div className="space-y-3">
        <h2 className="text-xl font-medium">
          {employe.nom} {employe.prenom}
        </h2>
        <p className="text-sm text-muted-foreground">
          {employe.qualification ?? '—'} — {employe.typeContrat}
        </p>
      </div>
    );
  }

  const defaultValues: Partial<EmployeInput> = {
    nom: employe.nom,
    prenom: employe.prenom,
    typeContrat: employe.typeContrat as TypeContrat,
    societeInterim: employe.societeInterim,
    qualification: employe.qualification,
    tauxHoraireBrut: employe.tauxHoraireBrut,
    heuresHebdoContractuelles: employe.heuresHebdoContractuelles,
    zoneDeplacementDefaut: employe.zoneDeplacementDefaut as ZoneDeplacement | null,
    dateEntree: employe.dateEntree,
    dateSortie: employe.dateSortie,
    email: employe.email,
    telephoneMobile: employe.telephoneMobile,
    telephoneFixe: employe.telephoneFixe,
    actif: employe.actif,
    utilisateurId: employe.utilisateurId,
    notes: employe.notes,
    dateNaissance: employe.dateNaissance,
    lieuNaissance: employe.lieuNaissance,
    nationalite: employe.nationalite,
    numeroSecu: employe.numeroSecu,
    sexe: employe.sexe as Sexe | null,
    adresseLigne1: employe.adresseLigne1,
    adresseLigne2: employe.adresseLigne2,
    codePostal: employe.codePostal,
    ville: employe.ville,
    pays: employe.pays,
    contactUrgenceNom: employe.contactUrgenceNom,
    contactUrgenceTelephone: employe.contactUrgenceTelephone,
    contactUrgenceRelation: employe.contactUrgenceRelation,
    situationFamiliale: employe.situationFamiliale as SituationFamiliale | null,
    nombreEnfants: employe.nombreEnfants,
    matricule: employe.matricule,
    dateEmbauche: employe.dateEmbauche,
    dateFinContrat: employe.dateFinContrat,
    coefficientHierarchique: employe.coefficientHierarchique,
    classification: employe.classification as Classification | null,
    salaireMensuelBrut: employe.salaireMensuelBrut,
    conventionCollective: employe.conventionCollective,
    iban: employe.iban,
    bic: employe.bic,
    dateDerniereVisiteMedicale: employe.dateDerniereVisiteMedicale,
    dateProchaineVisiteMedicale: employe.dateProchaineVisiteMedicale,
    aptitude: employe.aptitude as Aptitude | null,
    numeroCarteBtp: employe.numeroCarteBtp,
    dateValiditeCarteBtp: employe.dateValiditeCarteBtp,
  };

  return (
    <div className="space-y-6">
      <h2 className="text-xl font-medium">
        Dossier de {employe.nom} {employe.prenom}
      </h2>

      <EmployeForm
        defaultValues={defaultValues}
        onSubmit={async (values) => {
          'use server';
          return mettreAJourEmploye(id, values);
        }}
        successRedirect={`/rh/employes/${id}`}
      />

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Habilitations ({habilitations.length})</CardTitle>
        </CardHeader>
        <CardContent>
          <HabilitationsList
            items={habilitations.map((h) => ({
              id: h.id,
              type: h.type as TypeHabilitation,
              dateObtention: h.dateObtention,
              dateValidite: h.dateValidite,
              numero: h.numero,
              organisme: h.organisme,
              notes: h.notes,
            }))}
            peutEcrire={peutEcrire}
            actions={{
              creer: async (input) => {
                'use server';
                return creerHabilitation(id, input);
              },
              supprimer: async (habId) => {
                'use server';
                return supprimerHabilitation(habId);
              },
            }}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Permis ({permis.length})</CardTitle>
        </CardHeader>
        <CardContent>
          <PermisList
            items={permis.map((p) => ({
              id: p.id,
              categorie: p.categorie as CategoriePermis,
              dateObtention: p.dateObtention,
              dateValidite: p.dateValidite,
              numeroPermis: p.numeroPermis,
              notes: p.notes,
            }))}
            peutEcrire={peutEcrire}
            actions={{
              creer: async (input) => {
                'use server';
                return creerPermis(id, input);
              },
              supprimer: async (permisId) => {
                'use server';
                return supprimerPermis(permisId);
              },
            }}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Documents ({documents.length})</CardTitle>
        </CardHeader>
        <CardContent>
          <DocumentsList
            items={documents.map((d) => ({
              id: d.id,
              type: d.type as TypeDocumentEmploye,
              libelle: d.libelle,
              mimeType: d.mimeType,
              tailleBytes: d.tailleBytes,
              dateValidite: d.dateValidite,
              createdAt: d.createdAt.toISOString(),
            }))}
            peutEcrire={peutEcrire}
            actions={{
              preparerUpload: async (contentType, filename, tailleBytes) => {
                'use server';
                return preparerUploadDocument(id, contentType, filename, tailleBytes);
              },
              enregistrer: async (input) => {
                'use server';
                return enregistrerDocument(id, input);
              },
              getDownloadUrl: async (docId) => {
                'use server';
                return urlTelechargementDocument(docId);
              },
              supprimer: async (docId) => {
                'use server';
                return supprimerDocument(docId);
              },
            }}
          />
        </CardContent>
      </Card>

      <div className="border-t pt-6">
        <h3 className="mb-2 text-sm font-medium text-destructive">Zone dangereuse</h3>
        <DeleteButton
          label="Supprimer cet employé"
          confirmText="L'employé sera marqué supprimé. Refusé si des pointages lui sont rattachés."
          redirectTo="/rh/employes"
          action={async () => {
            'use server';
            return supprimerEmploye(id);
          }}
        />
      </div>
    </div>
  );
}
