import { z } from 'zod';

import { societeInterimRequise } from '@/lib/test-sirh/recrutement/pipeline';

import {
  dateOptionnelle,
  dateRequise,
  emailOptionnel,
  entierRequis,
  heureOptionnelle,
  montantOptionnel,
  noteOptionnelle,
  texteOptionnel,
  texteRequis,
  uuidOptionnel,
  uuidRequis,
} from './commun';
import {
  AVIS_RECRUTEMENT,
  ETAPES_CANDIDATURE,
  MOTIFS_REFUS,
  SOURCES_CANDIDAT,
  STATUTS_OFFRE,
  TYPES_CONTRAT,
} from './enums';

/**
 * Schémas Zod — Test SIRH › Recrutement (Factorial ats : JobPosting, Candidate,
 * Application, HiringStage, RejectionReason, Feedback).
 *
 * Convention SIRH : les helpers « optionnels » rendent la clé obligatoire en
 * sortie — l'UI envoie toujours toutes les clés (`null` si vide).
 */

// ─────────────────────────────────────────────────────────────
// Offres d'emploi
// ─────────────────────────────────────────────────────────────

export const offreSchema = z
  .object({
    id: z.string().uuid().optional(),
    reference: texteOptionnel(30),
    titre: texteRequis('Titre', 160),
    posteId: uuidOptionnel,
    siteId: uuidOptionnel,
    typeContrat: z.enum(TYPES_CONTRAT),
    description: texteOptionnel(5000),
    profilRecherche: texteOptionnel(5000),
    nbPostes: entierRequis('Nombre de postes', { min: 1, max: 999 }),
    salaireMin: montantOptionnel('Salaire minimum'),
    salaireMax: montantOptionnel('Salaire maximum'),
    statut: z.enum(STATUTS_OFFRE),
    datePublication: dateOptionnelle,
    dateCloture: dateOptionnelle,
    responsableId: uuidOptionnel,
  })
  .superRefine((v, ctx) => {
    if (
      v.salaireMin !== null &&
      v.salaireMax !== null &&
      Number(v.salaireMax) < Number(v.salaireMin)
    ) {
      ctx.addIssue({
        code: 'custom',
        path: ['salaireMax'],
        message: 'Le salaire maximum doit être supérieur ou égal au minimum.',
      });
    }
    if (v.datePublication && v.dateCloture && v.dateCloture < v.datePublication) {
      ctx.addIssue({
        code: 'custom',
        path: ['dateCloture'],
        message: 'La date de clôture doit suivre la date de publication.',
      });
    }
  });
export type OffreInput = z.infer<typeof offreSchema>;

export const changementStatutOffreSchema = z.object({
  id: uuidRequis('Offre'),
  statut: z.enum(STATUTS_OFFRE),
});
export type ChangementStatutOffreInput = z.infer<typeof changementStatutOffreSchema>;

// ─────────────────────────────────────────────────────────────
// Candidats (vivier)
// ─────────────────────────────────────────────────────────────

export const candidatSchema = z
  .object({
    id: z.string().uuid().optional(),
    nom: texteRequis('Nom', 100),
    prenom: texteRequis('Prénom', 100),
    email: emailOptionnel,
    telephone: texteOptionnel(30),
    ville: texteOptionnel(120),
    source: z.enum(SOURCES_CANDIDAT),
    consentementRgpd: z.boolean(),
    dateConsentement: dateOptionnelle,
    notes: texteOptionnel(2000),
  })
  .superRefine((v, ctx) => {
    if (v.consentementRgpd && !v.dateConsentement) {
      ctx.addIssue({
        code: 'custom',
        path: ['dateConsentement'],
        message: 'Date du consentement requise.',
      });
    }
  });
export type CandidatInput = z.infer<typeof candidatSchema>;

// ─────────────────────────────────────────────────────────────
// Candidatures (pipeline)
// ─────────────────────────────────────────────────────────────

/**
 * Ajout d'un candidat à une offre : candidat existant du vivier
 * (`mode: 'existant'` + `candidatId`) OU création rapide (`mode: 'nouveau'`).
 */
