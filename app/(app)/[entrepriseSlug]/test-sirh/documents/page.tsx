import { LockIcon } from 'lucide-react';

import { PageToolbar } from '@/components/layout/page-toolbar';
import { DocumentsGed } from '@/components/test-sirh/documents/documents-ged';
import {
  DossierCourantBandeau,
  NouveauDossierBouton,
  type ActionsDossiers,
} from '@/components/test-sirh/documents/dossiers-gestion';
import { FilterRailItem, FilterRailSection } from '@/components/ui/filter-rail-section';
import { ListLayout } from '@/components/ui/list-layout';
import { aujourdhuiIso } from '@/lib/test-sirh/calendrier';
import { baseSirh, exigerContexteSirhPage } from '@/lib/test-sirh/contexte';
import {
  enregistrerDossierDocuments,
  marquerDocumentSigne,
  modifierDocumentSirh,
  supprimerDossierDocuments,
} from '@/lib/test-sirh/documents/actions';
import {
  compteursDocuments,
  listerDocumentsGed,
  listerDossiersDocumentsAvecCompteurs,
} from '@/lib/test-sirh/documents/queries';
import {
  SEUIL_EXPIRATION_JOURS,
  lireFiltresDocuments,
  urlDocuments,
  valeurFiltreConcerne,
  valeurFiltreDossier,
} from '@/lib/test-sirh/documents/regles';
import { peutGererSirh, peutVoirPaieSirh, ROLES_SIRH_LECTURE } from '@/lib/test-sirh/permissions';
import { listerEmployesOptions, type OptionEmploye } from '@/lib/test-sirh/referentiels';
import {
  creerDocumentSirh,
  preparerUploadSirh,
  supprimerDocumentSirh,
  urlTelechargementDocumentSirh,
} from '@/lib/test-sirh/stockage';
import type { DossierDocumentsInput } from '@/lib/validation/test-sirh/documents';

