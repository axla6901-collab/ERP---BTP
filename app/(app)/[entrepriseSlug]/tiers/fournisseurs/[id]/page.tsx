import { notFound } from 'next/navigation';

import { DeleteButton } from '@/components/catalogue/delete-button';
import { ContactCreateButton } from '@/components/contacts/contact-create-button';
import { ContactsSection } from '@/components/contacts/contacts-section';
import { DocumentsTierList } from '@/components/tiers/documents-tier-list';
import { FournisseurForm } from '@/components/tiers/fournisseur-form';
import {
  FournisseurRail,
  type HistoriqueRailItem,
  type RailTone,
} from '@/components/tiers/fournisseur-rail';
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
  compterArticlesPreferesFournisseur,
  lireFournisseur,
  listerFournisseurContacts,
  listerHistoriqueFournisseur,
  mettreAJourFournisseur,
  supprimerFournisseur,
  type EvenementHistoriqueFournisseur,
} from '@/lib/tiers/fournisseurs';
import { resoudreEmailsUtilisateurs } from '@/lib/tiers/sous-traitants';
import { listerRaisonsSocialesActives } from '@/lib/referencement/raisons-sociales';
import { peutEcrireTiers } from '@/lib/tiers/permissions';
import type { TypeDocumentTier } from '@/lib/validation/tiers';
import { LienTenant } from '@/components/layout/lien-tenant';

type GrilleResume = Awaited<ReturnType<typeof listerGrillesFournisseur>>[number];

/** Date ISO (YYYY-MM-DD) → JJ/MM/AAAA, ou la chaîne brute si non parsable. */
function formaterDateFr(iso: string | null): string {
  if (!iso) return '—';
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!m) return iso;
  return `${m[3]}/${m[2]}/${m[1]}`;
}

/** Horodatage compact pour la timeline du rail (« 14/06 · 16:40 »), en UTC. */
function formatQuand(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(iso);
  if (!m) return iso;
  return `${m[3]}/${m[2]} · ${m[4]}:${m[5]}`;
}

/** Libellé lisible d'une entrée d'audit de la table `fournisseurs`. */
function decrireEvenementFournisseur(e: EvenementHistoriqueFournisseur): string {
  if (e.action === 'insert') return 'Fournisseur créé';
  if (e.action === 'delete') return 'Fournisseur supprimé';
  const before = e.before ?? {};
  const after = e.after ?? {};
  if ('actif' in after && before.actif !== after.actif) {
    return after.actif ? 'Réactivation' : 'Désactivation';
  }
  if ('code' in after && before.code !== after.code) return 'Code modifié';
  if ('raisonSocialeId' in after && before.raisonSocialeId !== after.raisonSocialeId) {
    return 'Raison sociale modifiée';
  }
  return 'Modification';
}

/** Ton (couleur de pastille) d'un événement d'historique. */
function tonEvenement(e: EvenementHistoriqueFournisseur, label: string): HistoriqueRailItem['ton'] {
  if (e.action === 'insert') return 'emerald';
  if (e.action === 'delete') return 'rose';
  if (label.startsWith('Réactivation')) return 'emerald';
  if (label.startsWith('Désactivation')) return 'amber';
  return 'slate';
}

/** Tonalité d'état d'une grille (en vigueur, à venir, expirée, inactive). */
function toneGrille(g: GrilleResume, today: string, dans30j: string): RailTone {
  if (!g.actif) return 'neutral';
  if (g.validFrom > today) return 'neutral'; // à venir
  if (g.validTo !== null && g.validTo < today) return 'neutral'; // expirée
  if (g.validTo !== null && g.validTo <= dans30j) return 'warn'; // expire bientôt
  return 'ok'; // en vigueur
}

function nomCompletContact(c: { nom: string; prenom: string | null }): string {
  return [c.prenom, c.nom].filter(Boolean).join(' ').trim() || c.nom;
}

