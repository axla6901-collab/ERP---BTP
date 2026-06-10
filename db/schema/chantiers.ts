import {
  boolean,
  check,
  date,
  index,
  integer,
  numeric,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  type AnyPgColumn,
} from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';

import { entreprises } from './entreprises';
import { utilisateurs } from './utilisateurs';
import { clients } from './commercial';

// ─────────────────────────────────────────────────────────────
// Enum statut chantier (M4.1)
// ─────────────────────────────────────────────────────────────

export const statutChantier = pgEnum('statut_chantier', [
  'prospect',
  'en_cours',
  'suspendu',
  'termine',
  'annule',
]);

// ─────────────────────────────────────────────────────────────
// Table chantiers
// ─────────────────────────────────────────────────────────────

export const chantiers = pgTable(
  'chantiers',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    entrepriseId: uuid('entreprise_id')
      .notNull()
      .references(() => entreprises.id, { onDelete: 'restrict' }),
    numero: text('numero').notNull(),
    libelle: text('libelle').notNull(),
    clientId: uuid('client_id')
      .notNull()
      .references(() => clients.id, { onDelete: 'restrict' }),
    responsableId: text('responsable_id').references(() => utilisateurs.id, {
      onDelete: 'set null',
    }),
    statut: statutChantier('statut').notNull().default('prospect'),
    dateDebutPrevue: date('date_debut_prevue'),
    dateFinPrevue: date('date_fin_prevue'),
    dateDebutReelle: date('date_debut_reelle'),
    dateFinReelle: date('date_fin_reelle'),
    montantPrevisionnelHt: numeric('montant_previsionnel_ht', { precision: 14, scale: 2 }),
    adresseLigne1: text('adresse_ligne1'),
    adresseLigne2: text('adresse_ligne2'),
    codePostal: text('code_postal'),
    ville: text('ville'),
    description: text('description'),
    notes: text('notes'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    createdBy: text('created_by').references(() => utilisateurs.id, { onDelete: 'set null' }),
    updatedBy: text('updated_by').references(() => utilisateurs.id, { onDelete: 'set null' }),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
  },
  (t) => [
    index('idx_chantiers_client').on(t.clientId),
    index('idx_chantiers_statut').on(t.statut),
    index('idx_chantiers_responsable').on(t.responsableId),
    check(
      'chk_chantiers_dates_prevues',
      sql`date_fin_prevue IS NULL OR date_debut_prevue IS NULL OR date_fin_prevue >= date_debut_prevue`,
    ),
    check(
      'chk_chantiers_dates_reelles',
      sql`date_fin_reelle IS NULL OR date_debut_reelle IS NULL OR date_fin_reelle >= date_debut_reelle`,
    ),
    check(
      'chk_chantiers_code_postal',
      sql`code_postal IS NULL OR code_postal ~ '^[0-9]{5}$'`,
    ),
  ],
);

export type Chantier = typeof chantiers.$inferSelect;
export type NouveauChantier = typeof chantiers.$inferInsert;

// ─────────────────────────────────────────────────────────────
// Tâches du chantier (M4.2)
// ─────────────────────────────────────────────────────────────

export const statutTache = pgEnum('statut_tache', [
  'a_faire',
  'en_cours',
  'bloque',
  'termine',
  'annule',
]);

