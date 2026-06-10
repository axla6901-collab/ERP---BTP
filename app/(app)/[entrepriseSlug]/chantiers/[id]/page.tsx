import { CalendarRangeIcon } from 'lucide-react';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { type ReactNode } from 'react';

import { DeleteButton } from '@/components/catalogue/delete-button';
import { ChangerStatutChantier } from '@/components/chantiers/changer-statut-chantier';
import { ChantierForm } from '@/components/chantiers/chantier-form';
import { ChantierTabs } from '@/components/chantiers/chantier-tabs';
import { chantierTabsVisibles, resolveChantierTab } from '@/lib/chantiers/tabs';
import { ChantierTaches } from '@/components/chantiers/chantier-taches';
import { ActiverCompteProrata } from '@/components/compte-prorata/activer-compte-prorata';
import { CompteProrataTab } from '@/components/compte-prorata/compte-prorata-tab';
import { NouvelleGrilleChantierButton } from '@/components/chantiers/nouvelle-grille-chantier-button';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { requireAuthWithMfa } from '@/lib/auth/guards';
import { requireTenantContext } from '@/lib/auth/tenant-guards';
import { listerGrillesChantier } from '@/lib/catalogue/grilles-tarifaires';
import {
  changerStatutChantier,
  lireChantier,
  listerResponsablesPossibles,
  mettreAJourChantier,
  supprimerChantier,
} from '@/lib/chantiers/chantiers';
import { peutEcrireChantier } from '@/lib/chantiers/permissions';
import {
  peutArreterCompteProrata,
  peutEcrireCompteProrata,
} from '@/lib/chantiers/compte-prorata-permissions';
import {
  arreterCompteProrata,
  enregistrerDepense,
  enregistrerParticipant,
  lireCompteProrataChantier,
  ouvrirCompteProrata,
  rouvrirCompteProrata,
  supprimerDepense,
  supprimerParticipant,
} from '@/lib/chantiers/compte-prorata-actions';
import { calculerBilan } from '@/lib/chantiers/compte-prorata';
import {
  changerStatutTache,
  creerTache,
  deplacerTache,
  listerTaches,
  mettreAJourTache,
  supprimerTache,
} from '@/lib/chantiers/taches';
import { listerClients } from '@/lib/commercial/clients';
import { listerFournisseurs } from '@/lib/tiers/fournisseurs';
import { listerSousTraitants } from '@/lib/tiers/sous-traitants';
import type {
  CompteProrataDepenseInput,
  CompteProrataParticipantInput,
} from '@/lib/validation/compte-prorata';
import {
  LIBELLES_STATUT_CHANTIER,
  type ChantierInput,
  type StatutChantier,
} from '@/lib/validation/chantiers';
import {
  type ChantierTacheInput,
  type StatutTache,
} from '@/lib/validation/chantier-taches';
import {
  LIBELLES_STATUT_DEVIS,
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

function formatMontant(m: string | null): string {
  if (!m) return '—';
  const n = Number(m);
  if (Number.isNaN(n)) return m;
  return n.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export default async function ChantierDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ entrepriseSlug: string; id: string }>;
  searchParams: Promise<{ tab?: string }>;
}) {
  const { entrepriseSlug, id } = await params;
  const sp = await searchParams;
  const utilisateur = await requireAuthWithMfa();
  const tenantCtx = await requireTenantContext();
  const compteProrataActive = tenantCtx.entreprise.compteProrataActive;
  const tab = resolveChantierTab(sp.tab, { compteProrataActive });
  const chantier = await lireChantier(id);
  if (!chantier) notFound();

  const peutEcrire = peutEcrireChantier(utilisateur.role);
  const [clients, responsables, taches, grilles, fournisseursAll, compteData, sousTraitantsAll] =
    await Promise.all([
      listerClients(),
      listerResponsablesPossibles(),
      listerTaches(id),
      listerGrillesChantier(id),
      listerFournisseurs(),
      compteProrataActive ? lireCompteProrataChantier(id) : Promise.resolve(null),
      compteProrataActive ? listerSousTraitants() : Promise.resolve([]),
    ]);
  const today = new Date().toISOString().slice(0, 10);

  // Bilan du compte prorata (calcul pur côté serveur, à partir des données chargées).
  const bilanCP = compteData
    ? calculerBilan(
        compteData.participants.map((p) => ({
          id: p.id,
          libelle: p.libelle,
          montantMarcheHt: p.montantMarcheHt,
          quotePartPctManuel: p.quotePartPctManuel,
          estGestionnaire: p.estGestionnaire,
        })),
        compteData.depenses.map((d) => ({
          id: d.id,
          avanceParParticipantId: d.avanceParParticipantId,
          montantHt: d.montantHt,
        })),
        compteData.compte.fraisGestionPct,
      )
    : null;

  const peutEcrireCP = peutEcrireCompteProrata(utilisateur.role);
  const peutArreterCP = peutArreterCompteProrata(utilisateur.role);

  // Onglet « Compte prorata » : construit avant le JSX pour capturer l'id du
  // compte (string) dans les wrappers `'use server'` plutôt que tout l'objet.
  let compteProrataNode: ReactNode = null;
  if (compteProrataActive) {
    if (compteData && bilanCP) {
      const cpId = compteData.compte.id;
      compteProrataNode = (
        <CompteProrataTab
          compteId={cpId}
          statut={compteData.compte.statut}
          fraisGestionPct={compteData.compte.fraisGestionPct}
          participants={compteData.participants.map((p) => ({
            id: p.id,
            libelle: p.libelle,
            sousTraitantId: p.sousTraitantId,
            sousTraitantNom: p.sousTraitantNom,
            montantMarcheHt: p.montantMarcheHt,
            quotePartPctManuel: p.quotePartPctManuel,
            estGestionnaire: p.estGestionnaire,
            notes: p.notes,
          }))}
          depenses={compteData.depenses.map((d) => ({
            id: d.id,
            dateDepense: d.dateDepense,
            libelle: d.libelle,
            categorie: d.categorie,
            montantHt: d.montantHt,
            avanceParParticipantId: d.avanceParParticipantId,
            avanceParLibelle: d.avanceParLibelle,
            notes: d.notes,
          }))}
          bilan={bilanCP}
          sousTraitants={sousTraitantsAll
            .filter((s) => s.actif)
            .map((s) => ({ id: s.id, code: s.code, nom: s.nom }))}
          today={today}
          peutEcrire={peutEcrireCP}
          peutArreter={peutArreterCP}
          actions={{
            enregistrerParticipant: async (values: CompteProrataParticipantInput) => {
              'use server';
              return enregistrerParticipant(values);
            },
            supprimerParticipant: async (participantId: string) => {
              'use server';
              return supprimerParticipant(participantId);
            },
            enregistrerDepense: async (values: CompteProrataDepenseInput) => {
              'use server';
              return enregistrerDepense(values);
            },
            supprimerDepense: async (depenseId: string) => {
              'use server';
              return supprimerDepense(depenseId);
            },
            arreter: async (dateArrete: string) => {
              'use server';
              const r = await arreterCompteProrata({ compteProrataId: cpId, dateArrete });
              return r.ok ? { ok: true } : { ok: false, error: r.error };
            },
            rouvrir: async () => {
              'use server';
              const r = await rouvrirCompteProrata(cpId);
              return r.ok ? { ok: true } : { ok: false, error: r.error };
            },
          }}
        />
      );
    } else {
      compteProrataNode = (
        <ActiverCompteProrata
          peutEcrire={peutEcrireCP}
          onOuvrir={async (fraisGestionPct: number | null) => {
            'use server';
            const r = await ouvrirCompteProrata({ chantierId: id, fraisGestionPct });
            return r.ok ? { ok: true } : { ok: false, error: r.error };
          }}
        />
      );
    }
  }
  const fournisseursActifs = fournisseursAll
    .filter((f) => f.actif)
    .map((f) => ({ id: f.id, code: f.code, nom: f.nom }));

  const defaultValues: Partial<ChantierInput> = {
    libelle: chantier.libelle,
    clientId: chantier.client.id,
    responsableId: chantier.responsable?.id ?? null,
    statut: chantier.statut as StatutChantier,
    dateDebutPrevue: chantier.dateDebutPrevue,
    dateFinPrevue: chantier.dateFinPrevue,
    dateDebutReelle: chantier.dateDebutReelle,
    dateFinReelle: chantier.dateFinReelle,
    montantPrevisionnelHt: chantier.montantPrevisionnelHt,
    adresseLigne1: chantier.adresseLigne1,
    adresseLigne2: chantier.adresseLigne2,
    codePostal: chantier.codePostal,
    ville: chantier.ville,
    description: chantier.description,
    notes: chantier.notes,
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-xl font-medium">
          Chantier <span className="font-mono">{chantier.numero}</span> — {chantier.libelle}
        </h2>
        <div className="flex items-center gap-2">
          {tenantCtx.entreprise.planningActive && (
            <Link
              href={`/${entrepriseSlug}/chantiers/${id}/planning`}
              className="inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-xs text-muted-foreground hover:bg-muted hover:text-foreground"
            >
              <CalendarRangeIcon className="size-3.5" />
              Voir le planning
            </Link>
          )}
          <span className="rounded-full bg-muted px-3 py-1 text-xs">
            {LIBELLES_STATUT_CHANTIER[chantier.statut as StatutChantier]}
          </span>
        </div>
      </div>

      <ChantierTabs
        activeTab={tab}
        basePath={`/${entrepriseSlug}/chantiers/${id}`}
        tabs={chantierTabsVisibles({ compteProrataActive })}
        counts={{
          'grille-tarifaire': grilles.length,
          devis: chantier.devisLies.length,
        }}
      />

      {tab === 'informations' && (
        <>
          <div className="grid gap-4 md:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Client</CardTitle>
              </CardHeader>
              <CardContent className="text-sm">
                <p>
                  <span className="font-mono text-xs text-muted-foreground">
                    {chantier.client.code}
                  </span>{' '}
                  {chantier.client.nom}
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">Montant prévisionnel HT</CardTitle>
              </CardHeader>
              <CardContent className="text-2xl font-bold tabular-nums">
                {formatMontant(chantier.montantPrevisionnelHt)} €
              </CardContent>
            </Card>
          </div>

          {peutEcrire && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Changer le statut</CardTitle>
              </CardHeader>
              <CardContent>
                <ChangerStatutChantier
                  chantierId={id}
                  statutCourant={chantier.statut as StatutChantier}
                  action={async (chantierId, nouveau) => {
                    'use server';
                    return changerStatutChantier(chantierId, nouveau);
                  }}
                />
              </CardContent>
            </Card>
          )}

          {/* Tâches : visibles UNIQUEMENT si Planning n'est pas activé pour
              l'entreprise (sinon Planning fait office de gestion des tâches). */}
          {!tenantCtx.entreprise.planningActive && (
            <ChantierTaches
              taches={taches.map((t) => ({
                id: t.id,
                chantierId: t.chantierId,
                ordre: t.ordre,
                libelle: t.libelle,
                description: t.description,
                responsableId: t.responsableId,
                responsableEmail: t.responsableEmail,
                statut: t.statut as StatutTache,
                avancementPourcent: t.avancementPourcent,
                dateDebutPrevue: t.dateDebutPrevue,
                dateFinPrevue: t.dateFinPrevue,
                dateDebutReelle: t.dateDebutReelle,
                dateFinReelle: t.dateFinReelle,
                notes: t.notes,
              }))}
              responsables={responsables}
              peutEcrire={peutEcrire}
              actions={{
                creer: async (values: ChantierTacheInput) => {
                  'use server';
                  return creerTache(id, values);
                },
                mettreAJour: async (tacheId: string, values: ChantierTacheInput) => {
                  'use server';
                  return mettreAJourTache(tacheId, values);
                },
                changerStatut: async (tacheId: string, nouveau: StatutTache) => {
                  'use server';
                  return changerStatutTache(tacheId, nouveau);
                },
                supprimer: async (tacheId: string) => {
                  'use server';
                  return supprimerTache(tacheId);
                },
                deplacer: async (tacheId: string, direction: -1 | 1) => {
                  'use server';
                  return deplacerTache(tacheId, direction);
                },
              }}
            />
          )}

          {peutEcrire ? (
            <>
              <ChantierForm
                clients={clients.map((c) => ({
                  id: c.id,
                  code: c.code,
                  libelle: libelleClient(c),
                }))}
                responsables={responsables}
                defaultValues={defaultValues}
                onSubmit={async (values) => {
                  'use server';
                  return mettreAJourChantier(id, values);
                }}
                successRedirect="/chantiers"
                hideStatut
              />
              <div className="max-w-3xl border-t pt-6">
                <h3 className="mb-2 text-sm font-medium text-destructive">Zone dangereuse</h3>
                <DeleteButton
                  label="Supprimer ce chantier"
                  confirmText="Suppression possible uniquement en statut « prospect »."
                  redirectTo="/chantiers"
                  action={async () => {
                    'use server';
                    return supprimerChantier(id);
                  }}
                />
              </div>
            </>
          ) : (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Lecture seule</CardTitle>
              </CardHeader>
              <CardContent className="text-sm text-muted-foreground">
                Tu n&apos;as pas les droits pour modifier ce chantier.
              </CardContent>
            </Card>
          )}
        </>
      )}

      {tab === 'grille-tarifaire' && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">
              Grilles tarifaires rattachées ({grilles.length})
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {grilles.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                Aucune grille tarifaire rattachée à ce chantier. Si tu as négocié un tarif
                spécifique avec un fournisseur pour ce chantier, crée-en une ci-dessous : elle
                deviendra prioritaire dans le calcul de prix de revient.
              </p>
            ) : (
              <div className="rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Fournisseur</TableHead>
                      <TableHead>Libellé</TableHead>
                      <TableHead>Période</TableHead>
                      <TableHead>Articles</TableHead>
                      <TableHead>État</TableHead>
                      <TableHead className="text-right" />
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {grilles.map((g) => {
                      const enCours =
                        g.actif &&
                        g.validFrom <= today &&
                        (g.validTo === null || g.validTo >= today);
                      return (
                        <TableRow key={g.id}>
                          <TableCell className="text-sm">
                            <span className="font-mono text-xs text-muted-foreground">
                              {g.fournisseurCode}
                            </span>
                            <span className="ml-1">{g.fournisseurNom}</span>
                          </TableCell>
                          <TableCell className="font-medium">{g.libelle}</TableCell>
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
                              href={`/tiers/fournisseurs/${g.fournisseurId}/grilles/${g.id}`}
                              className="text-sm underline underline-offset-4"
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
            {peutEcrire && (
              <NouvelleGrilleChantierButton chantierId={id} fournisseurs={fournisseursActifs} />
            )}
          </CardContent>
        </Card>
      )}

      {tab === 'commandes' && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Commandes</CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            Module commandes à venir — les commandes fournisseur rattachées à ce chantier
            seront listées ici.
          </CardContent>
        </Card>
      )}

      {tab === 'devis' && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">
              Devis liés ({chantier.devisLies.length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            {chantier.devisLies.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                Aucun devis n&apos;est encore rattaché à ce chantier.
              </p>
            ) : (
              <ul className="divide-y text-sm">
                {chantier.devisLies.map((d) => (
                  <li key={d.id} className="flex items-center justify-between py-2">
                    <Link
                      href={`/${entrepriseSlug}/commercial/devis/${d.id}`}
                      className="font-mono text-xs underline underline-offset-4"
                    >
                      {d.numero}
                    </Link>
                    <span className="rounded-full bg-muted px-2 py-0.5 text-xs">
                      {LIBELLES_STATUT_DEVIS[d.statut as StatutDevis]}
                    </span>
                    <span className="tabular-nums">{formatMontant(d.totalTtc)} € TTC</span>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      )}

      {tab === 'factures' && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Factures</CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            Module factures à venir — les factures émises pour ce chantier seront listées ici.
          </CardContent>
        </Card>
      )}

      {tab === 'compte-prorata' && compteProrataNode}
    </div>
  );
}
