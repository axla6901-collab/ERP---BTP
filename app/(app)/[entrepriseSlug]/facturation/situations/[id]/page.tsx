import Link from 'next/link';
import { notFound } from 'next/navigation';

import { SituationActions } from '@/components/facturation/situation-actions';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { requireAuthWithMfa } from '@/lib/auth/guards';
import { peutEcrireFacturation } from '@/lib/facturation/permissions';
import {
  calculerMontantRemiseGlobale,
  libelleRemiseGlobale,
  type RemiseGlobaleType,
} from '@/lib/remise-globale';
import {
  annulerSituation,
  genererFactureDepuisSituation,
  lireSituation,
  validerSituation,
} from '@/lib/facturation/situations';
import {
  LIBELLES_STATUT_SITUATION,
  type StatutSituation,
} from '@/lib/validation/facturation';

function formatMontant(m: string | null | number): string {
  if (m === null || m === undefined || m === '') return '—';
  const n = Number(m);
  if (Number.isNaN(n)) return String(m);
  return n.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function formatPct(p: string | null): string {
  if (p === null) return '—';
  return `${Number(p).toFixed(2).replace(/\.?0+$/, '')} %`;
}

export default async function SituationDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const utilisateur = await requireAuthWithMfa();
  const peutEcrire = peutEcrireFacturation(utilisateur.role);

  const situation = await lireSituation(id);
  if (!situation) notFound();

  const statut = situation.statut as StatutSituation;

  const remiseGlobale = {
    type: situation.remiseGlobaleType as RemiseGlobaleType | null,
    valeur: situation.remiseGlobaleValeur,
  };
  const montantRemiseGlobale = calculerMontantRemiseGlobale(
    Number(situation.montantAFacturerHt),
    remiseGlobale,
  );
  const aRemiseGlobale = montantRemiseGlobale > 0;
  const aFacturerNetHt = (
    Number(situation.montantAFacturerHt) - montantRemiseGlobale
  ).toFixed(2);

  return (
    <div className="space-y-6">
      <div className="flex items-baseline justify-between">
        <h2 className="text-xl font-medium">
          Situation n°{situation.numero} —{' '}
          <span className="font-mono text-sm text-muted-foreground">
            {situation.chantierNumero}
          </span>{' '}
          {situation.chantierLibelle}
        </h2>
        <span className="rounded-full bg-muted px-3 py-1 text-xs">
          {LIBELLES_STATUT_SITUATION[statut]}
        </span>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Récapitulatif</CardTitle>
        </CardHeader>
        <CardContent>
          <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm sm:grid-cols-[auto_1fr_auto_1fr]">
            <dt className="text-muted-foreground">Date</dt>
            <dd>{situation.dateSituation}</dd>
            <dt className="text-muted-foreground">Taux TVA</dt>
            <dd>{formatPct(situation.tauxTva)}</dd>

            <dt className="text-muted-foreground">% avancement global</dt>
            <dd className="font-semibold">{formatPct(situation.pctAvancementCumule)}</dd>
            <dt className="text-muted-foreground">Marché total HT</dt>
            <dd className="tabular-nums">{formatMontant(situation.montantMarcheHt)} €</dd>

            <dt className="text-muted-foreground">Cumulé HT</dt>
            <dd className="tabular-nums">{formatMontant(situation.montantCumuleHt)} €</dd>
            <dt className="text-muted-foreground">Cumulé précédent</dt>
            <dd className="tabular-nums">
              − {formatMontant(situation.montantSituationPrecedenteHt)} €
            </dd>

            <dt className="text-muted-foreground">
              <strong>À facturer HT{aRemiseGlobale ? ' brut' : ''}</strong>
            </dt>
            <dd className="text-lg font-semibold tabular-nums">
              {formatMontant(situation.montantAFacturerHt)} €
            </dd>
            {aRemiseGlobale && (
              <>
                <dt className="text-muted-foreground">
                  Remise globale ({libelleRemiseGlobale(remiseGlobale)})
                </dt>
                <dd className="tabular-nums">
                  − {formatMontant(montantRemiseGlobale.toFixed(2))} €
                </dd>
                <dt className="text-muted-foreground">
                  <strong>À facturer net HT</strong>
                </dt>
                <dd className="text-lg font-semibold tabular-nums">
                  {formatMontant(aFacturerNetHt)} €
                </dd>
              </>
            )}
            {situation.factureNumero && situation.factureId ? (
              <>
                <dt className="text-muted-foreground">Facture</dt>
                <dd>
                  <Link
                    href={`/facturation/factures/${situation.factureId}`}
                    className="font-mono text-xs underline underline-offset-4"
                  >
                    {situation.factureNumero}
                  </Link>
                </dd>
              </>
            ) : (
              <>
                <dt className="text-muted-foreground">Facture</dt>
                <dd className="text-xs text-muted-foreground">Non générée</dd>
              </>
            )}
          </dl>
          {situation.notes && (
            <div className="mt-4 rounded bg-muted/30 p-3 text-sm">
              <div className="mb-1 text-xs font-medium text-muted-foreground">Notes</div>
              <div className="whitespace-pre-wrap">{situation.notes}</div>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Détail des lignes ({situation.lignes.length})</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Désignation</TableHead>
                  <TableHead className="text-right">Qté</TableHead>
                  <TableHead>U</TableHead>
                  <TableHead className="text-right">PU HT (€)</TableHead>
                  <TableHead className="text-right">Marché HT (€)</TableHead>
                  <TableHead className="text-right">% cumulé</TableHead>
                  <TableHead className="text-right">Cumulé HT (€)</TableHead>
                  <TableHead className="text-right">Précédent HT (€)</TableHead>
                  <TableHead className="text-right">À facturer HT (€)</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {situation.lignes.map((l) => (
                  <TableRow key={l.id}>
                    <TableCell className="text-sm">{l.designation}</TableCell>
                    <TableCell className="text-right text-xs tabular-nums">
                      {l.quantite ?? '—'}
                    </TableCell>
                    <TableCell className="text-xs">{l.unite ?? '—'}</TableCell>
                    <TableCell className="text-right text-xs tabular-nums">
                      {l.prixUnitaireHt ?? '—'}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatMontant(l.montantMarcheHt)}
                    </TableCell>
                    <TableCell className="text-right text-xs tabular-nums">
                      {formatPct(l.pctAvancementCumule)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatMontant(l.montantCumuleHt)}
                    </TableCell>
                    <TableCell className="text-right text-xs text-muted-foreground tabular-nums">
                      − {formatMontant(l.montantSituationPrecedenteHt)}
                    </TableCell>
                    <TableCell className="text-right font-semibold tabular-nums">
                      {formatMontant(l.montantAFacturerHt)}
                    </TableCell>
                  </TableRow>
                ))}
                <TableRow>
                  <TableCell colSpan={4} className="text-right text-sm font-medium">
                    Totaux
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {formatMontant(situation.montantMarcheHt)}
                  </TableCell>
                  <TableCell className="text-right text-xs tabular-nums">
                    {formatPct(situation.pctAvancementCumule)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {formatMontant(situation.montantCumuleHt)}
                  </TableCell>
                  <TableCell className="text-right text-xs text-muted-foreground tabular-nums">
                    − {formatMontant(situation.montantSituationPrecedenteHt)}
                  </TableCell>
                  <TableCell className="text-right font-semibold tabular-nums">
                    {formatMontant(situation.montantAFacturerHt)}
                  </TableCell>
                </TableRow>
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {peutEcrire && (
        <SituationActions
          situationId={id}
          statut={statut}
          dejaFacturee={!!situation.factureId}
          actionValider={async (sid) => {
            'use server';
            return validerSituation(sid);
          }}
          actionGenererFacture={async (sid) => {
            'use server';
            return genererFactureDepuisSituation(sid);
          }}
          actionAnnuler={async (sid) => {
            'use server';
            return annulerSituation(sid);
          }}
        />
      )}

      <Link
        href="/facturation/situations"
        className="text-sm text-muted-foreground underline underline-offset-4"
      >
        ← Retour aux situations
      </Link>
    </div>
  );
}
