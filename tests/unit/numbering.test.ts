import { describe, expect, it, vi } from 'vitest';

import { generateNumero, TYPES_NUMERO, type TypeNumero } from '@/lib/numbering/generate';

/**
 * Mock d'une transaction Drizzle tenant : on teste le wrapper, pas la fonction
 * Postgres (testée en intégration via 0004 + 0043).
 *
 * La signature de generateNumero est désormais `generateNumero(tx, type, entrepriseId)`
 * (refonte multi-tenant 0043_rls_policies.sql).
 */
const ENTREPRISE_ID = '00000000-0000-0000-0000-000000000001';

function makeTx() {
  return {
    execute: vi.fn(),
  } as unknown as Parameters<typeof generateNumero>[0];
}

describe('generateNumero', () => {
  it.each(TYPES_NUMERO)('appelle la fonction PG avec le bon type (%s)', async (type) => {
    const tx = makeTx();
    vi.mocked(tx.execute).mockResolvedValueOnce([{ numero: `STUB-2026-000001` }] as never);
    await generateNumero(tx, type, ENTREPRISE_ID);
    const callArgs = vi.mocked(tx.execute).mock.calls.at(-1)?.[0];
    expect(JSON.stringify(callArgs)).toContain(type);
  });

  it('retourne la valeur renvoyée par la DB', async () => {
    const tx = makeTx();
    vi.mocked(tx.execute).mockResolvedValueOnce([{ numero: 'D-2026-000042' }] as never);
    await expect(generateNumero(tx, 'devis' satisfies TypeNumero, ENTREPRISE_ID)).resolves.toBe(
      'D-2026-000042',
    );
  });

  it('lance une erreur si la DB renvoie un tableau vide', async () => {
    const tx = makeTx();
    vi.mocked(tx.execute).mockResolvedValueOnce([] as never);
    await expect(generateNumero(tx, 'facture', ENTREPRISE_ID)).rejects.toThrow(/valeur vide/);
  });

  it('passe entreprise_id en argument SQL', async () => {
    const tx = makeTx();
    vi.mocked(tx.execute).mockResolvedValueOnce([{ numero: 'D-2026-000001' }] as never);
    await generateNumero(tx, 'devis', ENTREPRISE_ID);
    const callArgs = vi.mocked(tx.execute).mock.calls.at(-1)?.[0];
    expect(JSON.stringify(callArgs)).toContain(ENTREPRISE_ID);
  });

  it('respecte les types attendus (compile-time check)', () => {
    // @ts-expect-error - 'inconnu' n'est pas un TypeNumero
    const _unused: TypeNumero = 'inconnu';
    expect(_unused).toBe('inconnu');
  });
});
