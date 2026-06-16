import { notFound } from 'next/navigation';

import { AffectationSection } from '@/components/flotte/affectation-section';
import { DeleteVehiculeButton } from '@/components/flotte/delete-vehicule-button';
import { DocumentsVehiculeList } from '@/components/flotte/documents-vehicule-list';
import { EcheancesSection } from '@/components/flotte/echeances-section';
import { EntretiensSection } from '@/components/flotte/entretiens-section';
import { PleinsSection } from '@/components/flotte/pleins-section';
import { SinistresSection } from '@/components/flotte/sinistres-section';
import { VehiculeForm } from '@/components/flotte/vehicule-form';
import { VehiculeRail } from '@/components/flotte/vehicule-rail';
import { requireTenantContextWithMfa } from '@/lib/auth/tenant-guards';
import { listerChantiersPourSelecteur } from '@/lib/chantiers/chantiers';
import { creerAffectation, terminerAffectation } from '@/lib/flotte/affectations';
import {
  enregistrerDocumentVehicule,
  listerDocumentsVehicule,
  preparerUploadDocumentVehicule,
  supprimerDocumentVehicule,
  urlTelechargementDocumentVehicule,
} from '@/lib/flotte/documents';
import { enregistrerEcheance, supprimerEcheance } from '@/lib/flotte/echeances-actions';
import { enregistrerEntretien, supprimerEntretien } from '@/lib/flotte/entretiens';
import { enregistrerPlein, supprimerPlein } from '@/lib/flotte/pleins';
import { cloturerSinistre, enregistrerSinistre, supprimerSinistre } from '@/lib/flotte/sinistres';
import { peutAffecterFlotte, peutEcrireFlotte } from '@/lib/flotte/permissions';
import {
  aujourdhuiIso,
  listerAffectationsVehicule,
  listerEcheancesVehicule,
  listerEntretiensVehicule,
  listerFournisseursPourSelecteur,
  listerPleinsVehicule,
  listerSinistresVehicule,
  lireVehicule,
} from '@/lib/flotte/queries';
import { modifierVehicule, supprimerVehicule } from '@/lib/flotte/vehicules';
import { listerEmployesActifs } from '@/lib/rh/employes';
import {
  LIBELLES_CARBURANT,
  LIBELLES_TYPE_VEHICULE,
  type VehiculeInput,
} from '@/lib/validation/flotte';

function Bloc({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="overflow-hidden rounded-xl border bg-card">
      <div className="px-5 py-3">
        <h2 className="font-semibold text-orange-700">{title}</h2>
        {description && <p className="text-xs text-muted-foreground">{description}</p>}
      </div>
      <div className="border-t px-5 py-4">{children}</div>
    </section>
  );
}