export const chantierTaches = pgTable(
  'chantier_taches',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    entrepriseId: uuid('entreprise_id')
      .notNull()
      .references(() => entreprises.id, { onDelete: 'restrict' }),
    chantierId: uuid('chantier_id')
      .notNull()
      .references(() => chantiers.id, { onDelete: 'cascade' }),
    ordre: integer('ordre').notNull().default(0),
    libelle: text('libelle').notNull(),
    description: text('description'),
    responsableId: text('responsable_id').references(() => utilisateurs.id, {
      onDelete: 'set null',
    }),
    statut: statutTache('statut').notNull().default('a_faire'),
    avancementPourcent: integer('avancement_pourcent').notNull().default(0),
    dateDebutPrevue: date('date_debut_prevue'),
    dateFinPrevue: date('date_fin_prevue'),
    dateDebutReelle: date('date_debut_reelle'),
    dateFinReelle: date('date_fin_reelle'),
    // ── Extensions Planning (cf. migration 0053) ──
    /** Étage/phase de regroupement Gantt (free-text : 'prep'/'ss'/'rdc'/'r1'/...). */
    niveau: text('niveau'),
    /** Corps de métier (free-text : 'gros_oeuvre'/'maconnerie'/'finitions'/...). */
    corpsMetier: text('corps_metier'),
    /** Heures planifiées totales (cumul des affectations équipe). */
    heuresPlanifiees: integer('heures_planifiees').notNull().default(0),
    /** Jalon (point sans durée) ; impose start = end côté DB. */
    estJalon: boolean('est_jalon').notNull().default(false),
    /** Prédécesseur (une seule dépendance par tâche, cf. champ `dep` de la maquette). */
    predecesseurId: uuid('predecesseur_id').references(
      (): AnyPgColumn => chantierTaches.id,
      { onDelete: 'set null' },
    ),
    notes: text('notes'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    createdBy: text('created_by').references(() => utilisateurs.id, { onDelete: 'set null' }),
    updatedBy: text('updated_by').references(() => utilisateurs.id, { onDelete: 'set null' }),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
  },
  (t) => [
    index('idx_chantier_taches_chantier').on(t.chantierId, t.ordre),
    index('idx_chantier_taches_responsable').on(t.responsableId),
    index('idx_chantier_taches_niveau').on(t.chantierId, t.niveau),
    index('idx_chantier_taches_metier').on(t.chantierId, t.corpsMetier),
    index('idx_chantier_taches_predecesseur').on(t.predecesseurId),
    check(
      'chk_chantier_taches_avancement',
      sql`avancement_pourcent >= 0 AND avancement_pourcent <= 100`,
    ),
    check(
      'chk_chantier_taches_dates_prevues',
      sql`date_fin_prevue IS NULL OR date_debut_prevue IS NULL OR date_fin_prevue >= date_debut_prevue`,
    ),
    check(
      'chk_chantier_taches_dates_reelles',
      sql`date_fin_reelle IS NULL OR date_debut_reelle IS NULL OR date_fin_reelle >= date_debut_reelle`,
    ),
    check('chk_chantier_taches_heures_pos', sql`heures_planifiees >= 0`),
    check(
      'chk_chantier_taches_pred_no_self',
      sql`predecesseur_id IS NULL OR predecesseur_id <> id`,
    ),
    check(
      'chk_chantier_taches_jalon_dates',
      sql`est_jalon = false OR date_debut_prevue IS NULL OR date_fin_prevue IS NULL OR date_debut_prevue = date_fin_prevue`,
    ),
  ],
);

export type ChantierTache = typeof chantierTaches.$inferSelect;
export type NouvelleChantierTache = typeof chantierTaches.$inferInsert;

// ─────────────────────────────────────────────────────────────
// Équipe affectée à une tâche (Planning, cf. migration 0053)
// ─────────────────────────────────────────────────────────────
//   Une ligne = un ouvrier affecté à une tâche, avec ses heures prévues
//   et saisies. Anti-doublon (tache_id, utilisateur_id) WHERE deleted_at
//   IS NULL géré par index unique côté DB.

export const chantierTacheEquipe = pgTable(
  'chantier_tache_equipe',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    entrepriseId: uuid('entreprise_id')
      .notNull()
      .references(() => entreprises.id, { onDelete: 'restrict' }),
    tacheId: uuid('tache_id')
      .notNull()
      .references(() => chantierTaches.id, { onDelete: 'cascade' }),
    utilisateurId: text('utilisateur_id')
      .notNull()
      .references(() => utilisateurs.id, { onDelete: 'restrict' }),
    heuresPrevues: integer('heures_prevues').notNull().default(0),
    heuresFaites: integer('heures_faites').notNull().default(0),
    ordre: integer('ordre').notNull().default(0),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    createdBy: text('created_by').references(() => utilisateurs.id, { onDelete: 'set null' }),
    updatedBy: text('updated_by').references(() => utilisateurs.id, { onDelete: 'set null' }),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
  },
  (t) => [
    uniqueIndex('uq_chantier_tache_equipe_actif')
      .on(t.tacheId, t.utilisateurId)
      .where(sql`deleted_at IS NULL`),
    index('idx_chantier_tache_equipe_tache').on(t.tacheId).where(sql`deleted_at IS NULL`),
    index('idx_chantier_tache_equipe_entreprise').on(t.entrepriseId),
    check(
      'chk_chantier_tache_equipe_heures_pos',
      sql`heures_prevues >= 0 AND heures_faites >= 0`,
    ),
  ],
);

export type ChantierTacheEquipe = typeof chantierTacheEquipe.$inferSelect;
export type NouvelleChantierTacheEquipe = typeof chantierTacheEquipe.$inferInsert;
