/**
 * Construction (pure, testable) d'une entrée d'outbox à partir de l'état du
 * formulaire terrain. Aucune dépendance DOM/IndexedDB — voir pointage-terrain.tsx
 * pour le câblage. La validation définitive est refaite côté serveur
 * (`pointageSyncSchema`) ; ici on bloque juste les saisies évidemment invalides.
 */

import {
  LIBELLES_MOTIF_ABSENCE,
  LIBELLES_TYPE_POINTAGE,
  type MotifAbsence,
  type ZoneDeplacement,
} from '@/lib/validation/rh';

import type { OutboxEntry, PointageSyncPayload } from './types';

export type TerrainType = 'heures' | 'absence';

export type TerrainFormState = {
  employeId: string;
  employeNom: string;
  type: TerrainType;
  chantierId: string | null;
  chantierLibelle: string | null;
  chantierTacheId: string | null;
  motifAbsence: MotifAbsence | null;
  zoneDeplacement: ZoneDeplacement | null;
  /** Saisie brute (peut contenir une virgule décimale). */
  quantite: string;
  datePointage: string; // YYYY-MM-DD
  panier: boolean;
  grandPanier: boolean;
  nuitPanierSoir: boolean;
  notes: string | null;
};

export type BuildResult = { ok: true; entry: OutboxEntry } | { ok: false; error: string };

/** Construit (et pré-valide) l'entrée d'outbox. `clientUuid` = idempotency key. */
export function buildOutboxEntry(
  form: TerrainFormState,
  clientUuid: string,
  nowIso: string,
): BuildResult {
  if (!form.employeId) return { ok: false, error: 'Sélectionnez un employé.' };

  const quantite = Number(String(form.quantite).replace(',', '.'));
  if (!Number.isFinite(quantite) || quantite <= 0) {
    return { ok: false, error: "Saisissez un nombre d'heures supérieur à 0." };
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(form.datePointage)) {
    return { ok: false, error: 'Date invalide.' };
  }

  const estAbsence = form.type === 'absence';
  if (estAbsence) {
    if (!form.motifAbsence) return { ok: false, error: "Motif d'absence requis." };
  } else if (!form.chantierId) {
    return { ok: false, error: 'Sélectionnez un chantier.' };
  }

  const payload: PointageSyncPayload = {
    clientUuid,
    employeId: form.employeId,
    chantierId: estAbsence ? null : form.chantierId,
    chantierTacheId: estAbsence ? null : form.chantierTacheId,
    datePointage: form.datePointage,
    type: form.type,
    quantite: quantite.toFixed(2),
    motifAbsence: estAbsence ? form.motifAbsence : null,
    zoneDeplacement: estAbsence ? null : form.zoneDeplacement,
    panier: estAbsence ? false : form.panier,
    grandPanier: estAbsence ? false : form.grandPanier,
    nuitPanierSoir: estAbsence ? false : form.nuitPanierSoir,
    notes: form.notes && form.notes.trim().length > 0 ? form.notes.trim() : null,
  };

  const typeLabel =
    estAbsence && form.motifAbsence
      ? LIBELLES_MOTIF_ABSENCE[form.motifAbsence]
      : LIBELLES_TYPE_POINTAGE.heures;

  const entry: OutboxEntry = {
    clientUuid,
    payload,
    status: 'pending',
    attempts: 0,
    createdAtLocal: nowIso,
    lastTriedAt: null,
    display: {
      employeNom: form.employeNom,
      chantierLibelle: estAbsence ? null : form.chantierLibelle,
      typeLabel,
    },
  };

  return { ok: true, entry };
}
