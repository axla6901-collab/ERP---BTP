import { describe, expect, it } from 'vitest';

import { classifyPointageSyncError, messagePourRejet } from '@/lib/rh/pointages-sync-errors';
import { pointageSyncSchema } from '@/lib/validation/rh';

const UUID = '0190b3a2-4c1e-7a9f-8b2d-1c2e3f4a5b6c';

function payloadHeures(over: Record<string, unknown> = {}) {
  return {
    clientUuid: UUID,
    employeId: '11111111-1111-4111-8111-111111111111',
    chantierId: '22222222-2222-4222-8222-222222222222',
    chantierTacheId: null,
    datePointage: '2026-06-10',
    type: 'heures',
    quantite: '8',
    motifAbsence: null,
    zoneDeplacement: null,
    panier: false,
    grandPanier: false,
    nuitPanierSoir: false,
    notes: null,
    ...over,
  };
}

describe('pointageSyncSchema', () => {
  it('accepte un pointage heures valide et normalise la quantité', () => {
    const r = pointageSyncSchema.safeParse(payloadHeures({ quantite: '7,5' }));
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.quantite).toBe('7.50');
      expect(r.data.clientUuid).toBe(UUID);
    }
  });

  it('accepte une absence (chantier null + motif requis)', () => {
    const r = pointageSyncSchema.safeParse(
      payloadHeures({ type: 'absence', chantierId: null, motifAbsence: 'maladie' }),
    );
    expect(r.success).toBe(true);
  });

  it('refuse un clientUuid absent ou invalide', () => {
    expect(pointageSyncSchema.safeParse(payloadHeures({ clientUuid: undefined })).success).toBe(
      false,
    );
    expect(pointageSyncSchema.safeParse(payloadHeures({ clientUuid: 'pas-un-uuid' })).success).toBe(
      false,
    );
  });

  it('refuse une quantité nulle ou négative', () => {
    expect(pointageSyncSchema.safeParse(payloadHeures({ quantite: '0' })).success).toBe(false);
    expect(pointageSyncSchema.safeParse(payloadHeures({ quantite: '-3' })).success).toBe(false);
  });

  it('refuse une absence avec chantier, et des heures sans chantier', () => {
    expect(
      pointageSyncSchema.safeParse(payloadHeures({ type: 'absence', motifAbsence: 'autre' }))
        .success,
    ).toBe(false); // chantier présent sur une absence
    expect(pointageSyncSchema.safeParse(payloadHeures({ chantierId: null })).success).toBe(false); // heures sans chantier
  });
});

describe('classifyPointageSyncError', () => {
  it('mappe les SQLSTATE de contrainte vers une raison de rejet', () => {
    expect(classifyPointageSyncError({ code: '23505' })).toBe('doublon_metier');
    expect(classifyPointageSyncError({ code: '23503' })).toBe('reference_supprimee');
    expect(classifyPointageSyncError({ code: '23514' })).toBe('donnees_invalides');
  });

  it('retourne null pour une erreur inattendue (→ doit remonter en 500)', () => {
    expect(classifyPointageSyncError({ code: '08006' })).toBeNull(); // connexion perdue
    expect(classifyPointageSyncError(new Error('boom'))).toBeNull();
    expect(classifyPointageSyncError(null)).toBeNull();
    expect(classifyPointageSyncError('string')).toBeNull();
  });

  it('fournit un message FR pour chaque raison', () => {
    expect(messagePourRejet('doublon_metier')).toMatch(/existe déjà/i);
    expect(messagePourRejet('reference_supprimee')).toMatch(/supprimé/i);
    expect(messagePourRejet('donnees_invalides')).toMatch(/invalides/i);
  });
});