/** Test SIRH › Documents RH (GED — Factorial documents : Folder / Document). */
export default async function DocumentsPage({
  searchParams,
}: {
  searchParams: Promise<{ dossier?: string; employe?: string }>;
}) {
  const ctx = await exigerContexteSirhPage(ROLES_SIRH_LECTURE);
  const filtres = lireFiltresDocuments(await searchParams);
  const base = baseSirh(ctx);
  const url = `${base}/documents`;
  const today = aujourdhuiIso();
  const peutGerer = peutGererSirh(ctx.utilisateur.role);
  const voitTout = peutGerer || peutVoirPaieSirh(ctx.utilisateur.role);

  const [documents, dossiers, compteurs, employes] = await Promise.all([
    listerDocumentsGed(filtres),
    listerDossiersDocumentsAvecCompteurs(),
    compteursDocuments(),
    voitTout
      ? listerEmployesOptions({ inclureInactifs: true })
      : Promise.resolve([] as OptionEmploye[]),
  ]);

  const valeurDossier = valeurFiltreDossier(filtres.dossier);
  const valeurConcerne = valeurFiltreConcerne(filtres.concerne);
  const filtreDossier = filtres.dossier;
  const dossierCourant =
    filtreDossier.type === 'dossier'
      ? (dossiers.find((d) => d.id === filtreDossier.id) ?? null)
      : null;
  const optionsEmployes = employes.map((e) => ({
    id: e.id,
    label: e.actif ? e.label : `${e.label} (inactif)`,
  }));
  const optionsDossiers = dossiers.map((d) => ({
    id: d.id,
    label: d.nom,
    visibleSalarie: d.visibleSalarie,
  }));
  const ordreSuivant = dossiers.reduce((max, d) => Math.max(max, d.ordre), 0) + 10;

  const actionsDossiers: ActionsDossiers = {
    enregistrer: async (input: DossierDocumentsInput) => {
      'use server';
      return enregistrerDossierDocuments(input);
    },
    supprimer: async (id: string) => {
      'use server';
      return supprimerDossierDocuments(id);
    },
  };

  return (
    <div className="space-y-4">
      <PageToolbar
        title="Documents RH"
        subtitle={`${compteurs.tous} document${compteurs.tous > 1 ? 's' : ''} · ${compteurs.expirant} à échéance ≤ ${SEUIL_EXPIRATION_JOURS} j`}
        backHref={base}
        backLabel="Test SIRH"
      />

      <ListLayout
        aside={
          <>
            <FilterRailSection
              title="Dossiers"
              action={
                peutGerer ? (
                  <NouveauDossierBouton
                    onEnregistrer={actionsDossiers.enregistrer}
                    ordreSuivant={ordreSuivant}
                  />
                ) : undefined
              }
            >
              <div className="space-y-0.5">
                <FilterRailItem
                  label="Tous les documents"
                  count={compteurs.tous}
                  active={filtres.dossier.type === 'tous'}
                  href={urlDocuments(url, { employe: valeurConcerne })}
                />
                {dossiers.map((d) => (
                  <FilterRailItem
                    key={d.id}
                    label={
                      <span className="inline-flex items-center gap-1.5">
                        {d.nom}
                        {!d.visibleSalarie && (
                          <LockIcon
                            className="size-3 text-muted-foreground"
                            aria-label="Non visible par le salarié"
                          />
                        )}
                      </span>
                    }
                    count={d.nbDocuments}
                    active={dossierCourant?.id === d.id}
                    href={urlDocuments(url, { dossier: d.id, employe: valeurConcerne })}
                  />
                ))}
                {(compteurs.sansDossier > 0 || filtres.dossier.type === 'sans') && (
                  <FilterRailItem
                    label="Sans dossier"
                    count={compteurs.sansDossier}
                    active={filtres.dossier.type === 'sans'}
                    href={urlDocuments(url, { dossier: 'sans', employe: valeurConcerne })}
                  />
                )}
              </div>
            </FilterRailSection>
            <FilterRailSection title="Échéances">
              <FilterRailItem
                label={`Expirant ≤ ${SEUIL_EXPIRATION_JOURS} j`}
                count={compteurs.expirant}
                active={filtres.dossier.type === 'expirant'}
                href={urlDocuments(url, { dossier: 'expirant', employe: valeurConcerne })}
              />
              <p className="mt-2 text-xs text-muted-foreground">
                Documents expirés ou arrivant à échéance (habilitations, visites, titres de
                séjour…).
              </p>
            </FilterRailSection>
          </>
        }
      >
        <div className="space-y-4">
          {dossierCourant && (
            <DossierCourantBandeau
              dossier={dossierCourant}
              peutGerer={peutGerer}
              actions={actionsDossiers}
              urlApresSuppression={urlDocuments(url, { employe: valeurConcerne })}
            />
          )}
          {!voitTout && (
            <p className="rounded-md border border-dashed px-4 py-2 text-xs text-muted-foreground">
              Vous voyez les documents d’entreprise partagés avec les salariés. Les pièces
              individuelles des salariés sont réservées aux RH et à la paie.
            </p>
          )}
          <DocumentsGed
            documents={documents}
            today={today}
            peutGerer={peutGerer}
            base={url}
            filtreDossier={valeurDossier}
            filtreConcerne={valeurConcerne}
            employes={optionsEmployes}
            dossiers={optionsDossiers}
            actions={{
              modifier: async (input) => {
                'use server';
                return modifierDocumentSirh(input);
              },
              supprimer: async (id) => {
                'use server';
                return supprimerDocumentSirh(id);
              },
              signer: async (id) => {
                'use server';
                return marquerDocumentSigne(id);
              },
              urlTelechargement: async (id) => {
                'use server';
                return urlTelechargementDocumentSirh(id);
              },
              televersement: {
                preparerUpload: async (cible, contentType, filename, tailleBytes) => {
                  'use server';
                  return preparerUploadSirh(cible, contentType, filename, tailleBytes);
                },
                creerDocument: async (input) => {
                  'use server';
                  return creerDocumentSirh(input);
                },
              },
            }}
          />
        </div>
      </ListLayout>
    </div>
  );
}
