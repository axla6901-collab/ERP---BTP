import { z } from 'zod';

import {
  dateOptionnelle,
  entierRequis,
  texteOptionnel,
  texteRequis,
  uuidOptionnel,
  uuidRequis,
} from './commun';

/**
 * Schémas Zod — Test SIRH › Documents RH (GED, Factorial documents/Folder +
 * Document). Les fichiers eux-mêmes passent par `lib/test-sirh/stockage.ts`
 * (URL présignée MinIO + `creerDocumentSirh`).
 */

const MESSAGE_DATES = "La date d'expiration doit être postérieure à la date du document.";

// ─────────────────────────────────────────────────────────────
// Dossiers
// ─────────────────────────────────────────────────────────────

export const dossierDocumentsSchema = z.object({
  id: z.string().uuid().optional(),
  nom: texteRequis('Nom', 120),
  description: texteOptionnel(500),
  /** Les documents du dossier sont visibles par le salarié concerné (« Mon espace »). */
  visibleSalarie: z.boolean(),
  ordre: entierRequis('Ordre', { min: 0, max: 9999 }),
});
export type DossierDocumentsInput = z.infer<typeof dossierDocumentsSchema>;

// ─────────────────────────────────────────────────────────────
// Métadonnées d'un document existant
// ─────────────────────────────────────────────────────────────

export const documentMetadonneesSchema = z
  .object({
    id: uuidRequis('Document'),
    titre: texteRequis('Titre', 200),
    dossierId: uuidOptionnel,
    dateDocument: dateOptionnelle,
    dateExpiration: dateOptionnelle,
    visibleSalarie: z.boolean(),
    signatureRequise: z.boolean(),
    notes: texteOptionnel(1000),
  })
  .superRefine((v, ctx) => {
    if (v.dateDocument && v.dateExpiration && v.dateExpiration < v.dateDocument) {
      ctx.addIssue({ code: 'custom', path: ['dateExpiration'], message: MESSAGE_DATES });
    }
  });
export type DocumentMetadonneesInput = z.infer<typeof documentMetadonneesSchema>;

// ─────────────────────────────────────────────────────────────
// Téléversement (formulaire rempli AVANT le choix du fichier)
// ─────────────────────────────────────────────────────────────

export const televersementDocumentSchema = z
  .object({
    /** Document rattaché à un salarié, ou document d'entreprise. */
    cibleType: z.enum(['employe', 'entreprise']),
    employeId: uuidOptionnel,
    /** Vide → nom du fichier sans extension. */
    titre: texteOptionnel(200),
    dossierId: uuidOptionnel,
    dateDocument: dateOptionnelle,
    dateExpiration: dateOptionnelle,
    visibleSalarie: z.boolean(),
    signatureRequise: z.boolean(),
    notes: texteOptionnel(1000),
  })
  .superRefine((v, ctx) => {
    if (v.cibleType === 'employe' && !v.employeId) {
      ctx.addIssue({ code: 'custom', path: ['employeId'], message: 'Collaborateur requis.' });
    }
    if (v.dateDocument && v.dateExpiration && v.dateExpiration < v.dateDocument) {
      ctx.addIssue({ code: 'custom', path: ['dateExpiration'], message: MESSAGE_DATES });
    }
  });
export type TeleversementDocumentInput = z.infer<typeof televersementDocumentSchema>;
