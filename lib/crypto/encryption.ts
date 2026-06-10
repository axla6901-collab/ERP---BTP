/**
 * Chiffrement applicatif des champs sensibles (audit sécurité B1 — RGPD).
 *
 * AES-256-GCM (chiffrement authentifié) appliqué côté application, AVANT
 * écriture en base. Le dump SQL brut ne contient donc plus de n° de sécu,
 * IBAN/BIC ni salaire en clair.
 *
 * ── Modèle de clés (KMS auto-hébergé, sans dépendance SaaS tierce) ──────────
 * Les clés vivent dans l'environnement (même modèle de confiance que
 * BETTER_AUTH_SECRET / DATABASE_URL), jamais en base ni dans le code :
 *   - DATA_ENCRYPTION_KEYS          = liste « <id>:<base64-32-octets> » séparée
 *                                     par des virgules (plusieurs clés = rotation).
 *   - DATA_ENCRYPTION_ACTIVE_KEY_ID = id de la clé utilisée pour les NOUVEAUX
 *                                     chiffrements.
 * L'id de clé est embarqué dans l'enveloppe → on peut introduire une nouvelle
 * clé active tout en déchiffrant l'ancien corpus, puis ré-chiffrer en tâche de
 * fond. Générer une clé : `node scripts/generate-encryption-key.mjs`.
 *
 * ── Format d'enveloppe (bytea stocké) ───────────────────────────────────────
 *   [version:1][keyId:1][iv:12][authTag:16][ciphertext:N]
 * Le tag GCM garantit l'intégrité : toute altération du chiffré (ou de l'AAD)
 * fait échouer le déchiffrement plutôt que de renvoyer des octets corrompus.
 */
import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

const ALGO = 'aes-256-gcm';
const VERSION = 1;
const KEY_BYTES = 32; // AES-256
const IV_BYTES = 12; // nonce recommandé pour GCM
const TAG_BYTES = 16; // tag d'authentification GCM
const HEADER_BYTES = 2; // version + keyId
const MIN_PAYLOAD = HEADER_BYTES + IV_BYTES + TAG_BYTES;

/**
 * Donnée additionnelle authentifiée (AAD) : un contexte applicatif fixe et
 * versionné. Authentifié (pas chiffré) par GCM ; lie le chiffré à ce domaine
 * applicatif. Volontairement NON lié à (table, colonne) pour ne pas rendre les
 * données indéchiffrables après un simple renommage de colonne.
 */
const AAD = Buffer.from('erp-btp/field-v1', 'utf8');

type Keyring = {
  readonly activeId: number;
  readonly active: Buffer;
  readonly byId: ReadonlyMap<number, Buffer>;
};

let cachedKeyring: Keyring | null = null;

function parseKeyring(): Keyring {
  const raw = process.env.DATA_ENCRYPTION_KEYS;
  if (!raw || raw.trim().length === 0) {
    throw new Error(
      'DATA_ENCRYPTION_KEYS est requis pour le chiffrement des champs sensibles. ' +
        'Format : « <id>:<clé base64 de 32 octets> » (séparés par des virgules). ' +
        'Générer une clé : node scripts/generate-encryption-key.mjs',
    );
  }

  const byId = new Map<number, Buffer>();
  for (const entry of raw.split(',')) {
    const trimmed = entry.trim();
    if (trimmed.length === 0) continue;
    const sep = trimmed.indexOf(':');
    if (sep < 0) {
      throw new Error('DATA_ENCRYPTION_KEYS invalide : chaque entrée doit être « <id>:<base64> ».');
    }
    const id = Number(trimmed.slice(0, sep));
    if (!Number.isInteger(id) || id < 0 || id > 255) {
      throw new Error(`DATA_ENCRYPTION_KEYS : id de clé invalide « ${trimmed.slice(0, sep)} » (entier 0-255 attendu).`);
    }
    if (byId.has(id)) {
      throw new Error(`DATA_ENCRYPTION_KEYS : id de clé ${id} dupliqué.`);
    }
    const key = Buffer.from(trimmed.slice(sep + 1), 'base64');
    if (key.length !== KEY_BYTES) {
      throw new Error(`DATA_ENCRYPTION_KEYS : la clé #${id} fait ${key.length} octets (32 attendus pour AES-256).`);
    }
    byId.set(id, key);
  }

  if (byId.size === 0) {
    throw new Error('DATA_ENCRYPTION_KEYS ne contient aucune clé valide.');
  }

  const activeRaw = process.env.DATA_ENCRYPTION_ACTIVE_KEY_ID;
  const activeId = Number(activeRaw);
  if (activeRaw === undefined || activeRaw.trim() === '' || !Number.isInteger(activeId)) {
    throw new Error('DATA_ENCRYPTION_ACTIVE_KEY_ID est requis (id entier de la clé active).');
  }
  const active = byId.get(activeId);
  if (!active) {
    throw new Error(`DATA_ENCRYPTION_ACTIVE_KEY_ID = ${activeId} ne correspond à aucune clé de DATA_ENCRYPTION_KEYS.`);
  }

  return { activeId, active, byId };
}

function keyring(): Keyring {
  if (!cachedKeyring) {
    cachedKeyring = parseKeyring();
  }
  return cachedKeyring;
}

/**
 * Chiffre une chaîne en clair et renvoie l'enveloppe bytea prête à stocker.
 * Deux appels sur la même valeur produisent des chiffrés différents (IV aléatoire).
 */
export function encryptField(plaintext: string): Buffer {
  const { activeId, active } = keyring();
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv(ALGO, active, iv);
  cipher.setAAD(AAD);
  const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([Buffer.from([VERSION, activeId]), iv, tag, ciphertext]);
}

/**
 * Déchiffre une enveloppe produite par {@link encryptField}.
 * @throws si l'enveloppe est tronquée, d'une version inconnue, chiffrée avec
 *         une clé absente, ou altérée (échec d'authentification GCM).
 */
export function decryptField(payload: Buffer): string {
  if (payload.length < MIN_PAYLOAD) {
    throw new Error('Champ chiffré invalide : enveloppe tronquée.');
  }
  const version = payload.readUInt8(0);
  if (version !== VERSION) {
    throw new Error(`Champ chiffré invalide : version inconnue ${version}.`);
  }
  const keyId = payload.readUInt8(1);
  const key = keyring().byId.get(keyId);
  if (!key) {
    throw new Error(`Champ chiffré : clé #${keyId} introuvable (rotation incomplète ?).`);
  }
  const iv = payload.subarray(HEADER_BYTES, HEADER_BYTES + IV_BYTES);
  const tag = payload.subarray(HEADER_BYTES + IV_BYTES, HEADER_BYTES + IV_BYTES + TAG_BYTES);
  const ciphertext = payload.subarray(HEADER_BYTES + IV_BYTES + TAG_BYTES);
  const decipher = createDecipheriv(ALGO, key, iv);
  decipher.setAAD(AAD);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8');
}

/** Indique si le chiffrement est configuré (sans le déclencher). Utilisé par le boot/diagnostic. */
export function isEncryptionConfigured(): boolean {
  try {
    keyring();
    return true;
  } catch {
    return false;
  }
}

/**
 * Réinitialise le cache du keyring. RÉSERVÉ AUX TESTS : permet de recharger
 * DATA_ENCRYPTION_KEYS après l'avoir modifié dans process.env.
 */
export function __resetKeyringForTests(): void {
  cachedKeyring = null;
}
