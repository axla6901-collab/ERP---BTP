import {
  boolean,
  check,
  date,
  index,
  numeric,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';

import { chantierTaches, chantiers } from './chantiers';
import { employes, zoneDeplacement } from './employes';
import { entreprises } from './entreprises';
import { utilisateurs } from './utilisateurs';

// ─────────────────────────────────────────────────────────────
// Enums M5.2
// ─────────────────────────────────────────────────────────────

export const typePointage = pgEnum('type_pointage', [
  'heures',
  'absence',
  'kg_acier_ha',
  'kg_acier_ts',
  'm3_beton_b16',
  'm3_beton_b25',
  'budget_heures',
  'budget_kg_acier_ha',
  'budget_kg_acier_ts',
  'budget_m3_beton_b16',
  'budget_m3_beton_b25',
  'pct_avancement_heures',
  'pct_avancement_acier_ha',
  'pct_avancement_acier_ts',
  'pct_avancement_beton_b16',
  'pct_avancement_beton_b25',
]);

export const motifAbsence = pgEnum('motif_absence', [
  'conges_payes',
  'rtt',
  'maladie',
  'accident_travail',
  'formation',
  'jour_ferie',
  'autre',
  'vacances',
  'intemperie',
  'naissance',
  'mariage',
  'deces',
  'ecole',
  'spou',
  'jps',
  'entreprise',
]);

// ─────────────────────────────────────────────────────────────
// Table pointages
// ─────────────────────────────────────────────────────────────

export const pointages = pgTable(
  'pointages',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    entrepriseId: uuid('entreprise_id')
      .notNull()
      .references(() => entreprises.id, { onDelete: 'restrict' }),
    employeId: uuid('employe_id')
      .notNull()
      .references(() => employes.id, { onDelete: 'restrict' }),
    chantierId: uuid('chantier_id').references(() => chantiers.id, {
      onDelete: 'restrict',
    }),
    chantierTacheId: uuid('chantier_tache_id').references(() => chantierTaches.id, {
      onDelete: 'set null',
    }),
    datePointage: date('date_pointage').notNull(),
    type: typePointage('type').notNull().default('heures'),
    quantite: numeric('quantite', { precision: 7, scale: 2 }).notNull(),
    motifAbsence: motifAbsence('motif_absence'),
    zoneDeplacement: zoneDeplacement('zone_deplacement'),
    panier: boolean('panier').notNull().default(false),
    grandPanier: boolean('grand_panier').notNull().default(false),
    nuitPanierSoir: boolean('nuit_panier_soir').notNull().default(false),
    notes: text('notes'),
    // M5.5 (offline PWA) — idempotency key généré côté client (UUID v7) +
    // horodatage serveur de réception (l'horloge terrain pouvant être décalée).
    // NULL pour les pointages saisis avant M5.5 ou via la matrice mensuelle.
    clientUuid: uuid('client_uuid'),
    serverReceivedAt: timestamp('server_received_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    createdBy: text('created_by').references(() => utilisateurs.id, { onDelete: 'set null' }),
    updatedBy: text('updated_by').references(() => utilisateurs.id, { onDelete: 'set null' }),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
  },
  (t) => [
    index('idx_pointages_employe_date').on(t.employeId, t.datePointage.desc()),
    index('idx_pointages_chantier_date').on(t.chantierId, t.datePointage.desc()),
    index('idx_pointages_date').on(t.datePointage.desc()),
    // Idempotence de la sync offline (M5.5). Non partiel : NULL toléré pour les
    // lignes historiques, unicité imposée sur les client_uuid réels.
    uniqueIndex('uq_pointages_client_uuid').on(t.clientUuid),
    check(
      'chk_pointages_absence_coherence',
      sql`(type = 'absence' AND chantier_id IS NULL AND motif_absence IS NOT NULL)
        OR (type <> 'absence' AND chantier_id IS NOT NULL AND motif_absence IS NULL)`,
    ),
    check('chk_pointages_quantite_positive', sql`quantite > 0`),
  ],
);

export type Pointage = typeof pointages.$inferSelect;
export type NouveauPointage = typeof pointages.$inferInsert;
