/**
 * Gabarit visuel de la facture (PDF/A via @react-pdf/renderer, server-only).
 *
 * Le PDF produit ici sert de support lisible ; `render.ts` y embarque ensuite le
 * XML CII pour obtenir le Factur-X PDF/A-3. Une police TrueType est EMBARQUÉE
 * (Noto Sans, OFL) — indispensable au PDF/A (pas de police standard non incluse).
 */

import path from 'node:path';

import { Document, Font, Page, StyleSheet, Text, View } from '@react-pdf/renderer';

import type { FacturXModel } from './types';

// Police embarquée (autonome, aucun téléchargement runtime). Enregistrée une
// seule fois au chargement du module.
const FONT_PATH = path.join(
  process.cwd(),
  'lib',
  'facturation',
  'facturx',
  'assets',
  'fonts',
  'NotoSans-Regular.ttf',
);

let policeEnregistree = false;
function enregistrerPolice(): void {
  if (policeEnregistree) return;
  Font.register({ family: 'NotoSans', src: FONT_PATH });
  // Pas de césure agressive sur les longues désignations.
  Font.registerHyphenationCallback((word) => [word]);
  policeEnregistree = true;
}

// fr-FR utilise l'espace fine insécable (U+202F) comme séparateur de milliers ;
// le sous-ensemble Noto Sans embarqué ne contient pas ce glyphe (rendu « / »).
// On le remplace par une espace normale, présente dans la police.
const espaceNormale = (s: string): string => s.replace(/[  ]/g, ' ');
const _eur = new Intl.NumberFormat('fr-FR', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});
const _qte = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 3 });
const _pct = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 2 });
const nf = (n: number): string => espaceNormale(_eur.format(n));
const nq = (n: number): string => espaceNormale(_qte.format(n));
const fmtMontant = (n: number, devise: string): string => `${nf(n)} ${devise}`;
const fmtPct = (n: number): string => `${espaceNormale(_pct.format(n))} %`;
function fmtDate(iso: string | null): string {
  if (!iso) return '';
  const [y, m, d] = iso.split('-');
  return y && m && d ? `${d}/${m}/${y}` : iso;
}

const COLORS = {
  amber: '#b45309',
  ink: '#1f2937',
  muted: '#6b7280',
  line: '#e5e7eb',
  bandeau: '#fef3c7',
};

const styles = StyleSheet.create({
  page: {
    fontFamily: 'NotoSans',
    fontSize: 9,
    color: COLORS.ink,
    paddingTop: 32,
    paddingBottom: 48,
    paddingHorizontal: 36,
    lineHeight: 1.4,
  },
  row: { flexDirection: 'row' },
  spaceBetween: { flexDirection: 'row', justifyContent: 'space-between' },
  emetteurNom: { fontSize: 13, color: COLORS.amber },
  small: { fontSize: 8, color: COLORS.muted },
  titreFacture: { fontSize: 20, color: COLORS.amber, textAlign: 'right', marginBottom: 6 },
  metaLabel: { fontSize: 8, color: COLORS.muted, textAlign: 'right' },
  metaValue: { fontSize: 10, textAlign: 'right' },
  blocAcheteur: {
    marginTop: 18,
    marginLeft: 'auto',
    width: '55%',
    borderWidth: 1,
    borderColor: COLORS.line,
    borderRadius: 4,
    padding: 8,
  },
  bandeauAutoliq: {
    marginTop: 14,
    backgroundColor: COLORS.bandeau,
    borderRadius: 4,
    padding: 6,
    fontSize: 8.5,
  },
  table: { marginTop: 16, borderTopWidth: 1, borderColor: COLORS.line },
  th: {
    flexDirection: 'row',
    backgroundColor: '#f9fafb',
    borderBottomWidth: 1,
    borderColor: COLORS.line,
    paddingVertical: 4,
    paddingHorizontal: 4,
    fontSize: 8,
    color: COLORS.muted,
  },
  td: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderColor: COLORS.line,
    paddingVertical: 4,
    paddingHorizontal: 4,
  },
  section: {
    backgroundColor: '#fafaf9',
    paddingVertical: 4,
    paddingHorizontal: 4,
    borderBottomWidth: 1,
    borderColor: COLORS.line,
    color: COLORS.amber,
  },
  cDesignation: { width: '46%' },
  cQte: { width: '10%', textAlign: 'right' },
  cUnite: { width: '10%', textAlign: 'center' },
  cPu: { width: '14%', textAlign: 'right' },
  cTva: { width: '8%', textAlign: 'right' },
  cMontant: { width: '12%', textAlign: 'right' },
  totaux: { marginTop: 14, marginLeft: 'auto', width: '50%' },
  totalLine: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 2,
  },
  totalFort: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 4,
    paddingTop: 4,
    borderTopWidth: 1,
    borderColor: COLORS.ink,
    fontSize: 11,
    color: COLORS.amber,
  },
  paiement: {
    marginTop: 18,
    borderWidth: 1,
    borderColor: COLORS.line,
    borderRadius: 4,
    padding: 8,
    fontSize: 8.5,
  },
  footer: {
    position: 'absolute',
    bottom: 20,
    left: 36,
    right: 36,
    borderTopWidth: 1,
    borderColor: COLORS.line,
    paddingTop: 6,
    fontSize: 7,
    color: COLORS.muted,
    textAlign: 'center',
  },
});

