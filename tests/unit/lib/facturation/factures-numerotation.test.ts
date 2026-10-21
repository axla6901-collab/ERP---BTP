import { afterEach, describe, expect, it, vi } from 'vitest';

import { generateNumero } from '@/lib/numbering/generate';
import type { FactureInput } from '@/lib/validation/facturation';

/**
 * Numérotation légale des factures : attribuée à l'émission, jamais au
 * brouillon. Les server actions tournent ici sur une transaction simulée qui
 * enregistre les écritures (aucune base réelle).
 */

type Ligne = Record<string, unknown>;

/** Transaction factice : les `select` consomment `lectures` dans l'ordre. */
function fauxTx(lectures: Ligne[][]) {
  const mises: Ligne[] = [];
  const ajouts: unknown[] = [];
  const executes: unknown[] = [];
  const chaine = (resultat: Ligne[]) => {
    const p = Promise.resolve(resultat) as Promise<Ligne[]> & Record<string, unknown>;
    for (const m of ['from', 'where', 'limit', 'orderBy', 'leftJoin', 'innerJoin']) {
      p[m] = () => chaine(resultat);
    }
    return p;
  };
  const tx = {
    select: () => chaine(lectures.shift() ?? []),
    update: () => ({
      set: (v: Ligne) => {
        mises.push(v);
        return { where: () => Promise.resolve() };
      },
    }),
    insert: () => ({
      values: (v: unknown) => {
        ajouts.push(v);
        return Object.assign(Promise.resolve(), {
          returning: () => Promise.resolve([{ id: 'f-nouvelle' }]),
        });
      },
    }),
    delete: () => ({ where: () => Promise.resolve() }),
    execute: (q: unknown) => {
      executes.push(q);
      return Promise.resolve([]);
    },
  };
  return { tx, mises, ajouts, executes };
}

let transaction = fauxTx([]);

vi.mock('@/lib/auth/tenant-guards', () => ({
  requireTenantContextWithMfa: vi.fn(async () => ({
    entreprise: { id: 'ent-1', slug: 'acme' },
    utilisateur: { id: 'u-1', role: 'admin' },
  })),
}));
vi.mock('@/lib/db/with-tenant', () => ({
  withTenant: vi.fn((_id: string, fn: (tx: unknown) => unknown) => fn(transaction.tx)),
}));
vi.mock('@/lib/numbering/generate', () => ({
  generateNumero: vi.fn(async () => 'F-2026-000007'),
}));
vi.mock('@/lib/audit/log', () => ({ auditLogIn: vi.fn() }));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));

const { changerStatutFacture, creerFacture, supprimerFacture } =
  await import('@/lib/facturation/factures');

afterEach(() => vi.clearAllMocks());

const brouillon = (champs: Ligne = {}): Ligne => ({
  id: 'f1',
  statut: 'brouillon',
  numero: null,
  dateFacture: '2026-10-20',
  dateEmission: null,
  ...champs,
});

describe('creerFacture', () => {
  it('crée le brouillon sans consommer de numéro', async () => {
    transaction = fauxTx([]);
    const entree = {
      clientId: '11111111-1111-4111-8111-111111111111',
      dateFacture: '2026-10-20',
      lignes: [
        {
          type: 'libre',
          articleId: null,
          designation: 'Pose',
          quantite: '1',
          unite: 'u',
          prixUnitaireHt: '100',
          tauxTva: '20.00',
          remisePourcent: '0',
          notes: null,
        },
      ],
    } as unknown as FactureInput;

    const r = await creerFacture(entree);

    expect(r).toEqual({ ok: true, data: { id: 'f-nouvelle' } });
    expect(generateNumero).not.toHaveBeenCalled();
    expect(transaction.ajouts[0]).not.toHaveProperty('numero');
  });
});

describe('changerStatutFacture — émission', () => {
  it('attribue le numéro légal à l’émission d’un brouillon', async () => {
    transaction = fauxTx([[brouillon()], [{ date: '2026-10-15' }]]);

    const r = await changerStatutFacture('f1', 'emise');

    expect(r).toEqual({ ok: true, data: { numero: 'F-2026-000007' } });
    expect(generateNumero).toHaveBeenCalledTimes(1);
    expect(transaction.mises[0]).toMatchObject({ statut: 'emise', numero: 'F-2026-000007' });
    // Verrou de transaction pris avant l'attribution (émissions sérialisées).
    expect(transaction.executes.length).toBeGreaterThan(0);
  });

  it('refuse une émission antérieure à la dernière facture émise, sans consommer de numéro', async () => {
    transaction = fauxTx([[brouillon({ dateFacture: '2026-10-10' })], [{ date: '2026-10-15' }]]);

    const r = await changerStatutFacture('f1', 'emise');

    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/Émission impossible/);
    expect(generateNumero).not.toHaveBeenCalled();
    expect(transaction.mises).toHaveLength(0);
  });

  it('autorise la toute première émission (aucune facture émise)', async () => {
    transaction = fauxTx([[brouillon()], [{ date: null }]]);

    const r = await changerStatutFacture('f1', 'emise');

    expect(r).toEqual({ ok: true, data: { numero: 'F-2026-000007' } });
  });

  it('conserve le numéro d’un ancien brouillon déjà numéroté', async () => {
    transaction = fauxTx([[brouillon({ numero: 'F-2026-000002' })]]);

    const r = await changerStatutFacture('f1', 'emise');

    expect(r).toEqual({ ok: true, data: { numero: 'F-2026-000002' } });
    expect(generateNumero).not.toHaveBeenCalled();
  });

  it('n’attribue aucun numéro à l’annulation d’un brouillon', async () => {
    transaction = fauxTx([[brouillon()]]);

    const r = await changerStatutFacture('f1', 'annulee');

    expect(r).toEqual({ ok: true, data: { numero: null } });
    expect(generateNumero).not.toHaveBeenCalled();
    expect(transaction.mises[0]).not.toHaveProperty('numero');
  });
});

describe('supprimerFacture', () => {
  it('supprime un brouillon sans numéro (aucun trou possible)', async () => {
    transaction = fauxTx([[brouillon()], [{ n: 0 }]]);

    const r = await supprimerFacture('f1');

    expect(r).toEqual({ ok: true, data: undefined });
    expect(transaction.mises[0]).toHaveProperty('deletedAt');
  });

  it('refuse de supprimer un brouillon déjà numéroté (à annuler plutôt)', async () => {
    transaction = fauxTx([[brouillon({ numero: 'F-2026-000002' })]]);

    const r = await supprimerFacture('f1');

    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/Annulée/);
    expect(transaction.mises).toHaveLength(0);
  });
});
