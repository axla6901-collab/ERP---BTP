#!/usr/bin/env node
/**
 * Génère une clé AES-256 (32 octets) encodée base64 pour DATA_ENCRYPTION_KEYS.
 *
 * Usage :
 *   node scripts/generate-encryption-key.mjs            # clé d'id 1
 *   node scripts/generate-encryption-key.mjs <id>       # clé d'un id donné (rotation)
 *
 * La sortie est prête à coller dans .env.local. NE JAMAIS committer la clé.
 * Pour une rotation : générer une clé avec un nouvel id, l'AJOUTER à
 * DATA_ENCRYPTION_KEYS (sans retirer l'ancienne), puis pointer
 * DATA_ENCRYPTION_ACTIVE_KEY_ID sur le nouvel id.
 */
import { randomBytes } from 'node:crypto';

const id = process.argv[2] ?? '1';
if (!/^\d{1,3}$/.test(id) || Number(id) < 0 || Number(id) > 255) {
  console.error(`id de clé invalide : « ${id} » (entier 0-255 attendu).`);
  process.exit(1);
}

const key = randomBytes(32).toString('base64');

console.log(`# Clé de chiffrement applicatif (AES-256) — id ${id}`);
console.log(`# Ajouter à DATA_ENCRYPTION_KEYS (séparer plusieurs clés par des virgules).`);
console.log('');
console.log(`DATA_ENCRYPTION_KEYS=${id}:${key}`);
console.log(`DATA_ENCRYPTION_ACTIVE_KEY_ID=${id}`);
