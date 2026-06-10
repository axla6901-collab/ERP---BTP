/**
 * Type de colonne Drizzle « chiffré transparent ».
 *
 * Stocke un `bytea` en base mais expose une `string` côté application :
 *   - écriture (toDriver)   → chiffre via {@link encryptField}
 *   - lecture  (fromDriver) → déchiffre via {@link decryptField}
 *
 * Résultat : `select()` renvoie la valeur en clair, `insert/update` chiffre
 * automatiquement, SANS toucher aux call-sites (Server Actions, Factur-X,
 * formulaires). Les colonnes nulles ne passent pas par to/fromDriver (Drizzle
 * court-circuite) et restent NULL en base.
 *
 * ⚠️ Aucune requête SQL ne doit filtrer/agréger/trier sur une colonne chiffrée :
 * le chiffré est opaque (IV aléatoire → pas d'égalité, pas d'ordre). Périmètre
 * choisi en conséquence (cf. db/schema/employes.ts, entreprises.ts).
 */
import { customType } from 'drizzle-orm/pg-core';

import { decryptField, encryptField } from './encryption';

export const encryptedText = customType<{ data: string; driverData: Buffer }>({
  dataType() {
    return 'bytea';
  },
  toDriver(value: string): Buffer {
    return encryptField(value);
  },
  fromDriver(value: unknown): string {
    const buf = Buffer.isBuffer(value) ? value : Buffer.from(value as Uint8Array);
    return decryptField(buf);
  },
});
