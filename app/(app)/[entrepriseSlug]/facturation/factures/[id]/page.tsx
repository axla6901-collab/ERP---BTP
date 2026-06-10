import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';

import { DeleteButton } from '@/components/catalogue/delete-button';
import { FactureEditor } from '@/components/facturation/facture-editor';
import { FactureFacturXButton } from '@/components/facturation/facture-facturx-button';
import { StatutFactureActions } from '@/components/facturation/statut-facture-actions';
import { buttonVariants } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { requireAuthWithMfa } from '@/lib/auth/guards';
import { listerArticlesPourSelecteur } from '@/lib/catalogue/articles';
import { listerChantiers } from '@/lib/chantiers/chantiers';
import { listerClients } from '@/lib/commercial/clients';
import { listerDevis } from '@/lib/commercial/devis';
import {
  changerStatutFacture,
  lireFacture,
  mettreAJourFacture,
  supprimerFacture,
} from '@/lib/facturation/factures';
import {
  aFacturXGenere,
  genererFacturX,
  urlTelechargementFacturX,
} from '@/lib/facturation/factures-export';
import { calculerTotauxFacture } from '@/lib/facturation/calculs';
import { peutEcrireFacturation } from '@/lib/facturation/permissions';
import { libelleRemiseGlobale, type RemiseGlobaleType } from '@/lib/remise-globale';
import {
  LIBELLES_STATUT_FACTURE,
  type LigneFactureInput,
  type StatutFacture,
} from '@/lib/validation/facturation';

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

