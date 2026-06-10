import { integer, pgTable, text, timestamp, unique, uniqueIndex, uuid } from 'drizzle-orm/pg-core';

import { entreprises } from './entreprises';
import { utilisateurs } from './utilisateurs';

/**
 * Registre append-only des numéros attribués (ADR-003).
 *
 * Sert de preuve d'attribution même si la transaction applicative qui a déclenché
 * `nextval` rollback ensuite — utile en cas de contrôle fiscal pour justifier une
 * séquence non strictement continue.
 *
 * Les séquences Postgres elles-mêmes (`seq_devis_<entreprise>_<periode>`, etc.)
 * sont créées dynamiquement par la fonction `generate_numero(type, entreprise_id)`
 * (cf. 0043_rls_policies.sql + 0046_numerotation_modeles.sql qui ajoute les
 * templates configurables et la cadence variable).
 */
export const numerosAttribues = pgTable(
  'numeros_attribues',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    entrepriseId: uuid('entreprise_id')
      .notNull()
      .references(() => entreprises.id, { onDelete: 'restrict' }),
    typeDoc: text('type_doc').notNull(),
    annee: integer('annee').notNull(),
    sequence: integer('sequence').notNull(),
    numeroComplet: text('numero_complet').notNull(),
    // Clé de la période sur laquelle la séquence est scopée :
    //   '2026'        → cadence annuelle (défaut historique)
    //   '2026-05'     → cadence mensuelle
    //   '2026-05-26'  → cadence quotidienne
    //   'tous'        → séquence unique (jamais reset)
    clePeriode: text('cle_periode').notNull(),
    attribueAt: timestamp('attribue_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    unique('uq_numeros_attribues_entreprise_type_periode_seq').on(
      t.entrepriseId,
      t.typeDoc,
      t.clePeriode,
      t.sequence,
    ),
  ],
);

export type NumeroAttribue = typeof numerosAttribues.$inferSelect;

/**
 * Templates de numérotation par entreprise + par type de document.
 * Une seule ligne par couple (entreprise, type) ; absence de ligne =
 * `generate_numero` retombe sur le format historique `<PRÉFIXE>-<ANNÉE>-NNNNNN`.
 *
 * Tokens reconnus dans `template` (cf. 0046_numerotation_modeles.sql + mirror
 * TS dans lib/numerotation/template.ts pour la prévisualisation UI) :
 *   [@Year]   → YYYY
 *   [@Year2]  → YY
 *   [@Month]  → MM
 *   [@Day]    → DD
 *   %0Nd      → compteur zero-padded sur N chiffres (1-9)
 *
 * `cadenceReset` (ajouté par 0048) = configuration explicite de la fréquence
 * de reset du compteur. Doit rester cohérente avec les tokens présents dans
 * le template (la cadence ne peut pas être plus fine que le token date le
 * plus fin), invariant porté par CHECK BD + validation TS.
 */
export const modelesNumerotation = pgTable(
  'modeles_numerotation',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    entrepriseId: uuid('entreprise_id')
      .notNull()
      .references(() => entreprises.id, { onDelete: 'cascade' }),
    typeDoc: text('type_doc').notNull(),
    template: text('template').notNull(),
    cadenceReset: text('cadence_reset').notNull().default('annee'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    updatedBy: text('updated_by').references(() => utilisateurs.id, { onDelete: 'set null' }),
  },
  (t) => [
    uniqueIndex('uq_modeles_numerotation_entreprise_type').on(t.entrepriseId, t.typeDoc),
  ],
);

export type ModeleNumerotation = typeof modelesNumerotation.$inferSelect;
