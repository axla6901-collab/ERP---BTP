import { notFound } from 'next/navigation';

import { DeleteButton } from '@/components/catalogue/delete-button';
import { ContactCreateButton } from '@/components/contacts/contact-create-button';
import { ContactsSection } from '@/components/contacts/contacts-section';
import { DocumentsTierList } from '@/components/tiers/documents-tier-list';
import { SousTraitantForm } from '@/components/tiers/sous-traitant-form';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { requireAuthWithMfa } from '@/lib/auth/guards';
import {
  enregistrerDocumentTier,
  listerDocumentsTier,
  preparerUploadDocumentTier,
  supprimerDocumentTier,
  urlTelechargementDocumentTier,
} from '@/lib/tiers/documents';
import { peutEcrireTiers } from '@/lib/tiers/permissions';
import {
  changerStatutSousTraitant,
  lireSousTraitant,
  listerSousTraitantContacts,
  listerSousTraitants,
  mettreAJourSousTraitant,
  supprimerSousTraitant,
} from '@/lib/tiers/sous-traitants';
import { STATUT_SOUS_TRAITANT_LABELS, type TypeDocumentTier } from '@/lib/validation/tiers';

function formatDate(iso: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString('fr-FR');
}

export default async function SousTraitantDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const utilisateur = await requireAuthWithMfa();
  const [sousTraitant, contacts, documents, tousSousTraitants] = await Promise.all([
    lireSousTraitant(id),
    listerSousTraitantContacts(id),
    listerDocumentsTier({ type: 'sous_traitant', id }),
    listerSousTraitants(),
  ]);
  if (!sousTraitant) notFound();

  const peutEcrire = peutEcrireTiers(utilisateur.role);
  // Parents de cascade possibles : actifs, hors soi-même. Le trigger SQL
  // trg_st_anti_cycle reste le garde-fou contre les cycles/profondeur > 3.
  const parentsPossibles = tousSousTraitants
    .filter((s) => s.actif && s.id !== id)
    .map((s) => ({ id: s.id, code: s.code, nom: s.nom }));
  const today = new Date().toISOString().slice(0, 10);

  const documentsSection = (
    <Card className="max-w-2xl">
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
                { type: 'sous_traitant', id },
                contentType,
                filename,
                tailleBytes,
              );
            },
            enregistrer: async (input) => {
              'use server';
              return enregistrerDocumentTier({ type: 'sous_traitant', id }, input);
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
      <div className="space-y-4 max-w-xl">
        <h2 className="text-xl font-medium">{sousTraitant.nom}</h2>
        <Card>
          <CardHeader>
            <CardTitle>Détails</CardTitle>
          </CardHeader>
          <CardContent>
            <dl className="grid grid-cols-[auto_1fr] gap-2 text-sm">
              <dt className="text-muted-foreground">Code</dt>
              <dd className="font-mono">{sousTraitant.code}</dd>
              <dt className="text-muted-foreground">SIRET</dt>
              <dd className="font-mono">{sousTraitant.siret ?? '—'}</dd>
              <dt className="text-muted-foreground">N° TVA intracom</dt>
              <dd className="font-mono">{sousTraitant.nTvaIntra ?? '—'}</dd>
              <dt className="text-muted-foreground">Email</dt>
              <dd>{sousTraitant.email ?? '—'}</dd>
              <dt className="text-muted-foreground">Téléphone</dt>
              <dd>{sousTraitant.telephone ?? '—'}</dd>
              <dt className="text-muted-foreground">Décennale n°</dt>
              <dd>{sousTraitant.assuranceDecennaleNum ?? '—'}</dd>
              <dt className="text-muted-foreground">Décennale jusqu&apos;au</dt>
              <dd>{formatDate(sousTraitant.assuranceDecennaleDateFin)}</dd>
              <dt className="text-muted-foreground">Attestation URSSAF</dt>
              <dd>{formatDate(sousTraitant.dateAttestationUrssaf)}</dd>
              <dt className="text-muted-foreground">Agrément DC4</dt>
              <dd>{sousTraitant.agrementDc4 ? 'Oui' : 'Non'}</dd>
              <dt className="text-muted-foreground">Qualifications</dt>
              <dd>
                {sousTraitant.qualifications.length === 0
                  ? '—'
                  : sousTraitant.qualifications.join(', ')}
              </dd>
              <dt className="text-muted-foreground">Statut d&apos;agrément</dt>
              <dd>{STATUT_SOUS_TRAITANT_LABELS[sousTraitant.statut]}</dd>
              <dt className="text-muted-foreground">Actif</dt>
              <dd>{sousTraitant.actif ? 'Oui' : 'Non'}</dd>
            </dl>
          </CardContent>
        </Card>

        {documentsSection}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <SousTraitantForm
        titre={sousTraitant.nom}
        parentsPossibles={parentsPossibles}
        defaultValues={{
          code: sousTraitant.code,
          nom: sousTraitant.nom,
          parentStId: sousTraitant.parentStId,
          tauxRetenueGarantie: sousTraitant.tauxRetenueGarantie,
          siret: sousTraitant.siret,
          nTvaIntra: sousTraitant.nTvaIntra,
          email: sousTraitant.email,
          telephone: sousTraitant.telephone,
          adresseLigne1: sousTraitant.adresseLigne1,
          adresseLigne2: sousTraitant.adresseLigne2,
          codePostal: sousTraitant.codePostal,
          ville: sousTraitant.ville,
          pays: sousTraitant.pays,
          assuranceDecennaleNum: sousTraitant.assuranceDecennaleNum,
          assuranceDecennaleDateFin: sousTraitant.assuranceDecennaleDateFin,
          qualifications: sousTraitant.qualifications,
          agrementDc4: sousTraitant.agrementDc4,
          dateAttestationUrssaf: sousTraitant.dateAttestationUrssaf,
          statut: sousTraitant.statut,
          actif: sousTraitant.actif,
        }}
        onSubmit={async (values) => {
          'use server';
          return mettreAJourSousTraitant(id, values);
        }}
        onChangerStatut={async (actif) => {
          'use server';
          return changerStatutSousTraitant(id, actif);
        }}
        actionContacts={<ContactCreateButton source="sous_traitant" tiersId={id} />}
        successRedirect="/tiers/sous-traitants"
      />

      <ContactsSection
        source="sous_traitant"
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
        className="max-w-2xl"
      />

      {documentsSection}

      <div className="border-t pt-6 max-w-xl">
        <h3 className="mb-2 text-sm font-medium text-destructive">Zone dangereuse</h3>
        <DeleteButton
          label="Supprimer ce sous-traitant"
          confirmText="Le sous-traitant sera marqué supprimé (soft delete)."
          redirectTo="/tiers/sous-traitants"
          action={async () => {
            'use server';
            return supprimerSousTraitant(id);
          }}
        />
      </div>
    </div>
  );
}
