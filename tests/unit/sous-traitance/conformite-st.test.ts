import { beforeEach, describe, expect, it, vi } from 'vitest';

// Neutralise le garde 'server-only' (import au sommet de conformite-st) en test.
vi.mock('server-only', () => ({}));

// Mock du moteur Référencement : on contrôle la conformité renvoyée par lireTier.
const lireTier = vi.fn();
vi.mock('@/lib/referencement/registre', () => ({ lireTier: (...a: unknown[]) => lireTier(...a) }));

import { verifierConformiteSousTraitant } from '@/lib/sous-traitance/conformite-st';

const TODAY = '2026-06-10';

beforeEach(() => lireTier.mockReset());

describe('verifierConformiteSousTraitant — repli léger (sans Référencement)', () => {
  const base = { tierId: null } as const;

  it('OK si décennale valide et URSSAF récente', async () => {
    const v = await verifierConformiteSousTraitant(
      { ...base, assuranceDecennaleDateFin: '2027-12-31', dateAttestationUrssaf: '2026-05-01' },
      { referencementActif: false, aujourdhui: TODAY },
    );
    expect(v).toEqual({ ok: true, raison: null, source: 'leger' });
    expect(lireTier).not.toHaveBeenCalled();
  });

  it('bloque si décennale expirée', async () => {
    const v = await verifierConformiteSousTraitant(
      { ...base, assuranceDecennaleDateFin: '2025-01-01', dateAttestationUrssaf: '2026-05-01' },
      { referencementActif: false, aujourdhui: TODAY },
    );
    expect(v.ok).toBe(false);
    expect(v.raison).toMatch(/décennale expirée/);
  });

  it('bloque si décennale manquante et URSSAF de plus de 6 mois', async () => {
    const v = await verifierConformiteSousTraitant(
      { ...base, assuranceDecennaleDateFin: null, dateAttestationUrssaf: '2025-01-01' },
      { referencementActif: false, aujourdhui: TODAY },
    );
    expect(v.ok).toBe(false);
    expect(v.raison).toMatch(/décennale manquante/);
    expect(v.raison).toMatch(/URSSAF de plus de 6 mois/);
  });
});

describe('verifierConformiteSousTraitant — via Référencement', () => {
  const st = {
    tierId: 'tier-1',
    assuranceDecennaleDateFin: '2020-01-01', // périmée : on vérifie qu'on N'utilise PAS le repli
    dateAttestationUrssaf: null,
  };

  it('bloque si un document bloquant n’est pas à jour', async () => {
    lireTier.mockResolvedValue({
      conformite: {
        classe: 'a_relancer',
        nbProblemes: 1,
        lignes: [
          { libelle: 'Attestation URSSAF', estBloquant: true, statut: 'expire' },
          { libelle: 'Qualibat', estBloquant: false, statut: 'manquant' },
        ],
      },
    });
    const v = await verifierConformiteSousTraitant(st, {
      referencementActif: true,
      aujourdhui: TODAY,
    });
    expect(v.ok).toBe(false);
    expect(v.source).toBe('referencement');
    expect(v.raison).toMatch(/Attestation URSSAF/);
    expect(v.raison).not.toMatch(/Qualibat/); // non bloquant → ignoré
  });

  it('OK si tous les documents bloquants sont à jour', async () => {
    lireTier.mockResolvedValue({
      conformite: {
        classe: 'a_jour',
        nbProblemes: 0,
        lignes: [{ libelle: 'Attestation URSSAF', estBloquant: true, statut: 'a_jour' }],
      },
    });
    const v = await verifierConformiteSousTraitant(st, {
      referencementActif: true,
      aujourdhui: TODAY,
    });
    expect(v).toEqual({ ok: true, raison: null, source: 'referencement' });
  });

  it('retombe sur le repli léger si le tier est introuvable', async () => {
    lireTier.mockResolvedValue(null);
    const v = await verifierConformiteSousTraitant(
      { ...st, assuranceDecennaleDateFin: '2027-01-01', dateAttestationUrssaf: '2026-05-01' },
      { referencementActif: true, aujourdhui: TODAY },
    );
    expect(v.ok).toBe(true);
    expect(v.source).toBe('leger');
  });
});
