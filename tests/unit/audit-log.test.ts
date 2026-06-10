import { describe, expect, it, vi, beforeEach } from 'vitest';

// On stub la dépendance DB AVANT d'importer le module testé pour éviter
// que `lib/db/client.ts` ne valide DATABASE_URL au chargement. `vi.hoisted`
// permet de référencer les mocks dans la factory `vi.mock` (qui est elle-même
// hoistée par Vitest avant les imports).
const { dbInsertMock, adminInsertMock } = vi.hoisted(() => ({
  dbInsertMock: vi.fn(),
  adminInsertMock: vi.fn(),
}));

vi.mock('@/lib/db/client', () => ({
  db: { insert: dbInsertMock },
  getDbAdmin: () => ({ insert: adminInsertMock }),
}));

vi.mock('@/lib/auth/guards', () => ({
  getSession: vi.fn().mockResolvedValue(null),
}));

import { auditLogEvent, auditLogIn } from '@/lib/audit/log';

function makeValuesChain() {
  const values = vi.fn().mockResolvedValue(undefined);
  return { values, chain: { values } };
}

beforeEach(() => {
  dbInsertMock.mockReset();
  adminInsertMock.mockReset();
});

describe('auditLogIn', () => {
  it('passe entreprise_id via current_setting GUC (policy RLS p_tenant)', async () => {
    const { values, chain } = makeValuesChain();
    const tx = { insert: vi.fn().mockReturnValue(chain) } as never;

    await auditLogIn(tx as never, {
      action: 'insert',
      tableName: 'devis',
      rowId: 'row-1',
      after: { foo: 1 },
      utilisateurId: 'user-1',
    });

    expect(values).toHaveBeenCalledTimes(1);
    const inserted = values.mock.calls[0]![0];
    // entrepriseId doit être une expression SQL référant à la GUC.
    expect(JSON.stringify(inserted.entrepriseId)).toContain('app.current_entreprise_id');
    expect(inserted).toMatchObject({
      action: 'insert',
      tableName: 'devis',
      rowId: 'row-1',
      utilisateurId: 'user-1',
    });
  });

  it('utilise la transaction fournie et JAMAIS la pool admin', async () => {
    const { chain } = makeValuesChain();
    const tx = { insert: vi.fn().mockReturnValue(chain) };

    await auditLogIn(tx as never, {
      action: 'update',
      tableName: 'clients',
      rowId: 'c-1',
      utilisateurId: 'u-1',
    });

    expect(tx.insert).toHaveBeenCalledTimes(1);
    expect(adminInsertMock).not.toHaveBeenCalled();
    expect(dbInsertMock).not.toHaveBeenCalled();
  });

  it('honore utilisateurId=null (action sans session)', async () => {
    const { values, chain } = makeValuesChain();
    const tx = { insert: vi.fn().mockReturnValue(chain) } as never;

    await auditLogIn(tx as never, {
      action: 'delete',
      tableName: 'clients',
      rowId: 'c-2',
      utilisateurId: null,
    });

    expect(values.mock.calls[0]![0].utilisateurId).toBeNull();
  });
});

describe('auditLogEvent (super-admin)', () => {
  it('passe par la pool admin (BYPASSRLS) avec entreprise_id NULL', async () => {
    const { values, chain } = makeValuesChain();
    adminInsertMock.mockReturnValueOnce(chain);

    await auditLogEvent({
      action: 'insert',
      tableName: 'entreprises',
      rowId: 'e-1',
      after: { slug: 'acme' },
      utilisateurId: 'super-admin',
    });

    expect(adminInsertMock).toHaveBeenCalledTimes(1);
    expect(dbInsertMock).not.toHaveBeenCalled();
    expect(values.mock.calls[0]![0]).toMatchObject({
      entrepriseId: null,
      action: 'insert',
      tableName: 'entreprises',
      rowId: 'e-1',
      utilisateurId: 'super-admin',
    });
  });
});