export default async function FournisseurDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const utilisateur = await requireAuthWithMfa();
  const [
    fournisseur,
    grilles,
    contacts,
    documents,
    peutImporterCatalogue,
    raisonsSocialesConnues,
    nbArticlesPreferes,
    historique,
  ] = await Promise.all([
    lireFournisseur(id),
    listerGrillesFournisseur(id),
    listerFournisseurContacts(id),
    listerDocumentsTier({ type: 'fournisseur', id }),
    aPermission(utilisateur.roleId, 'CATALOGUE_IMPORT_FOURNISSEUR'),
    listerRaisonsSocialesActives(),
    compterArticlesPreferesFournisseur(id),
    listerHistoriqueFournisseur(id),
  ]);
  if (!fournisseur) notFound();

  const peutEcrire = peutEcrireTiers(utilisateur.role);
  const peutImporter = peutEcrire && peutImporterCatalogue;
  const today = new Date().toISOString().slice(0, 10);
  const dans30j = new Date(Date.now() + 30 * 86_400_000).toISOString().slice(0, 10);

  const documentsSection = (
    <section className="overflow-hidden rounded-xl bg-card ring-1 ring-foreground/10">
      <div className="px-4 py-3 sm:px-5">
        <h3 className="font-heading font-semibold text-orange-700">
          Pièces administratives{' '}
          <span className="font-normal text-muted-foreground">(vigilance L.8222-1)</span>
        </h3>
        <p className="text-xs text-muted-foreground">
          Obligation de vigilance pour tout contrat ≥ 5&nbsp;000&nbsp;€ HT. {documents.length} pièce
          {documents.length > 1 ? 's' : ''} enregistrée{documents.length > 1 ? 's' : ''}.
        </p>
      </div>
      <div className="border-t px-4 py-4 sm:px-5">
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
      </div>
    </section>
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

        <GrillesSection
          fournisseurId={id}
          grilles={grilles}
          today={today}
          dans30j={dans30j}
          peutEcrire={false}
        />

        {documentsSection}
      </div>
    );
  }

  // ── Données dérivées (zone D / bandeau) ───────────────────────────────────
  const grillesEnVigueur = grilles.filter(
    (g) => g.actif && g.validFrom <= today && (g.validTo === null || g.validTo >= today),
  );
  const articlesTarifes = grillesEnVigueur.reduce((s, g) => s + g.nbLignes, 0);
  const syntheseLignes = grilles.slice(0, 3).map((g) => ({
    label: g.libelle,
    detail: `${g.chantierNumero ? `Chantier ${g.chantierNumero}` : 'Générale'} · ${g.nbLignes} article${
      g.nbLignes > 1 ? 's' : ''
    } · jusqu’au ${g.validTo ? formaterDateFr(g.validTo) : '∞'}`,
    tone: toneGrille(g, today, dans30j),
  }));

  const docUrssaf = documents.find((d) => d.type === 'attestation_urssaf');
  const docRib = documents.find((d) => d.type === 'rib');
  const urssaf: { valeur: string; tone: RailTone } = !docUrssaf
    ? { valeur: 'Absente', tone: 'bad' }
    : docUrssaf.dateValidite && docUrssaf.dateValidite < today
      ? { valeur: 'Expirée', tone: 'bad' }
      : docUrssaf.dateValidite && docUrssaf.dateValidite <= dans30j
        ? { valeur: 'Expire bientôt', tone: 'warn' }
        : { valeur: 'À jour', tone: 'ok' };
  const vigilanceAlerte = urssaf.tone !== 'ok' || !docRib;

  const contactsActifs = contacts.filter((c) => c.actif).length;
  const principal = contacts.find((c) => c.principal && c.actif) ?? null;
  const principalNom = principal ? nomCompletContact(principal) : null;

  const emails = await resoudreEmailsUtilisateurs([fournisseur.createdBy, fournisseur.updatedBy]);

  const historiqueItems: HistoriqueRailItem[] = historique.map((e) => {
    const label = decrireEvenementFournisseur(e);
    return {
      id: e.id,
      label,
      ton: tonEvenement(e, label),
      quand: formatQuand(e.createdAt),
      par: e.email,
    };
  });

  const badges = (
    <>
      {nbArticlesPreferes > 0 && (
        <span className="rounded-full bg-orange-100 px-2 py-0.5 text-[11px] font-medium text-orange-800 ring-1 ring-orange-300">
          Préféré · {nbArticlesPreferes} article{nbArticlesPreferes > 1 ? 's' : ''}
        </span>
      )}
      {vigilanceAlerte && (
        <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-medium text-amber-800 ring-1 ring-amber-300">
          <span className="size-1.5 rounded-full bg-amber-500" aria-hidden />
          Vigilance
        </span>
      )}
    </>
  );

  const rail = (
    <FournisseurRail
      synthese={{
        titrePrincipal: `${grillesEnVigueur.length} grille${
          grillesEnVigueur.length > 1 ? 's' : ''
        } en vigueur`,
        sousTitre: `${articlesTarifes} article${articlesTarifes > 1 ? 's' : ''} tarifé${
          articlesTarifes > 1 ? 's' : ''
        } · ${grilles.length} grille${grilles.length > 1 ? 's' : ''} au total`,
        lignes: syntheseLignes,
      }}
      statut={{
        actif: fournisseur.actif,
        nbArticlesPreferes,
        creeLe: formaterDateFr(fournisseur.createdAt.toISOString().slice(0, 10)),
        creePar: fournisseur.createdBy ? (emails.get(fournisseur.createdBy) ?? null) : null,
        modifieLe: formaterDateFr(fournisseur.updatedAt.toISOString().slice(0, 10)),
        modifiePar: fournisseur.updatedBy ? (emails.get(fournisseur.updatedBy) ?? null) : null,
      }}
      contacts={{
        actifs: contactsActifs,
        total: contacts.length,
        principalNom,
        gererHref: '#contacts',
      }}
      conformite={{
        items: [
          { label: 'Attestation URSSAF', valeur: urssaf.valeur, tone: urssaf.tone },
          { label: 'RIB', valeur: docRib ? 'À jour' : 'Absent', tone: docRib ? 'ok' : 'bad' },
        ],
        note: 'Vigilance L.8222-1 : exigible pour tout contrat ≥ 5 000 € HT. Détail dans le bloc « Pièces administratives ».',
      }}
      historique={historiqueItems}
    />
  );

  const sousTitre = (
    <>
      <span className="font-mono">{fournisseur.code}</span>
      {fournisseur.siret ? ` · SIRET ${fournisseur.siret}` : ''}
      {` · modifié le ${formaterDateFr(fournisseur.updatedAt.toISOString().slice(0, 10))}`}
      {fournisseur.updatedBy && emails.get(fournisseur.updatedBy)
        ? ` par ${emails.get(fournisseur.updatedBy)}`
        : ''}
    </>
  );

  return (
    <div className="space-y-5">
      <FournisseurForm
        titre={fournisseur.nom}
        fournisseurId={id}
        fournisseurNom={fournisseur.nom}
        raisonsSocialesConnues={raisonsSocialesConnues}
        peutImporterCatalogue={peutImporter}
        nouvelleGrilleHref={`/tiers/fournisseurs/${id}/grilles/nouveau`}
        retourHref="/tiers/fournisseurs"
        sousTitre={sousTitre}
        badges={badges}
        rail={rail}
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

      {/* ── Zone E · blocs pleine largeur ─────────────────────────────────── */}
      <GrillesSection
        fournisseurId={id}
        grilles={grilles}
        today={today}
        dans30j={dans30j}
        peutEcrire
      />

      <section
        id="contacts"
        className="overflow-hidden rounded-xl bg-card ring-1 ring-foreground/10"
      >
        <div className="px-4 py-3 sm:px-5">
          <h3 className="font-heading font-semibold text-orange-700">Contacts du fournisseur</h3>
          <p className="text-xs text-muted-foreground">
            {contactsActifs} actif{contactsActifs > 1 ? 's' : ''} sur {contacts.length} ·
            enregistrement immédiat via la frame contacts.
          </p>
        </div>
        <div className="border-t px-4 py-4 sm:px-5">
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
          />
        </div>
      </section>

      {documentsSection}

      <div className="border-t pt-6">
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
  dans30j,
  peutEcrire,
}: {
  fournisseurId: string;
  grilles: GrilleResume[];
  today: string;
  dans30j: string;
  peutEcrire: boolean;
}) {
  return (
    <section className="overflow-hidden rounded-xl bg-card ring-1 ring-amber-200">
      <div className="px-4 py-3 sm:px-5">
        <h3 className="font-heading font-semibold text-orange-700">
          Grilles tarifaires &amp; prix négociés
        </h3>
        <p className="text-xs text-muted-foreground">
          Source unique de la relation d’achat : prix négociés par article, période et chantier.
          {peutEcrire &&
            ' Utilisez « Import catalogue » ou « Création catalogue » en haut de la fiche.'}
        </p>
      </div>

      {grilles.length === 0 ? (
        <div className="border-t px-4 py-6 text-center text-sm text-muted-foreground sm:px-5">
          Aucune grille tarifaire pour ce fournisseur.
        </div>
      ) : (
        <div className="border-t">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Libellé</TableHead>
                <TableHead>Portée</TableHead>
                <TableHead>Période</TableHead>
                <TableHead>Articles</TableHead>
                <TableHead>État</TableHead>
                <TableHead className="text-right" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {grilles.map((g) => {
                const tone = toneGrille(g, today, dans30j);
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
                    <TableCell className="text-sm tabular-nums">
                      {g.validFrom} → {g.validTo ?? '∞'}
                    </TableCell>
                    <TableCell className="tabular-nums">{g.nbLignes}</TableCell>
                    <TableCell>
                      {!g.actif ? (
                        <span className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
                          Inactive
                        </span>
                      ) : g.validFrom > today ? (
                        <span className="rounded-full bg-sky-100 px-2 py-0.5 text-xs text-sky-700">
                          À venir
                        </span>
                      ) : g.validTo !== null && g.validTo < today ? (
                        <span className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
                          Expirée
                        </span>
                      ) : tone === 'warn' ? (
                        <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs text-amber-700">
                          Expire bientôt
                        </span>
                      ) : (
                        <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs text-emerald-700">
                          En vigueur
                        </span>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      <LienTenant
                        href={`/tiers/fournisseurs/${fournisseurId}/grilles/${g.id}`}
                        className={buttonVariants({ variant: 'ghost', size: 'sm' })}
                      >
                        {peutEcrire ? 'Modifier' : 'Consulter'}
                      </LienTenant>
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
