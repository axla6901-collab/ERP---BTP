import Link from 'next/link';
import { notFound } from 'next/navigation';

import { CreerDepuisDevisButton } from '@/components/chantiers/creer-depuis-devis-button';
import { DevisEditor } from '@/components/commercial/devis-editor';
import { WorkflowDevis } from '@/components/commercial/workflow-devis';
import { buttonVariants } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { aPermission, requireAuthWithMfa } from '@/lib/auth/guards';
import { listerArticlesAvecPrix } from '@/lib/catalogue/articles';
import { listerUnites } from '@/lib/catalogue/unites';
import { creerChantierDepuisDevis } from '@/lib/chantiers/chantiers';
import { peutEcrireChantier } from '@/lib/chantiers/permissions';
import { listerClients } from '@/lib/commercial/clients';
import {
  changerStatutDevis,
  dupliquerDevis,
  lireDevis,
  mettreAJourDevis,
} from '@/lib/commercial/devis';
import { analyserClasseurDpgf, importerAvecMappingDpgf } from '@/lib/commercial/import-dpgf';
import { peutEcrireCommercial } from '@/lib/commercial/permissions';
import { peutEcrireFacturation } from '@/lib/facturation/permissions';
import {
  type DevisInput,
  type LigneDevisInput,
  type PosteInterneFormInput,
  type StatutDevis,
} from '@/lib/validation/commercial';

function libelleClient(c: {
  type: string;
  raisonSociale: string | null;
  nom: string | null;
  prenom: string | null;
}): string {
  if (c.type === 'professionnel') return c.raisonSociale ?? '?';
  return [c.prenom, c.nom].filter(Boolean).join(' ') || '?';
}

