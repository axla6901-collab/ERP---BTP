'use client';

import { calculerTotauxDevis } from '@/lib/commercial/calculs';
import {
  appliquerRemiseGlobale,
  libelleRemiseGlobale,
  type RemiseGlobale,
} from '@/lib/remise-globale';
import type { LigneDevisInput, PosteInterneFormInput } from '@/lib/validation/commercial';

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

  // Carte récap « ambre » du rail, fidèle à la maquette devis : en-tête + corps
  // détaillé (HT brut, postes internes, remise ventilée, TVA par taux) + pied
  // Total TTC mis en avant.
  return (
    <section className="overflow-hidden rounded-xl bg-amber-50 ring-1 ring-amber-200 dark:bg-amber-950/30 dark:ring-amber-900/50">
      <div className="px-4 pb-1 pt-3">
        <h3 className="font-heading font-semibold text-orange-700">
          Récapitulatif{' '}
          {hasPostesInternes && (
            <span className="font-normal text-orange-700/70">— montants client (all-in)</span>
          )}
        </h3>
      </div>
      <dl className="space-y-1.5 border-t border-amber-200/70 px-4 py-3 text-sm dark:border-amber-900/40">
        {hasPostesInternes && (
          <>
            <div className="flex justify-between text-xs text-muted-foreground">
              <dt>Lignes (HT nu)</dt>
              <dd className="tabular-nums">{formatMontant(totauxNus.totalHt)} €</dd>
            </div>
            <div className="flex justify-between text-xs text-muted-foreground">
              <dt>+ Postes internes ventilés ({postesInternes.length})</dt>
              <dd className="tabular-nums">{formatMontant(totalInterne)} €</dd>
            </div>
          </>
        )}

        <div className="flex justify-between text-muted-foreground">
          <dt>Total HT{aRemise ? ' brut' : ''}</dt>
          <dd className="tabular-nums">{formatMontant(net.totalHtAvantRemise)} €</dd>
        </div>

        {aRemise && (
          <>
            <div className="flex justify-between text-destructive">
              <dt>Remise globale ({libelleRemiseGlobale(remiseGlobale)})</dt>
              <dd className="tabular-nums">− {formatMontant(net.remiseGlobaleMontant)} €</dd>
            </div>
            <div className="flex justify-between border-t border-amber-200/70 pt-1.5 font-medium dark:border-amber-900/40">
              <dt>Total HT net</dt>
              <dd className="tabular-nums">{formatMontant(net.totalHt)} €</dd>
            </div>
          </>
        )}

        {tauxOrdonnes.map((taux) => {
          const d = net.detailsTva[taux];
          if (!d) return null;
          return (
            <div key={taux} className="flex justify-between text-xs text-muted-foreground">
              <dt>
                TVA{' '}
                {Number(taux)
                  .toFixed(2)
                  .replace(/\.?0+$/, '')}{' '}
                % sur {formatMontant(d.base)} €
              </dt>
              <dd className="tabular-nums">{formatMontant(d.tva)} €</dd>
            </div>
          );
        })}

        <div className="flex justify-between border-t border-amber-200/70 pt-1.5 text-muted-foreground dark:border-amber-900/40">
          <dt>Total TVA</dt>
          <dd className="tabular-nums">{formatMontant(net.totalTva)} €</dd>
        </div>
      </dl>
      <div className="flex items-center justify-between border-t border-amber-200 px-4 py-3 dark:border-amber-900/50">
        <span className="text-sm font-semibold text-orange-800 dark:text-orange-300">
          Total TTC
        </span>
        <span className="font-heading text-2xl font-semibold tabular-nums text-orange-800 dark:text-orange-300">
          {formatMontant(net.totalTtc)} €
        </span>
      </div>
    </section>
  );
}