export default async function FactureDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const utilisateur = await requireAuthWithMfa();
  const peutEcrire = peutEcrireFacturation(utilisateur.role);

  const facture = await lireFacture(id);
  if (!facture) notFound();

  const editable = peutEcrire && facture.statut === 'brouillon';
  const dejaFacturX = await aFacturXGenere(id);

  // Remise globale (affichage) : on recalcule le HT brut depuis les lignes
  // (stockées brutes) pour faire apparaître le montant remisé sur le total HT.
  const remiseGlobale = {
    type: facture.remiseGlobaleType as RemiseGlobaleType | null,
    valeur: facture.remiseGlobaleValeur,
  };
  const totalHtBrut = remiseGlobale.type
    ? calculerTotauxFacture(facture.lignes as unknown as LigneFactureInput[], {
        autoLiquidation: facture.autoLiquidation,
      }).totalHt
    : facture.totalHt;
  // Le montant remisé est l'écart entre le HT brut (recalculé) et le HT net
  // stocké, ce qui garantit « brut − remise = net » exactement à l'affichage.
  const montantRemiseGlobale = Number(totalHtBrut) - Number(facture.totalHt);
  const aRemiseGlobale = remiseGlobale.type !== null && montantRemiseGlobale > 0.005;

  if (!editable) {
    return (
      <div className="space-y-6 max-w-3xl">
        <div className="flex items-baseline justify-between">
          <h2 className="text-xl font-medium">
            Facture <span className="font-mono">{facture.numero}</span>
          </h2>
          <span className="rounded-full bg-muted px-3 py-1 text-xs">
            {LIBELLES_STATUT_FACTURE[facture.statut as StatutFacture]}
          </span>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Récapitulatif</CardTitle>
          </CardHeader>
          <CardContent>
            <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm">
              <dt className="text-muted-foreground">Client</dt>
              <dd>
                <span className="font-mono text-xs text-muted-foreground">
                  {facture.client.code}
                </span>{' '}
                {facture.client.nom}
              </dd>
              <dt className="text-muted-foreground">Date</dt>
              <dd>{facture.dateFacture}</dd>
              <dt className="text-muted-foreground">Échéance</dt>
              <dd>{facture.dateEcheance ?? '—'}</dd>
              <dt className="text-muted-foreground">Objet</dt>
              <dd>{facture.objet ?? '—'}</dd>
              {aRemiseGlobale ? (
                <>
                  <dt className="text-muted-foreground">Total HT brut</dt>
                  <dd className="tabular-nums">{formatMontant(totalHtBrut)} €</dd>
                  <dt className="text-muted-foreground">
                    Remise globale ({libelleRemiseGlobale(remiseGlobale)})
                  </dt>
                  <dd className="tabular-nums">
                    − {formatMontant(montantRemiseGlobale.toFixed(2))} €
                  </dd>
                  <dt className="text-muted-foreground">Total HT net</dt>
                  <dd className="tabular-nums">{formatMontant(facture.totalHt)} €</dd>
                </>
              ) : (
                <>
                  <dt className="text-muted-foreground">Total HT</dt>
                  <dd className="tabular-nums">{formatMontant(facture.totalHt)} €</dd>
                </>
              )}
              <dt className="text-muted-foreground">TVA</dt>
              <dd className="tabular-nums">
                {formatMontant(facture.totalTva)} €
                {facture.autoLiquidation && (
                  <span className="ml-2 text-xs text-muted-foreground">(auto-liquidation BTP)</span>
                )}
              </dd>
              <dt className="text-muted-foreground">Total TTC</dt>
              <dd className="font-semibold tabular-nums">{formatMontant(facture.totalTtc)} €</dd>
              {facture.montantRetenue && (
                <>
                  <dt className="text-muted-foreground">Retenue garantie</dt>
                  <dd className="tabular-nums">
                    − {formatMontant(facture.montantRetenue)} € ({facture.retenueGarantiePct} %)
                  </dd>
                </>
              )}
              {facture.datePaiement && (
                <>
                  <dt className="text-muted-foreground">Payée le</dt>
                  <dd>{facture.datePaiement}</dd>
                </>
              )}
            </dl>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Facturation électronique</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-sm text-muted-foreground">
              Génère le Factur-X (PDF/A-3 + XML EN&nbsp;16931) de cette facture, archivé et
              horodaté. Format conforme à la facturation électronique.
            </p>
            <FactureFacturXButton
              factureId={id}
              dejaGenere={dejaFacturX}
              generer={async (fid) => {
                'use server';
                return genererFacturX(fid);
              }}
              telecharger={async (fid) => {
                'use server';
                return urlTelechargementFacturX(fid);
              }}
            />
          </CardContent>
        </Card>

        {peutEcrire && (
          <StatutFactureActions
            factureId={id}
            statutCourant={facture.statut as StatutFacture}
            action={async (factureId, nouveau) => {
              'use server';
              return changerStatutFacture(factureId, nouveau);
            }}
          />
        )}

        <Link
          href="/facturation/factures"
          className="text-sm text-muted-foreground underline underline-offset-4"
        >
          ← Retour aux factures
        </Link>
      </div>
    );
  }

  // Mode édition (brouillon + peutEcrire)
  if (!peutEcrire) redirect('/facturation/factures');

  const [clients, chantiers, devis, articles] = await Promise.all([
    listerClients(),
    listerChantiers(),
    listerDevis(),
    listerArticlesPourSelecteur(),
  ]);

  const defaultValues = {
    clientId: facture.client.id,
    chantierId: facture.chantierId,
    devisId: facture.devisId,
    dateFacture: facture.dateFacture,
    dateEcheance: facture.dateEcheance,
    delaiPaiementJours: facture.delaiPaiementJours,
    objet: facture.objet,
    conditionsPaiement: facture.conditionsPaiement,
    mentionsLegales: facture.mentionsLegales,
    notes: facture.notes,
    autoLiquidation: facture.autoLiquidation,
    retenueGarantiePct: facture.retenueGarantiePct,
    remiseGlobaleType: facture.remiseGlobaleType as RemiseGlobaleType | null,
    remiseGlobaleValeur: facture.remiseGlobaleValeur,
    lignes: facture.lignes.map(
      (l): LigneFactureInput => {
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
          };
        }
        const commun = {
          designation: l.designation,
          quantite: l.quantite ?? '1',
          unite: l.unite ?? 'u',
          prixUnitaireHt: l.prixUnitaireHt ?? '0',
          tauxTva: l.tauxTva ?? '20.00',
          remisePourcent: l.remisePourcent ?? '0',
          notes: l.notes,
        };
        if (l.type === 'article_catalogue') {
          return { type: 'article_catalogue', articleId: l.articleId ?? '', ...commun };
        }
        return { type: 'libre', articleId: null, ...commun };
      },
    ),
  };

  return (
    <div className="space-y-6">
      <div className="flex items-baseline justify-between">
        <h2 className="text-xl font-medium">
          Modifier la facture <span className="font-mono">{facture.numero}</span>
        </h2>
        <Link
          href="/facturation/factures"
          className={buttonVariants({ variant: 'ghost', size: 'sm' })}
        >
          ← Retour
        </Link>
      </div>

      <FactureEditor
        clients={clients.map((c) => ({
          id: c.id,
          code: c.code,
          libelle: libelleClient(c),
        }))}
        chantiers={chantiers.map((c) => ({
          id: c.id,
          numero: c.numero,
          libelle: c.libelle,
        }))}
        devis={devis.map((d) => ({ id: d.id, numero: d.numero, clientId: d.clientId }))}
        articles={articles.map((a) => ({
          id: a.id,
          code: a.code,
          libelle: a.libelle,
          uniteVenteSymbole: a.uniteVenteSymbole,
          prixCourant: null,
        }))}
        defaultValues={defaultValues}
        onSubmit={async (values) => {
          'use server';
          return mettreAJourFacture(id, values);
        }}
        successRedirect={`/facturation/factures/${id}`}
      />

      <StatutFactureActions
        factureId={id}
        statutCourant={facture.statut as StatutFacture}
        action={async (factureId, nouveau) => {
          'use server';
          return changerStatutFacture(factureId, nouveau);
        }}
      />

      <div className="border-t pt-6">
        <h3 className="mb-2 text-sm font-medium">Facturation électronique</h3>
        <p className="mb-3 text-sm text-muted-foreground">
          Aperçu du Factur-X (PDF/A-3 + XML EN&nbsp;16931). Régénérez après chaque
          modification ; le document est archivé à l&apos;émission.
        </p>
        <FactureFacturXButton
          factureId={id}
          dejaGenere={dejaFacturX}
          generer={async (fid) => {
            'use server';
            return genererFacturX(fid);
          }}
          telecharger={async (fid) => {
            'use server';
            return urlTelechargementFacturX(fid);
          }}
        />
      </div>

      <div className="border-t pt-6 max-w-xl">
        <h3 className="mb-2 text-sm font-medium text-destructive">Zone dangereuse</h3>
        <DeleteButton
          label="Supprimer cette facture"
          confirmText="Suppression réservée aux brouillons (cohérence fiscale)."
          redirectTo="/facturation/factures"
          action={async () => {
            'use server';
            return supprimerFacture(id);
          }}
        />
      </div>
    </div>
  );
}