export const ajoutCandidatureSchema = z
  .object({
    offreId: uuidRequis('Offre'),
    mode: z.enum(['existant', 'nouveau']),
    candidatId: uuidOptionnel,
    nom: texteOptionnel(100),
    prenom: texteOptionnel(100),
    email: emailOptionnel,
    telephone: texteOptionnel(30),
    source: z.enum(SOURCES_CANDIDAT),
    consentementRgpd: z.boolean(),
    dateCandidature: dateRequise,
    commentaire: texteOptionnel(2000),
  })
  .superRefine((v, ctx) => {
    if (v.mode === 'existant' && !v.candidatId) {
      ctx.addIssue({ code: 'custom', path: ['candidatId'], message: 'Choisissez un candidat.' });
    }
    if (v.mode === 'nouveau') {
      if (!v.nom) ctx.addIssue({ code: 'custom', path: ['nom'], message: 'Nom requis.' });
      if (!v.prenom) ctx.addIssue({ code: 'custom', path: ['prenom'], message: 'Prénom requis.' });
    }
  });
export type AjoutCandidatureInput = z.infer<typeof ajoutCandidatureSchema>;

/** Déplacement vers une étape (avance, retour, réouverture). */
export const etapeCandidatureSchema = z.object({
  id: uuidRequis('Candidature'),
  etape: z.enum(ETAPES_CANDIDATURE),
});
export type EtapeCandidatureInput = z.infer<typeof etapeCandidatureSchema>;

/** Refus : motif OBLIGATOIRE (CHECK `chk_sirh_candidatures_refus`). */
export const refusCandidatureSchema = z.object({
  id: uuidRequis('Candidature'),
  motifRefus: z.enum(MOTIFS_REFUS, { error: 'Motif de refus obligatoire.' }),
  commentaire: texteOptionnel(2000),
});
export type RefusCandidatureInput = z.infer<typeof refusCandidatureSchema>;

/** Entretien planifié (date + heure en heure de Paris) ; les deux vides = pas d'entretien. */
export const entretienCandidatureSchema = z
  .object({
    id: uuidRequis('Candidature'),
    date: dateOptionnelle,
    heure: heureOptionnelle,
  })
  .superRefine((v, ctx) => {
    if (v.date && !v.heure) {
      ctx.addIssue({ code: 'custom', path: ['heure'], message: 'Heure de l’entretien requise.' });
    }
    if (!v.date && v.heure) {
      ctx.addIssue({ code: 'custom', path: ['date'], message: 'Date de l’entretien requise.' });
    }
  });
export type EntretienCandidatureInput = z.infer<typeof entretienCandidatureSchema>;

export const noteCandidatureSchema = z.object({
  id: uuidRequis('Candidature'),
  note: noteOptionnelle,
});
export type NoteCandidatureInput = z.infer<typeof noteCandidatureSchema>;

export const commentaireCandidatureSchema = z.object({
  id: uuidRequis('Candidature'),
  commentaire: texteOptionnel(2000),
});
export type CommentaireCandidatureInput = z.infer<typeof commentaireCandidatureSchema>;

/** Avis d'un évaluateur (Factorial ats/Feedback). */
export const avisCandidatureSchema = z.object({
  candidatureId: uuidRequis('Candidature'),
  note: noteOptionnelle,
  avis: z.enum(AVIS_RECRUTEMENT),
  commentaire: texteOptionnel(2000),
});
export type AvisCandidatureInput = z.infer<typeof avisCandidatureSchema>;

// ─────────────────────────────────────────────────────────────
// Embauche (passerelle recrutement → RH)
// ─────────────────────────────────────────────────────────────

export const embaucheSchema = z
  .object({
    candidatureId: uuidRequis('Candidature'),
    dateEntree: dateRequise,
    typeContrat: z.enum(TYPES_CONTRAT),
    societeInterim: texteOptionnel(120),
  })
  .superRefine((v, ctx) => {
    if (societeInterimRequise(v.typeContrat) && !v.societeInterim) {
      ctx.addIssue({
        code: 'custom',
        path: ['societeInterim'],
        message: 'Société d’intérim requise pour un contrat d’intérim.',
      });
    }
  });
export type EmbaucheInput = z.infer<typeof embaucheSchema>;
