import { notFound } from 'next/navigation';

import { DeleteButton } from '@/components/catalogue/delete-button';
import { ContactCreateButton } from '@/components/contacts/contact-create-button';
import { ContactsSection } from '@/components/contacts/contacts-section';
import { DocumentsTierList } from '@/components/tiers/documents-tier-list';
import { SousTraitantForm } from '@/components/tiers/sous-traitant-form';
import { SousTraitantRail, type HistoriqueRailItem } from '@/components/tiers/sous-traitant-rail';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { requireAuthWithMfa } from '@/lib/auth/guards';
import {
  enregistrerDocumentTier,
  listerDocumentsTier,
  preparerUploadDocumentTier,
  supprimerDocumentTier,
  urlTelechargementDocumentTier,
} from '@/lib/tiers/documents';
import { listerRaisonsSocialesActives } from '@/lib/referencement/raisons-sociales';
import {
  calculerRangCascade,
  calculerSyntheseConformite,
  decrireEvenementSousTraitant,
  formaterDateFr,
  type SyntheseConformite,
} from '@/lib/sous-traitance/fiche-synthese';
import { peutEcrireTiers } from '@/lib/tiers/permissions';
import {
  changerStatutSousTraitant,
  lireSousTraitant,
  listerHistoriqueSousTraitant,
  listerSousTraitantContacts,
  listerSousTraitants,
  mettreAJourSousTraitant,
  resoudreEmailsUtilisateurs,
  supprimerSousTraitant,
  type EvenementHistoriqueST,
} from '@/lib/tiers/sous-traitants';
import {
  STATUT_SOUS_TRAITANT_LABELS,
  type DocumentTierInput,
  type TypeDocumentTier,
} from '@/lib/validation/tiers';

function formatDate(iso: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString('fr-FR');
}

/** Horodatage compact pour la timeline du rail (« 14/06 · 16:40 »), en UTC. */
function formatQuand(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(iso);
  if (!m) return iso;
  return `${m[3]}/${m[2]} · ${m[4]}:${m[5]}`;
}

/** Ton (couleur de pastille) d'un événement d'historique. */
function tonEvenement(e: EvenementHistoriqueST, label: string): HistoriqueRailItem['ton'] {
  if (e.action === 'insert') return 'emerald';
  if (e.action === 'delete') return 'rose';
  if (label.startsWith('Réactivation') || label.includes('Agréé')) return 'emerald';
  if (label.startsWith('Désactivation') || label.includes('Suspendu') || label.includes('Refusé')) {
    return 'amber';
  }
  if (label.includes('cascade')) return 'amber';
  return 'slate';
}

