import { describe, expect, it } from 'vitest';

import { buildOutboxEntry, type TerrainFormState } from '@/lib/pwa/build-payload';
import { pointageSyncSchema } from '@/lib/validation/rh';

const UUID = '0190b3a2-4c1e-7a9f-8b2d-1c2e3f4a5b6c';
const NOW = '2026-06-10T08:30:00.000Z';

function formHeures(over: Partial<TerrainFormState> = {}): TerrainFormState {
  return {
    employeId: '11111111-1111-4111-8111-111111111111',
    employeNom: 'Dupont Alice',
    type: 'heures',
    chantierId: '22222222-2222-4222-8222-222222222222',
    chantierLibelle: 'CH-2026-001 · Villa',
    chantierTacheId: null,
    motifAbsence: null,
    zoneDeplacement: 'Z2',
    quantite: '7,5',
    datePointage: '2026-06-10',
    panier: true,
    grandPanier: false,
    nuitPanierSoir: false,
    notes: null,
    ...over,
  };
}

describe('buildOutboxEntry', () => {
  it('produit une entrée pending dont le payload passe le schéma serveur', () => {
    const r = buildOutboxEntry(formHeures(), UUID, NOW);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.entry.status).toBe('pending');
    expect(r.entry.attempts).toBe(0);
    expect(r.entry.clientUuid).toBe(UUID);
    expect(r.entry.payload.quantite).toBe('7.50');
    expect(r.entry.display.chantierLibelle).toBe('CH-2026-001 · Villa');
    // Le payload construit doit être directement accepté par le serveur.
    expect(pointageSyncSchema.safeParse(r.entry.payload).success).toBe(true);
  });

  it('annule chantier/zone/indemnités quand c’est une absence', () => {
    const r = buildOutboxEntry(
      formHeures({ type: 'absence', motifAbsence: 'maladie', panier: true }),
      UUID,
      NOW,
    );
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.entry.payload.chantierId).toBeNull();
    expect(r.entry.payload.chantierTacheId).toBeNull();
    expect(r.entry.payload.zoneDeplacement).toBeNull();
    expect(r.entry.payload.panier).toBe(false);
    expect(r.entry.payload.motifAbsence).toBe('maladie');
    expect(pointageSyncSchema.safeParse(r.entry.payload).success).toBe(true);
  });

  it('rejette les saisies évidemment invalides', () => {
    expect(buildOutboxEntry(formHeures({ employeId: '' }), UUID, NOW).ok).toBe(false);
    expect(buildOutboxEntry(formHeures({ quantite: '0' }), UUID, NOW).ok).toBe(false);
    expect(buildOutboxEntry(formHeures({ quantite: 'abc' }), UUID, NOW).ok).toBe(false);
    expect(buildOutboxEntry(formHeures({ chantierId: null }), UUID, NOW).ok).toBe(false);
    expect(
      buildOutboxEntry(formHeures({ type: 'absence', motifAbsence: null }), UUID, NOW).ok,
    ).toBe(false);
    expect(buildOutboxEntry(formHeures({ datePointage: '10/06/2026' }), UUID, NOW).ok).toBe(false);
  });
});
