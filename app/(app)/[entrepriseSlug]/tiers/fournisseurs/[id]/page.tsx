import Link from 'next/link';
import { notFound } from 'next/navigation';

import { DeleteButton } from '@/components/catalogue/delete-button';
import { ContactCreateButton } from '@/components/contacts/contact-create-button';
import { ContactsSection } from '@/components/contacts/contacts-section';
import { DocumentsTierList } from '@/components/tiers/documents-tier-list';
import { FournisseurForm } from '@/components/tiers/fournisseur-form';
import { buttonVariants } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { aPermission, requireAuthWithMfa } from '@/lib/auth/guards';
import { listerGrillesFournisseur } from '@/lib/catalogue/grilles-tarifaires';
import {
  enregistrerDocumentTier,
  listerDocumentsTier,
  preparerUploadDocumentTier,
  supprimerDocumentTier,
  urlTelechargementDocumentTier,
} from '@/lib/tiers/documents';
import {
  changerStatutFournisseur,
  lireFournisseur,
  listerFournisseurContacts,
  mettreAJourFournisseur,
  supprimerFournisseur,
} from '@/lib/tiers/fournisseurs';
import { peutEcrireTiers } from '@/lib/tiers/permissions';
import type { TypeDocumentTier } from '@/lib/validation/tiers';