export default async function SousTraitantDetailPage({
  params,
}: {
  params: Promise<{ entrepriseSlug: string; id: string }>;
}) {
  const { entrepriseSlug, id } = await params;
  const utilisateur = await requireAuthWithMfa();
  const [sousTraitant, contacts, documents, tousSousTraitants, raisonsSocialesConnues, historique] =
    await Promise.all([
      lireSousTraitant(id),
      listerSousTraitantContacts(id),
      listerDocumentsTier({ type: 'sous_traitant', id }),
      listerSousTraitants(),
      listerRaisonsSocialesActives(),
      listerHistoriqueSousTraitant(id),
    ]);
  if (!sousTraitant) notFound();

  const peutEcrire = peutEcrireTiers(utilisateur.role);
  // Parents de cascade possibles : actifs, hors soi-même. Le trigger SQL
  // trg_st_anti_cycle reste le garde-fou contre les cycles/profondeur > 3.
  const parentsPossibles = tousSousTraitants
    .filter((s) => s.actif && s.id !== id)
    .map((s) => ({ id: s.id, code: s.code, nom: s.nom }));
  const today = new Date().toISOString().slice(0, 10);

  const documentsItems = documents.map((d) => ({
    id: d.id,
    type: d.type as TypeDocumentTier,
    libelle: d.libelle,
    mimeType: d.mimeType,
    tailleBytes: d.tailleBytes,
    dateValidite: d.dateValidite,
    createdAt: d.createdAt.toISOString(),
  }));
  const documentsActions = {
    preparerUpload: async (contentType: string, filename: string, tailleBytes: number) => {
      'use server';
      return preparerUploadDocumentTier(
        { type: 'sous_traitant', id },
        contentType,
        filename,
        tailleBytes,
      );
    },
    enregistrer: async (input: DocumentTierInput) => {
      'use server';
      return enregistrerDocumentTier({ type: 'sous_traitant', id }, input);
    },
    getDownloadUrl: async (docId: string) => {
      'use server';
      return urlTelechargementDocumentTier(docId);
    },
    supprimer: async (docId: string) => {
      'use server';
      return supprimerDocumentTier(docId);
    },
  };
  const documentsTier = (
    <DocumentsTierList
      items={documentsItems}
      peutEcrire={peutEcrire}
      today={today}
      actions={documentsActions}
    />
  );

  if (!peutEcrire) {
    return (
      <div className="max-w-xl space-y-4">
        <h2 className="text-xl font-medium">{sousTraitant.nom}</h2>
        <Card>
          <CardHeader>
            <CardTitle>Détails</CardTitle>
          </CardHeader>
          <CardContent>
            <dl className="grid grid-cols-[auto_1fr] gap-2 text-sm">
              <dt className="text-muted-foreground">Code</dt>
              <dd className="font-mono">{sousTraitant.code}</dd>
              <dt className="text-muted-foreground">Gérant</dt>
              <dd>
                {[sousTraitant.gerantPrenom, sousTraitant.gerantNom].filter(Boolean).join(' ') ||
                  '—'}
              </dd>
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

        <Card className="max-w-2xl">
          <CardHeader>
            <CardTitle className="text-base">Documents ({documents.length})</CardTitle>
          </CardHeader>
          <CardContent>{documentsTier}</CardContent>
        </Card>
      </div>
    );
  }

  // ── Données dérivées (zone D / bandeau) ───────────────────────────────────
  // Conformité = source unique : dérivée des pièces de la zone Vigilance
  // (décennale, URSSAF, contrat/DC4) + les qualifications de la fiche.
  const conformite: SyntheseConformite = calculerSyntheseConformite(
    {
      documents: documents.map((d) => ({
        type: d.type as TypeDocumentTier,
        dateValidite: d.dateValidite,
      })),
      qualifications: sousTraitant.qualifications,
    },
    today,
  );

  const parentParId = new Map(tousSousTraitants.map((s) => [s.id, s.parentStId]));
  const rang = calculerRangCascade(id, parentParId);
  const parent = sousTraitant.parentStId
    ? tousSousTraitants.find((s) => s.id === sousTraitant.parentStId)
    : null;

  const emails = await resoudreEmailsUtilisateurs([sousTraitant.createdBy, sousTraitant.updatedBy]);

  const contactsActifs = contacts.filter((c) => c.actif).length;
  // Mini-liste du rail (zone D) : contact principal en tête, puis les autres.
  const contactsRailItems = contacts
    .map((c) => ({
      id: c.id,
      nom: [c.prenom, c.nom].filter(Boolean).join(' ').trim() || c.nom,
      fonction: c.fonction,
      principal: c.principal && c.actif,
    }))
    .sort((a, b) => Number(b.principal) - Number(a.principal));

  const historiqueItems: HistoriqueRailItem[] = historique.map((e) => {
    const label = decrireEvenementSousTraitant(e);
    return {
      id: e.id,
      label,
      ton: tonEvenement(e, label),
      quand: formatQuand(e.createdAt),
      par: e.email,
    };
  });

  const rail = (
    <SousTraitantRail
      conformite={conformite}
      cascade={{
        rang: rang.rang,
        max: rang.max,
        depassement: rang.depassement,
        parent: parent
          ? {
              libelle: `${parent.code} — ${parent.nom}`,
              href: `/${entrepriseSlug}/tiers/sous-traitants/${parent.id}`,
            }
          : null,
        retenuePct: (sousTraitant.tauxRetenueGarantie ?? '0').replace('.', ','),
      }}
      meta={{
        statut: sousTraitant.statut,
        actif: sousTraitant.actif,
        creeLe: sousTraitant.createdAt.toISOString().slice(0, 10),
        creePar: sousTraitant.createdBy ? (emails.get(sousTraitant.createdBy) ?? null) : null,
        modifieLe: sousTraitant.updatedAt.toISOString().slice(0, 10),
        modifiePar: sousTraitant.updatedBy ? (emails.get(sousTraitant.updatedBy) ?? null) : null,
      }}
      contacts={{
        actifs: contactsActifs,
        total: contacts.length,
        items: contactsRailItems,
        gererHref: '#contacts',
      }}
      historique={historiqueItems}
    />
  );

  const sousTitre = (
    <>
      <span className="font-mono">{sousTraitant.code}</span>
      {sousTraitant.siret ? ` · SIRET ${sousTraitant.siret}` : ''}
      {` · modifié le ${formaterDateFr(sousTraitant.updatedAt.toISOString().slice(0, 10))}`}
      {sousTraitant.updatedBy && emails.get(sousTraitant.updatedBy)
        ? ` par ${emails.get(sousTraitant.updatedBy)}`
        : ''}
    </>
  );

  return (
    <div className="space-y-5">
      <SousTraitantForm
        titre={sousTraitant.nom}
        parentsPossibles={parentsPossibles}
        raisonsSocialesConnues={raisonsSocialesConnues}
        retourHref={`/${entrepriseSlug}/tiers/sous-traitants`}
        sousTitre={sousTitre}
        rangCascade={{ rang: rang.rang, max: rang.max, depassement: rang.depassement }}
        conformite={{ niveau: conformite.niveau, label: conformite.label }}
        rail={rail}
        defaultValues={{
          code: sousTraitant.code,
          nom: sousTraitant.nom,
          gerantNom: sousTraitant.gerantNom,
          gerantPrenom: sousTraitant.gerantPrenom,
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

      {/* ── Zone E · blocs pleine largeur ─────────────────────────────────── */}
      <section id="vigilance" className="overflow-hidden rounded-xl bg-card ring-1 ring-amber-200">
        <DocumentsTierList
          items={documentsItems}
          peutEcrire={peutEcrire}
          today={today}
          actions={documentsActions}
          entete={{
            titre: (
              <>
                Vigilance &amp; pièces administratives{' '}
                <span className="font-normal text-muted-foreground">(loi 75-1334)</span>
              </>
            ),
            description:
              'Source unique de la conformité : chaque pièce porte sa référence, son échéance et son statut. La synthèse du rail en découle.',
          }}
        />
      </section>

      <section
        id="contacts"
        className="overflow-hidden rounded-xl bg-card ring-1 ring-foreground/10"
      >
        <ContactsSection
          source="sous_traitant"
          tiersId={id}
          entete={{
            titre: 'Contacts du sous-traitant',
            description: `${contactsActifs} actifs sur ${contacts.length} · enregistrement immédiat via la frame contacts.`,
          }}
          action={
            <ContactCreateButton source="sous_traitant" tiersId={id} label="Ajouter un contact" />
          }
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
        />
      </section>

      <div className="border-t pt-6">
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
