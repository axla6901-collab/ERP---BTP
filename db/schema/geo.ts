import {
  index,
  numeric,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';

/**
 * Référentiel géographique — base officielle des codes postaux ↔ communes.
 *
 * Table GLOBALE (sans `entreprise_id`), partagée par tous les tenants, comme
 * `unites`. Pas de RLS tenant (cf. migration 0074). Données issues de la base
 * La Poste (data.gouv.fr) enrichies des centroïdes de communes
 * (geo.api.gouv.fr). Sert à l'autocomplétion code postal ↔ ville dans tous les
 * écrans d'adresse.
 *
 * Les index `*_pattern_ops` (recherche par préfixe LIKE) et l'index unique à
 * expression `coalesce(ligne_5, '')` vivent dans la migration SQL ; ils sont
 * déclarés ici de façon simplifiée pour l'introspection MCD et les types.
 */
export const codesPostaux = pgTable(
  'codes_postaux',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    /** Code postal à 5 chiffres (ex : 69001). */
    codePostal: varchar('code_postal', { length: 5 }).notNull(),
    /** Code commune INSEE (ex : 69381, 2A004 en Corse). */
    codeCommuneInsee: varchar('code_commune_insee', { length: 5 }).notNull(),
    /** Nom de la commune (forme La Poste : majuscules sans accents). */
    commune: text('commune').notNull(),
    /** Ligne « ville » à imprimer sur le pli (libellé d'acheminement). */
    libelleAcheminement: text('libelle_acheminement').notNull(),
    /** Lieu-dit / commune déléguée (Ligne 5 La Poste), souvent absent. */
    ligne5: text('ligne_5'),
    /** Département dérivé du code INSEE (2 car., 2A/2B Corse, 971+ DOM). */
    departement: varchar('departement', { length: 3 }).notNull(),
    /** Centroïde de la commune (nullable). */
    latitude: numeric('latitude', { precision: 9, scale: 6 }),
    longitude: numeric('longitude', { precision: 9, scale: 6 }),
    /** Nom normalisé (MAJUSCULES sans accent) pour la recherche par préfixe. */
    recherche: text('recherche').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('idx_codes_postaux_cp').on(t.codePostal),
    index('idx_codes_postaux_recherche').on(t.recherche),
    index('idx_codes_postaux_insee').on(t.codeCommuneInsee),
    uniqueIndex('uq_codes_postaux').on(
      t.codePostal,
      t.codeCommuneInsee,
      sql`coalesce(ligne_5, '')`,
    ),
  ],
);

export type CodePostal = typeof codesPostaux.$inferSelect;
export type NouveauCodePostal = typeof codesPostaux.$inferInsert;
