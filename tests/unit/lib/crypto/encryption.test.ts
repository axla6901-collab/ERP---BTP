import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { randomBytes } from 'node:crypto';

import {
  __resetKeyringForTests,
  decryptField,
  encryptField,
  isEncryptionConfigured,
} from '@/lib/crypto/encryption';

const KEY_1 = randomBytes(32).toString('base64');
const KEY_2 = randomBytes(32).toString('base64');

/** Recharge le trousseau après chaque modification de process.env. */
function setKeys(keys: string, activeId: string): void {
  vi.stubEnv('DATA_ENCRYPTION_KEYS', keys);
  vi.stubEnv('DATA_ENCRYPTION_ACTIVE_KEY_ID', activeId);
  __resetKeyringForTests();
}

beforeEach(() => {
  setKeys(`1:${KEY_1}`, '1');
});

afterEach(() => {
  vi.unstubAllEnvs();
  __resetKeyringForTests();
});

describe('encryptField / decryptField', () => {
  it("round-trip : chiffre puis déchiffre à l'identique", () => {
    const clear = '2806990412345';
    const env = encryptField(clear);
    expect(Buffer.isBuffer(env)).toBe(true);
    expect(env.toString('utf8')).not.toContain(clear); // pas de clair résiduel
    expect(decryptField(env)).toBe(clear);
  });

  it('enveloppe = [version=1][keyId=activeId][iv][tag][ct]', () => {
    const env = encryptField('x');
    expect(env.readUInt8(0)).toBe(1); // version
    expect(env.readUInt8(1)).toBe(1); // keyId actif
    // 2 (header) + 12 (iv) + 16 (tag) + >=1 (ct) ⇒ au moins 31 octets
    expect(env.length).toBeGreaterThanOrEqual(31);
  });

  it('IV aléatoire : deux chiffrés diffèrent mais déchiffrent pareil', () => {
    const a = encryptField('FR7630006000011234567890189');
    const b = encryptField('FR7630006000011234567890189');
    expect(a.equals(b)).toBe(false);
    expect(decryptField(a)).toBe(decryptField(b));
  });

  it("préserve l'UTF-8 (accents, symboles)", () => {
    const v = 'Société Générale — €1 234,56';
    expect(decryptField(encryptField(v))).toBe(v);
  });

  it("lève si l'enveloppe est tronquée", () => {
    expect(() => decryptField(Buffer.from([1, 1, 2, 3]))).toThrow(/tronquée/);
  });

  it('lève si le chiffré est altéré (authentification GCM)', () => {
    const env = encryptField('intègre');
    const last = env.length - 1;
    env.writeUInt8(env.readUInt8(last) ^ 0xff, last); // flip du dernier octet de ciphertext
    expect(() => decryptField(env)).toThrow();
  });

  it("lève sur une version d'enveloppe inconnue", () => {
    const env = encryptField('x');
    env[0] = 2; // version inconnue
    expect(() => decryptField(env)).toThrow(/version inconnue/);
  });
});

describe('rotation de clés', () => {
  it('chiffre avec la clé active et déchiffre les anciennes versions', () => {
    const tokenV1 = encryptField('ancienne');
    expect(tokenV1.readUInt8(1)).toBe(1);

    // Introduit la clé 2 et la rend active.
    setKeys(`1:${KEY_1},2:${KEY_2}`, '2');
    const tokenV2 = encryptField('nouvelle');
    expect(tokenV2.readUInt8(1)).toBe(2);

    // Les deux restent lisibles tant que les deux clés sont présentes.
    expect(decryptField(tokenV1)).toBe('ancienne');
    expect(decryptField(tokenV2)).toBe('nouvelle');
  });

  it('lève si la clé ayant chiffré la donnée a été retirée', () => {
    const tokenV1 = encryptField('x');
    setKeys(`2:${KEY_2}`, '2'); // clé 1 retirée
    expect(() => decryptField(tokenV1)).toThrow(/clé #1 introuvable/);
  });
});

describe('isEncryptionConfigured', () => {
  it('true quand le trousseau est valide', () => {
    expect(isEncryptionConfigured()).toBe(true);
  });

  it('false quand DATA_ENCRYPTION_KEYS est absent', () => {
    vi.stubEnv('DATA_ENCRYPTION_KEYS', '');
    __resetKeyringForTests();
    expect(isEncryptionConfigured()).toBe(false);
  });

  it("false quand une clé n'a pas la bonne taille", () => {
    setKeys(`1:${randomBytes(16).toString('base64')}`, '1');
    expect(isEncryptionConfigured()).toBe(false);
  });

  it("false quand l'id actif ne correspond à aucune clé", () => {
    setKeys(`1:${KEY_1}`, '9');
    expect(isEncryptionConfigured()).toBe(false);
  });
});
