/**
 * Orchestration de la génération Factur-X (server-only).
 *
 *   modèle métier → PDF visuel (react-pdf) → embarquement du XML CII EN 16931
 *   + passage en PDF/A-3b (node-zugferd) → buffer prêt à archiver.
 *
 * Autonomie : `strict: false` désactive la validation XSD de node-zugferd, qui
 * sinon exige un JRE Java (cf. dépendance xsd-schema-validator). La conformité
 * est vérifiée manuellement contre le validateur Factur-X officiel (cf. plan).
 * node-zugferd ajoute lui-même le profil ICC sRGB requis par le PDF/A.
 */

import 'server-only';

import { renderToBuffer } from '@react-pdf/renderer';
import { zugferd } from 'node-zugferd';
import { EN16931 } from 'node-zugferd/profile/en16931';

import { construireDocumentFacturX } from './mapping';
import { FacturXPdf } from './pdf-template';
import type { FacturXModel } from './types';

// Instance unique (le profil et le contexte sont sans état entre factures).
const invoicer = zugferd({ profile: EN16931, strict: false, logger: { disabled: true } });

export type FacturXResultat = {
  /** PDF/A-3 (Factur-X EN 16931) prêt à stocker / télécharger. */
  pdf: Uint8Array;
  /** Profil Factur-X effectif. */
  profil: 'en16931';
  /** XML validé contre le XSD ? false ici (validation déléguée — pas de JRE). */
  xmlValide: boolean;
};

/**
 * Produit le Factur-X (PDF/A-3 + XML CII embarqué) à partir du modèle métier.
 * Le modèle doit être complet — appeler `champsManquantsFacturX` en amont.
 */
export async function genererFacturX(model: FacturXModel): Promise<FacturXResultat> {
  // 1. PDF visuel lisible (police embarquée).
  const pdfVisuel = await renderToBuffer(<FacturXPdf model={model} />);

  // 2. XML CII EN 16931 + embarquement → PDF/A-3b.
  const data = construireDocumentFacturX(model);
  const document = invoicer.create(data as never);
  const pdfA = await document.embedInPdf(pdfVisuel, {
    metadata: {
      title: `Facture ${model.numero}`,
      author: model.emetteur.raisonSociale,
    },
  });

  return { pdf: pdfA, profil: 'en16931', xmlValide: false };
}

/** Sérialise uniquement le XML CII (debug / tests / archivage séparé). */
export async function genererXmlFacturX(model: FacturXModel): Promise<string> {
  const document = invoicer.create(construireDocumentFacturX(model) as never);
  return document.toXML();
}