export default async function VehiculeFichePage({
  params,
}: {
  params: Promise<{ entrepriseSlug: string; id: string }>;
}) {
  const ctx = await requireTenantContextWithMfa();
  if (!ctx.entreprise.flotteAutomobileActive) notFound();
  const { id } = await params;

  const [
    vehicule,
    echeances,
    affectations,
    documents,
    employes,
    chantiers,
    entretiens,
    sinistres,
    pleinsData,
    fournisseurs,
  ] = await Promise.all([
    lireVehicule(id),
    listerEcheancesVehicule(id),
    listerAffectationsVehicule(id),
    listerDocumentsVehicule(id),
    listerEmployesActifs(),
    listerChantiersPourSelecteur(),
    listerEntretiensVehicule(id),
    listerSinistresVehicule(id),
    listerPleinsVehicule(id),
    listerFournisseursPourSelecteur(),
  ]);
  if (!vehicule) notFound();

  const peutEcrire = peutEcrireFlotte(ctx.utilisateur.role);
  const peutAffecter = peutAffecterFlotte(ctx.utilisateur.role);
  const today = aujourdhuiIso();
  const base = `/${ctx.entreprise.slug}/flotte/vehicules`;
  const affectationCourante = affectations.find((a) => a.statut === 'en_cours') ?? null;
  const electrique = vehicule.carburant === 'electrique';
  const employesOptions = employes.map((e) => ({
    id: e.id,
    label: [e.nom, e.prenom].filter(Boolean).join(' '),
  }));

  const defaultValues: Partial<VehiculeInput> = {
    id: vehicule.id,
    immatriculation: vehicule.immatriculation,
    codeInterne: vehicule.codeInterne,
    typeVehicule: vehicule.typeVehicule,
    marque: vehicule.marque,
    modele: vehicule.modele,
    version: vehicule.version,
    vin: vehicule.vin,
    carburant: vehicule.carburant,
    datePremiereImmat: vehicule.datePremiereImmat,
    puissanceFiscale: vehicule.puissanceFiscale,
    critair: vehicule.critair,
    places: vehicule.places,
    ptacKg: vehicule.ptacKg,
    couleur: vehicule.couleur,
    modeDetention: vehicule.modeDetention,
    dateAcquisition: vehicule.dateAcquisition,
    prixAcquisitionHt: vehicule.prixAcquisitionHt,
    valeurResiduelleHt: vehicule.valeurResiduelleHt,
    loyerMensuelHt: vehicule.loyerMensuelHt,
    organismeFinancement: vehicule.organismeFinancement,
    kilometrageActuel: vehicule.kilometrageActuel,
    dateReleveKm: vehicule.dateReleveKm,
    conducteurPrincipalId: vehicule.conducteurPrincipalId,
    statut: vehicule.statut,
    dateSortieParc: vehicule.dateSortieParc,
    prixReventeHt: vehicule.prixReventeHt,
    notes: vehicule.notes,
  };

  return (
    <div className="space-y-5">
      <VehiculeForm
        titre={`${vehicule.marque} ${vehicule.modele}`}
        sousTitre={`${vehicule.immatriculation} · ${LIBELLES_TYPE_VEHICULE[vehicule.typeVehicule]} · ${LIBELLES_CARBURANT[vehicule.carburant]}`}
        backHref={base}
        backLabel="Véhicules"
        employes={employes.map((e) => ({
          id: e.id,
          nom: [e.nom, e.prenom].filter(Boolean).join(' '),
        }))}
        defaultValues={defaultValues}
        onSubmit={async (values) => {
          'use server';
          return modifierVehicule(values);
        }}
        successRedirect={`${base}/${id}`}
        railBottom={
          <VehiculeRail
            today={today}
            statut={vehicule.statut}
            kilometrageActuel={vehicule.kilometrageActuel}
            modeDetention={vehicule.modeDetention}
            loyerMensuelHt={vehicule.loyerMensuelHt}
            echeances={echeances.map((e) => ({
              id: e.id,
              typeEcheance: e.typeEcheance,
              dateEcheance: e.dateEcheance,
              seuilAlerteJours: e.seuilAlerteJours,
            }))}
            affectation={
              affectationCourante
                ? {
                    employe: affectationCourante.employe,
                    chantier: affectationCourante.chantier,
                    dateDebut: affectationCourante.dateDebut,
                  }
                : null
            }
            synthese={{
              coutEntretiens: entretiens.reduce(
                (acc, e) => acc + (e.coutHt ? Number(e.coutHt) : 0),
                0,
              ),
              sinistresOuverts: sinistres.filter((s) => !s.clos).length,
              electrique,
              consoMoyenneLitres100: pleinsData.synthese.consoMoyenneLitres100,
              consoMoyenneKwh100: pleinsData.synthese.consoMoyenneKwh100,
            }}
          />
        }
      />

      <Bloc
        title="Échéances réglementaires"
        description="Contrôle technique, assurance, carte grise, Crit'Air… Statut recalculé en direct (rappel J-30)."
      >
        <EcheancesSection
          vehiculeId={id}
          echeances={echeances.map((e) => ({
            id: e.id,
            typeEcheance: e.typeEcheance,
            dateEcheance: e.dateEcheance,
            seuilAlerteJours: e.seuilAlerteJours,
            reference: e.reference,
            prestataire: e.prestataire,
          }))}
          today={today}
          peutEcrire={peutEcrire}
          actions={{
            enregistrer: async (input) => {
              'use server';
              return enregistrerEcheance(input);
            },
            supprimer: async (echeanceId) => {
              'use server';
              return supprimerEcheance(echeanceId);
            },
          }}
        />
      </Bloc>

      <Bloc
        title="Affectations"
        description="Conducteur et/ou chantier, avec historique. La validité du permis est vérifiée à l'affectation."
      >
        <AffectationSection
          vehiculeId={id}
          affectations={affectations}
          peutAffecter={peutAffecter}
          employes={employesOptions}
          chantiers={chantiers.map((c) => ({ id: c.id, label: `${c.numero} · ${c.libelle}` }))}
          actions={{
            creer: async (input) => {
              'use server';
              return creerAffectation(input);
            },
            terminer: async (affectationId) => {
              'use server';
              return terminerAffectation(affectationId);
            },
          }}
        />
      </Bloc>

      <Bloc
        title="Entretiens & maintenance"
        description="Révisions, vidanges, pneumatiques, réparations… Le kilométrage saisi met à jour l'odomètre du véhicule."
      >
        <EntretiensSection
          vehiculeId={id}
          entretiens={entretiens.map((e) => ({
            id: e.id,
            typeEntretien: e.typeEntretien,
            dateEntretien: e.dateEntretien,
            kilometrage: e.kilometrage,
            description: e.description,
            prestataire: e.prestataire,
            fournisseurNom: e.fournisseurNom,
            coutHt: e.coutHt,
            garantie: e.garantie,
          }))}
          fournisseurs={fournisseurs}
          peutEcrire={peutEcrire}
          actions={{
            enregistrer: async (input) => {
              'use server';
              return enregistrerEntretien(input);
            },
            supprimer: async (entretienId) => {
              'use server';
              return supprimerEntretien(entretienId);
            },
          }}
        />
      </Bloc>

      <Bloc
        title="Sinistres"
        description="Accidents, bris, vols partiels… Suivi de la responsabilité, des montants et de la clôture du dossier."
      >
        <SinistresSection
          vehiculeId={id}
          sinistres={sinistres.map((s) => ({
            id: s.id,
            dateSinistre: s.dateSinistre,
            numeroSinistre: s.numeroSinistre,
            lieu: s.lieu,
            responsabilite: s.responsabilite,
            tiersImplique: s.tiersImplique,
            montantDommagesHt: s.montantDommagesHt,
            franchiseHt: s.franchiseHt,
            clos: s.clos,
            dateCloture: s.dateCloture,
            conducteurNom: s.conducteurNom,
          }))}
          employes={employesOptions}
          peutEcrire={peutEcrire}
          actions={{
            enregistrer: async (input) => {
              'use server';
              return enregistrerSinistre(input);
            },
            cloturer: async (sinistreId) => {
              'use server';
              return cloturerSinistre(sinistreId);
            },
            supprimer: async (sinistreId) => {
              'use server';
              return supprimerSinistre(sinistreId);
            },
          }}
        />
      </Bloc>

      <Bloc
        title={electrique ? 'Recharges & consommation' : 'Pleins & consommation'}
        description="Consommation calculée par la méthode plein-à-plein (entre deux pleins complets). N° de carte chiffré."
      >
        <PleinsSection
          vehiculeId={id}
          pleins={pleinsData.pleins}
          synthese={pleinsData.synthese}
          employes={employesOptions}
          electrique={electrique}
          peutEcrire={peutEcrire}
          actions={{
            enregistrer: async (input) => {
              'use server';
              return enregistrerPlein(input);
            },
            supprimer: async (pleinId) => {
              'use server';
              return supprimerPlein(pleinId);
            },
          }}
        />
      </Bloc>

      <Bloc
        title="Documents"
        description="Carte grise, attestation d'assurance, PV de contrôle technique, factures… Stockage MinIO chiffré, max 25 Mo."
      >
        <DocumentsVehiculeList
          items={documents.map((d) => ({
            id: d.id,
            typeDocument: d.typeDocument,
            libelle: d.libelle,
            mimeType: d.mimeType,
            tailleBytes: d.tailleBytes,
            dateValidite: d.dateValidite,
            createdAt: d.createdAt.toISOString(),
          }))}
          peutEcrire={peutEcrire}
          today={today}
          actions={{
            preparerUpload: async (contentType, filename, tailleBytes) => {
              'use server';
              return preparerUploadDocumentVehicule(id, contentType, filename, tailleBytes);
            },
            enregistrer: async (input) => {
              'use server';
              return enregistrerDocumentVehicule(id, input);
            },
            getDownloadUrl: async (documentId) => {
              'use server';
              return urlTelechargementDocumentVehicule(documentId);
            },
            supprimer: async (documentId) => {
              'use server';
              return supprimerDocumentVehicule(documentId);
            },
          }}
        />
      </Bloc>

      {peutEcrire && (
        <section className="rounded-xl border border-destructive/30 bg-card p-5">
          <h2 className="font-semibold text-destructive">Zone dangereuse</h2>
          <p className="mb-3 text-xs text-muted-foreground">
            La suppression est refusée si le véhicule est référencé (échéances, affectations,
            documents…). Pour sortir un véhicule du parc, changez plutôt son statut (vendu /
            réformé).
          </p>
          <DeleteVehiculeButton
            successRedirect={base}
            onDelete={async () => {
              'use server';
              return supprimerVehicule(id);
            }}
          />
        </section>
      )}
    </div>
  );
}