export default async function DevisDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const utilisateur = await requireAuthWithMfa();
  const peutEcrire = peutEcrireCommercial(utilisateur.role);
  const devis = await lireDevis(id);
  if (!devis) notFound();

  // Reconstruire DevisInput pour l'editor
  const lignesInput: LigneDevisInput[] = devis.lignes.map((l) => {
    const composants = l.composants.map((c) =>
      c.type === 'libre'
        ? {
            type: 'libre' as const,
            articleId: null,
            designation: c.designation ?? '',
            quantiteParUnite: c.quantiteParUnite,
            prixUnitaireHt: c.prixUnitaireHt,
            tauxTva: c.tauxTva,
            remisePourcent: c.remisePourcent,
            notes: c.notes,
          }
        : {
            type: 'article_catalogue' as const,
            articleId: c.articleId!,
            designation: null,
            quantiteParUnite: c.quantiteParUnite,
            prixUnitaireHt: c.prixUnitaireHt,
            tauxTva: null,
            remisePourcent: null,
            notes: c.notes,
          },
    );
    if (l.type === 'section') {
      return {
        type: 'section',
        designation: l.designation,
        articleId: null,
        quantite: null,
        unite: null,
        prixUnitaireHt: null,
        tauxTva: null,
        remisePourcent: null,
        notes: l.notes,
        composants: [],
        origineDpgf: l.origineDpgf,
      } as LigneDevisInput;
    }
    if (l.type === 'article_catalogue') {
      return {
        type: 'article_catalogue',
        articleId: l.articleId ?? '',
        designation: l.designation,
        quantite: l.quantite ?? '0',
        unite: l.unite ?? 'u',
        prixUnitaireHt: l.prixUnitaireHt ?? '0',
        tauxTva: l.tauxTva ?? '20.00',
        remisePourcent: l.remisePourcent ?? '0',
        notes: l.notes,
        composants,
        origineDpgf: l.origineDpgf,
      } as LigneDevisInput;
    }
    return {
      type: 'libre',
      articleId: null,
      designation: l.designation,
      quantite: l.quantite ?? '0',
      unite: l.unite ?? 'u',
      prixUnitaireHt: l.prixUnitaireHt ?? '0',
      tauxTva: l.tauxTva ?? '20.00',
      remisePourcent: l.remisePourcent ?? '0',
      notes: l.notes,
      composants,
      origineDpgf: l.origineDpgf,
    } as LigneDevisInput;
  });

  const postesInternesInput: PosteInterneFormInput[] = devis.postesInternes.map((p) =>
    p.portee === 'devis'
      ? {
          portee: 'devis',
          chapitreOrdre: null,
          libelle: p.libelle,
          montantHt: p.montantHt,
          notes: p.notes ?? null,
          repartitions: p.repartitions,
        }
      : {
          portee: 'chapitre',
          chapitreOrdre: p.chapitreOrdre ?? 0,
          libelle: p.libelle,
          montantHt: p.montantHt,
          notes: p.notes ?? null,
          repartitions: p.repartitions,
        },
  );

  const defaultValues: Partial<DevisInput> = {
    clientId: devis.client.id,
    dateDevis: String(devis.dateDevis),
    dateValidite: String(devis.dateValidite),
    objet: devis.objet,
    conditionsGenerales: devis.conditionsGenerales,
    notes: devis.notes,
    lignes: lignesInput,
    postesInternes: postesInternesInput,
    remiseGlobaleType: devis.remiseGlobaleType as DevisInput['remiseGlobaleType'],
    remiseGlobaleValeur: devis.remiseGlobaleValeur,
  };

  const editionPossible =
    peutEcrire && (devis.statut === 'brouillon' || devis.statut === 'refuse');
  const peutCreerChantier = peutEcrireChantier(utilisateur.role);
  const peutFacturer = peutEcrireFacturation(utilisateur.role);
  const chantierLie = devis.chantierId ?? null;

  const [clients, articles, unites, peutImporterDpgf, peutGererPostesInternes, peutVersionner] = await Promise.all([
    listerClients(),
    listerArticlesAvecPrix(),
    listerUnites(),
    aPermission(utilisateur.roleId, 'COMMERCIAL_DEVIS_IMPORT_DPGF'),
    aPermission(utilisateur.roleId, 'COMMERCIAL_DEVIS_POSTES_INTERNES'),
    aPermission(utilisateur.roleId, 'COMMERCIAL_DEVIS_VERSION'),
  ]);

  const changerStatutAction = async (devisId: string, nouveau: StatutDevis) => {
    'use server';
    return changerStatutDevis(devisId, nouveau);
  };

  return (
    <div className="space-y-6">
      {!editionPossible && (
        <WorkflowDevis
          devisId={id}
          numero={devis.numero}
          statutCourant={devis.statut as StatutDevis}
          readOnly={!peutEcrire}
          action={changerStatutAction}
        />
      )}

      {devis.statut === 'gagne' && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Chantier &amp; facturation</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            {chantierLie ? (
              <p>
                Devis lié au chantier :{' '}
                <Link
                  href={`/chantiers/${chantierLie}`}
                  className="underline underline-offset-4"
                >
                  voir le chantier
                </Link>
                .
              </p>
            ) : peutCreerChantier ? (
              <CreerDepuisDevisButton
                devisId={id}
                action={async (devisId) => {
                  'use server';
                  return creerChantierDepuisDevis(devisId);
                }}
              />
            ) : (
              <p className="text-muted-foreground">
                Aucun chantier rattaché. (Droits insuffisants pour le créer.)
              </p>
            )}
            {chantierLie && peutFacturer && (
              <div className="border-t pt-3">
                <p className="mb-2 text-muted-foreground">
                  Les lignes du devis serviront de base à la situation : tu n&apos;auras qu&apos;à saisir le % d&apos;avancement par poste.
                </p>
                <Link
                  href={`/facturation/situations/nouveau?chantierId=${chantierLie}&devisId=${id}`}
                  className={buttonVariants()}
                >
                  Créer une situation depuis ce devis
                </Link>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {editionPossible ? (
        <DevisEditor
          clients={clients.map((c) => ({
            id: c.id,
            code: c.code,
            libelle: libelleClient(c),
            adresseLigne1: c.adresseLigne1,
            adresseLigne2: c.adresseLigne2,
            codePostal: c.codePostal,
            ville: c.ville,
            email: c.email,
          }))}
          articles={articles.map((a) => ({
            id: a.id,
            code: a.code,
            libelle: a.libelle,
            uniteVenteSymbole: a.uniteVenteSymbole,
            prixCourant: a.prixCourant,
          }))}
          unites={unites.map((u) => ({ symbole: u.symbole, libelle: u.libelle }))}
          defaultValues={defaultValues}
          onSubmit={async (values) => {
            'use server';
            return mettreAJourDevis(id, values);
          }}
          analyserDpgfAction={
            peutImporterDpgf
              ? async (base64, nom) => {
                  'use server';
                  return analyserClasseurDpgf(base64, nom);
                }
              : undefined
          }
          importerDpgfAction={
            peutImporterDpgf
              ? async (base64, nom, mapping) => {
                  'use server';
                  return importerAvecMappingDpgf(base64, nom, mapping);
                }
              : undefined
          }
          peutGererPostesInternes={peutGererPostesInternes}
          successRedirect="/commercial/devis"
          workflowDevisId={id}
          workflowNumero={devis.numero}
          workflowStatutCourant={devis.statut as StatutDevis}
          workflowReadOnly={!peutEcrire}
          workflowChangerStatutAction={changerStatutAction}
          workflowPeutVersionner={peutVersionner}
          workflowDupliquerAction={async (mode) => {
            'use server';
            return dupliquerDevis(id, mode);
          }}
        />
      ) : (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Devis verrouillé en édition</CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            {devis.statut === 'brouillon' || devis.statut === 'refuse'
              ? 'Tu n\'as pas les droits pour modifier ce devis.'
              : 'Seuls les devis en brouillon ou refusés peuvent être modifiés. Pour ce devis, créer un nouveau devis (clone à venir en M3.2) ou changer le statut.'}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