export default async function FournisseurDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const utilisateur = await requireAuthWithMfa();
  const [fournisseur, grilles, contacts, documents, peutImporterCatalogue] = await Promise.all([
    lireFournisseur(id),
    listerGrillesFournisseur(id),
    listerFournisseurContacts(id),
    listerDocumentsTier({ type: 'fournisseur', id }),
    aPermission(utilisateur.roleId, 'CATALOGUE_IMPORT_FOURNISSEUR'),
  ]);
  if (!fournisseur) notFound();

  const peutEcrire = peutEcrireTiers(utilisateur.role);
  const peutImporter = peutEcrire && peutImporterCatalogue;
  const today = new Date().toISOString().slice(0, 10);

  const documentsSection = (
    <Card className="max-w-3xl">
      <CardHeader>
        <CardTitle className="text-base">Documents ({documents.length})</CardTitle>
      </CardHeader>
      <CardContent>
        <DocumentsTierList
          items={documents.map((d) => ({
            id: d.id,
            type: d.type as TypeDocumentTier,
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
              return preparerUploadDocumentTier(
                { type: 'fournisseur', id },
                contentType,
                filename,
                tailleBytes,
              );
            },
            enregistrer: async (input) => {
              'use server';
              return enregistrerDocumentTier({ type: 'fournisseur', id }, input);
            },
            getDownloadUrl: async (docId) => {
              'use server';
              return urlTelechargementDocumentTier(docId);
            },
            supprimer: async (docId) => {
              'use server';
              return supprimerDocumentTier(docId);
            },
          }}
        />
      </CardContent>
    </Card>
  );

  if (!peutEcrire) {
    return (
      <div className="max-w-3xl space-y-6">
        <h2 className="text-xl font-medium">{fournisseur.nom}</h2>
        <Card>
          <CardHeader>
            <CardTitle>Détails</CardTitle>
          </CardHeader>
          <CardContent>
            <dl className="grid grid-cols-[auto_1fr] gap-2 text-sm">
              <dt className="text-muted-foreground">Code</dt>
              <dd className="font-mono">{fournisseur.code}</dd>
              <dt className="text-muted-foreground">SIRET</dt>
              <dd className="font-mono">{fournisseur.siret ?? '—'}</dd>
              <dt className="text-muted-foreground">Email</dt>
              <dd>{fournisseur.email ?? '—'}</dd>
              <dt className="text-muted-foreground">Téléphone</dt>
              <dd>{fournisseur.telephone ?? '—'}</dd>
              <dt className="text-muted-foreground">Actif</dt>
              <dd>{fournisseur.actif ? 'Oui' : 'Non'}</dd>
            </dl>
          </CardContent>
        </Card>

        <GrillesSection fournisseurId={id} grilles={grilles} today={today} peutEcrire={false} />

        {documentsSection}
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <FournisseurForm
        titre={fournisseur.nom}
        fournisseurId={id}
        fournisseurNom={fournisseur.nom}
        peutImporterCatalogue={peutImporter}
        nouvelleGrilleHref={`/tiers/fournisseurs/${id}/grilles/nouveau`}
        defaultValues={{
          code: fournisseur.code,
          nom: fournisseur.nom,
          siret: fournisseur.siret,
          email: fournisseur.email,
          telephone: fournisseur.telephone,
          adresseLigne1: fournisseur.adresseLigne1,
          adresseLigne2: fournisseur.adresseLigne2,
          codePostal: fournisseur.codePostal,
          ville: fournisseur.ville,
          pays: fournisseur.pays,
          actif: fournisseur.actif,
        }}
        onSubmit={async (values) => {
          'use server';
          return mettreAJourFournisseur(id, values);
        }}
        onChangerStatut={async (actif) => {
          'use server';
          return changerStatutFournisseur(id, actif);
        }}
        actionContacts={<ContactCreateButton source="fournisseur" tiersId={id} />}
        successRedirect="/tiers/fournisseurs"
      />

      <ContactsSection
        source="fournisseur"
        tiersId={id}
        contacts={contacts.map((c) => ({
          id: c.id,
          nom: c.nom,
          prenom: c.prenom,
          fonction: c.fonction,
          email: c.email,
          telephoneMobile: c.telephoneMobile,
          telephoneFixe: c.telephoneFixe,
          notes: c.notes,
          principal: c.principal,
          actif: c.actif,
        }))}
        className="max-w-5xl"
      />

      <GrillesSection fournisseurId={id} grilles={grilles} today={today} peutEcrire />

      {documentsSection}

      <div className="max-w-3xl border-t pt-6">
        <h3 className="mb-2 text-sm font-medium text-destructive">Zone dangereuse</h3>
        <DeleteButton
          label="Supprimer ce fournisseur"
          confirmText="Le fournisseur sera marqué supprimé. Refusé s'il est utilisé dans des grilles tarifaires, des prix négociés ou comme fournisseur préféré d'un article."
          redirectTo="/tiers/fournisseurs"
          action={async () => {
            'use server';
            return supprimerFournisseur(id);
          }}
        />
      </div>
    </div>
  );
}

function GrillesSection({
  fournisseurId,
  grilles,
  today,
  peutEcrire,
}: {
  fournisseurId: string;
  grilles: Awaited<ReturnType<typeof listerGrillesFournisseur>>;
  today: string;
  peutEcrire: boolean;
}) {
  return (
    <section className="space-y-3">
      <div>
        <h3 className="text-lg font-medium">Grilles tarifaires</h3>
        <p className="text-sm text-muted-foreground">
          Liste d&apos;articles avec prix négociés sous une période de validité.
          {peutEcrire &&
            ' Utilisez « Import catalogue » ou « Création catalogue » en haut de la fiche.'}
        </p>
      </div>

      {grilles.length === 0 ? (
        <div className="rounded-md border border-dashed p-6 text-center text-sm text-muted-foreground">
          Aucune grille tarifaire pour ce fournisseur.
        </div>
      ) : (
        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Libellé</TableHead>
                <TableHead>Chantier</TableHead>
                <TableHead>Période</TableHead>
                <TableHead>Articles</TableHead>
                <TableHead>État</TableHead>
                <TableHead className="text-right" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {grilles.map((g) => {
                const enCours =
                  g.actif && g.validFrom <= today && (g.validTo === null || g.validTo >= today);
                return (
                  <TableRow key={g.id}>
                    <TableCell className="font-medium">{g.libelle}</TableCell>
                    <TableCell className="text-xs">
                      {g.chantierNumero ? (
                        <>
                          <span className="font-mono text-muted-foreground">
                            {g.chantierNumero}
                          </span>
                          <span className="ml-1">{g.chantierLibelle}</span>
                        </>
                      ) : (
                        <span className="italic text-muted-foreground">générale</span>
                      )}
                    </TableCell>
                    <TableCell className="text-sm">
                      {g.validFrom} → {g.validTo ?? '∞'}
                    </TableCell>
                    <TableCell>{g.nbLignes}</TableCell>
                    <TableCell>
                      {enCours ? (
                        <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs text-emerald-700">
                          En vigueur
                        </span>
                      ) : !g.actif ? (
                        <span className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
                          Inactive
                        </span>
                      ) : g.validFrom > today ? (
                        <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs text-amber-700">
                          À venir
                        </span>
                      ) : (
                        <span className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
                          Expirée
                        </span>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      <Link
                        href={`/tiers/fournisseurs/${fournisseurId}/grilles/${g.id}`}
                        className={buttonVariants({ variant: 'ghost', size: 'sm' })}
                      >
                        {peutEcrire ? 'Modifier' : 'Consulter'}
                      </Link>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}
    </section>
  );
}