function adresseLignes(p: {
  adresseLigne1: string | null;
  adresseLigne2: string | null;
  codePostal: string | null;
  ville: string | null;
  pays: string;
}): string[] {
  const out: string[] = [];
  if (p.adresseLigne1) out.push(p.adresseLigne1);
  if (p.adresseLigne2) out.push(p.adresseLigne2);
  const cpVille = [p.codePostal, p.ville].filter(Boolean).join(' ');
  if (cpVille) out.push(cpVille);
  if (p.pays) out.push(p.pays);
  return out;
}

export function FacturXPdf({ model }: { model: FacturXModel }) {
  enregistrerPolice();
  const { emetteur: e, acheteur: a, devise } = model;
  const netAPayer = model.totalTtc - model.retenueGarantieMontant;

  return (
    <Document
      title={`Facture ${model.numero}`}
      author={e.raisonSociale}
      producer="ERP BTP — Factur-X"
    >
      <Page size="A4" style={styles.page}>
        {/* En-tête : émetteur / méta facture */}
        <View style={styles.spaceBetween}>
          <View style={{ width: '55%' }}>
            <Text style={styles.emetteurNom}>{e.raisonSociale}</Text>
            {adresseLignes(e).map((l, i) => (
              <Text key={i}>{l}</Text>
            ))}
            {e.siret ? <Text style={styles.small}>SIRET {e.siret}</Text> : null}
            {e.tvaIntracom ? <Text style={styles.small}>TVA {e.tvaIntracom}</Text> : null}
          </View>
          <View style={{ width: '40%' }}>
            <Text style={styles.titreFacture}>FACTURE</Text>
            <Text style={styles.metaValue}>{model.numero}</Text>
            <Text style={styles.metaLabel}>Date : {fmtDate(model.dateFacture)}</Text>
            {model.dateEcheance ? (
              <Text style={styles.metaLabel}>Échéance : {fmtDate(model.dateEcheance)}</Text>
            ) : null}
          </View>
        </View>

        {/* Acheteur */}
        <View style={styles.blocAcheteur}>
          <Text style={styles.small}>Facturé à</Text>
          <Text style={{ fontSize: 11 }}>{a.nom}</Text>
          {adresseLignes(a).map((l, i) => (
            <Text key={i}>{l}</Text>
          ))}
          {a.type === 'professionnel' && a.tvaIntra ? (
            <Text style={styles.small}>TVA {a.tvaIntra}</Text>
          ) : null}
          {a.type === 'professionnel' && a.siret ? (
            <Text style={styles.small}>SIRET {a.siret}</Text>
          ) : null}
        </View>

        {model.objet ? <Text style={{ marginTop: 12 }}>Objet : {model.objet}</Text> : null}

        {model.autoLiquidation ? (
          <Text style={styles.bandeauAutoliq}>
            Autoliquidation de la TVA par le preneur — art. 283-2 nonies du CGI. TVA non
            facturée par le prestataire.
          </Text>
        ) : null}

        {/* Lignes */}
        <View style={styles.table}>
          <View style={styles.th}>
            <Text style={styles.cDesignation}>Désignation</Text>
            <Text style={styles.cQte}>Qté</Text>
            <Text style={styles.cUnite}>Unité</Text>
            <Text style={styles.cPu}>PU HT</Text>
            <Text style={styles.cTva}>TVA</Text>
            <Text style={styles.cMontant}>Montant HT</Text>
          </View>
          {model.lignes.map((l, i) =>
            l.estSection ? (
              <Text key={i} style={styles.section}>
                {l.designation}
              </Text>
            ) : (
              <View key={i} style={styles.td} wrap={false}>
                <Text style={styles.cDesignation}>{l.designation}</Text>
                <Text style={styles.cQte}>{nq(l.quantite ?? 0)}</Text>
                <Text style={styles.cUnite}>{l.unite ?? ''}</Text>
                <Text style={styles.cPu}>{nf(l.prixUnitaireHt ?? 0)}</Text>
                <Text style={styles.cTva}>
                  {model.autoLiquidation ? 'AL' : fmtPct(l.tauxTva ?? 0)}
                </Text>
                <Text style={styles.cMontant}>{nf(l.montantHt ?? 0)}</Text>
              </View>
            ),
          )}
        </View>

        {/* Totaux */}
        <View style={styles.totaux}>
          {model.remiseGlobaleMontant > 0 ? (
            <>
              <View style={styles.totalLine}>
                <Text>Sous-total HT</Text>
                <Text>{fmtMontant(model.totalHt + model.remiseGlobaleMontant, devise)}</Text>
              </View>
              <View style={styles.totalLine}>
                <Text>Remise globale</Text>
                <Text>− {fmtMontant(model.remiseGlobaleMontant, devise)}</Text>
              </View>
            </>
          ) : null}
          <View style={styles.totalLine}>
            <Text>Total HT</Text>
            <Text>{fmtMontant(model.totalHt, devise)}</Text>
          </View>
          {model.tva.map((t, i) => (
            <View key={i} style={styles.totalLine}>
              <Text style={styles.small}>
                TVA {model.autoLiquidation ? '(autoliquidée)' : fmtPct(t.taux)} sur{' '}
                {nf(t.base)}
              </Text>
              <Text style={styles.small}>{fmtMontant(t.montant, devise)}</Text>
            </View>
          ))}
          <View style={styles.totalLine}>
            <Text>Total TVA</Text>
            <Text>{fmtMontant(model.totalTva, devise)}</Text>
          </View>
          <View style={styles.totalFort}>
            <Text>Total TTC</Text>
            <Text>{fmtMontant(model.totalTtc, devise)}</Text>
          </View>
          {model.retenueGarantieMontant > 0 ? (
            <>
              <View style={styles.totalLine}>
                <Text>Retenue de garantie</Text>
                <Text>− {fmtMontant(model.retenueGarantieMontant, devise)}</Text>
              </View>
              <View style={styles.totalLine}>
                <Text>Net à payer à ce jour</Text>
                <Text>{fmtMontant(netAPayer, devise)}</Text>
              </View>
            </>
          ) : null}
        </View>

        {/* Paiement */}
        <View style={styles.paiement}>
          {model.conditionsPaiement ? (
            <Text>Conditions de paiement : {model.conditionsPaiement}</Text>
          ) : null}
          {e.iban ? (
            <Text>
              Règlement par virement — IBAN {e.iban}
              {e.bic ? ` — BIC ${e.bic}` : ''}
            </Text>
          ) : null}
          {model.retenueGarantieMontant > 0 ? (
            <Text style={styles.small}>
              Retenue de garantie de {fmtMontant(model.retenueGarantieMontant, devise)} retenue
              jusqu&apos;à réception des travaux.
            </Text>
          ) : null}
        </View>

        {/* Mentions légales */}
        <Text style={styles.footer} fixed>
          {[
            e.raisonSociale,
            e.formeJuridique
              ? `${e.formeJuridique}${e.capitalSocial ? ` au capital de ${nf(Number(e.capitalSocial))} ${devise}` : ''}`
              : null,
            e.rcs,
            e.siret ? `SIRET ${e.siret}` : null,
            e.codeApe ? `APE ${e.codeApe}` : null,
            e.tvaIntracom ? `TVA ${e.tvaIntracom}` : null,
          ]
            .filter(Boolean)
            .join(' · ')}
          {model.mentionsLegales ? `\n${model.mentionsLegales}` : ''}
        </Text>
      </Page>
    </Document>
  );
}
