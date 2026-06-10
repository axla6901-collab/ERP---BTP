'use client';

import { calculerTotauxDevis } from '@/lib/commercial/calculs';
import {
  appliquerRemiseGlobale,
  libelleRemiseGlobale,
  type RemiseGlobale,
} from '@/lib/remise-globale';
import type {
  LigneDevisInput,
  PosteInterneFormInput,
} from '@/lib/validation/commercial';

function formatMontant(m: string | number): string {
  const n = typeof m === 'number' ? m : Number(m);
  if (Number.isNaN(n)) return String(m);
  return n.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

type Props = {
  lignes: LigneDevisInput[];
  postesInternes?: PosteInterneFormInput[];
  /** Remise globale appliquée sur le total HT (en plus des remises par ligne). */
  remiseGlobale?: RemiseGlobale;
};

export function TotauxDevis({
  lignes,
  postesInternes = [],
  remiseGlobale = { type: null, valeur: null },
}: Props) {
  // Calcul live côté client à chaque rendu (les valeurs de form changent)
  let totaux: ReturnType<typeof calculerTotauxDevis>;
  let totauxNus: ReturnType<typeof calculerTotauxDevis>;
  try {
    totaux = calculerTotauxDevis(lignes, postesInternes);
    totauxNus = calculerTotauxDevis(lignes, []);
  } catch {
    // Si une ligne est en cours de saisie et n'est pas encore valide, on affiche zéro
    const vide = { totalHt: '0.00', totalTva: '0.00', totalTtc: '0.00', detailsTva: {} };
    totaux = vide;
    totauxNus = vide;
  }

  // Applique la remise globale (ventilée par taux de TVA) sur les totaux all-in.
  const net = appliquerRemiseGlobale(totaux, remiseGlobale);
  const aRemise = Number(net.remiseGlobaleMontant) > 0;

  const tauxOrdonnes = Object.keys(net.detailsTva).sort();
  const totalInterne = Number(totaux.totalHt) - Number(totauxNus.totalHt);
  const hasPostesInternes = postesInternes.length > 0 && totalInterne > 0.01;

  return (
    <div className="rounded-md border bg-muted/30 p-4">
      <div className="mb-3 text-sm font-medium text-muted-foreground">
        Récapitulatif {hasPostesInternes && '— montants client (all-in)'}
      </div>
      <dl className="grid grid-cols-2 gap-2 text-sm">
        {hasPostesInternes && (
          <>
            <dt className="text-xs text-muted-foreground">Lignes (HT nu)</dt>
            <dd className="text-right text-xs text-muted-foreground tabular-nums">
              {formatMontant(totauxNus.totalHt)} €
            </dd>
            <dt className="text-xs text-muted-foreground">
              + Postes internes ventilés ({postesInternes.length})
            </dt>
            <dd className="text-right text-xs text-muted-foreground tabular-nums">
              {formatMontant(totalInterne)} €
            </dd>
          </>
        )}
        <dt className="text-muted-foreground">Total HT{aRemise ? ' brut' : ''}</dt>
        <dd className="text-right tabular-nums">{formatMontant(net.totalHtAvantRemise)} €</dd>

        {aRemise && (
          <>
            <dt className="text-muted-foreground">
              Remise globale ({libelleRemiseGlobale(remiseGlobale)})
            </dt>
            <dd className="text-right tabular-nums text-destructive">
              − {formatMontant(net.remiseGlobaleMontant)} €
            </dd>
            <dt className="font-medium">Total HT net</dt>
            <dd className="text-right font-medium tabular-nums">
              {formatMontant(net.totalHt)} €
            </dd>
          </>
        )}

        {tauxOrdonnes.map((taux) => {
          const d = net.detailsTva[taux];
          if (!d) return null;
          return (
            <div key={taux} className="col-span-2 grid grid-cols-2 gap-2 text-xs text-muted-foreground">
              <dt>TVA {Number(taux).toFixed(2).replace(/\.?0+$/, '')} % sur {formatMontant(d.base)} €</dt>
              <dd className="text-right tabular-nums">{formatMontant(d.tva)} €</dd>
            </div>
          );
        })}

        <dt className="text-muted-foreground">Total TVA</dt>
        <dd className="text-right tabular-nums">{formatMontant(net.totalTva)} €</dd>

        <dt className="text-base font-semibold">Total TTC</dt>
        <dd className="text-right text-base font-semibold tabular-nums">{formatMontant(net.totalTtc)} €</dd>
      </dl>
    </div>
  );
}
