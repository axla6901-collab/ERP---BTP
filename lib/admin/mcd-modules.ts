/**
 * Définition des modules métier pour le MCD interactif.
 *
 * Chaque table du schéma Drizzle est rattachée à un module via le fichier source
 * (`db/schema/<module>.ts`). Les couleurs sont utilisées dans la légende, sur
 * les nœuds du diagramme et dans le filtre.
 *
 * Un module peut être « virtuel » : sans fichier `db/schema/` dédié, il récupère
 * ses tables depuis un autre fichier via `TABLE_MODULE_OVERRIDES` (cas du
 * Planning, dont les tables vivent dans `chantiers.ts`). L'introspection
 * (`mcd-introspect.ts`) découvre toujours les tables automatiquement ; ce
 * fichier ne fait que décider de leur regroupement visuel.
 *
 * AJOUT D'UN MODULE — checklist (cf. docs/MCD.md) :
 *   1. ajouter l'id à `McdModuleId`, à `MCD_MODULES` (label + couleurs) et à
 *      `MCD_MODULE_ORDER` ;
 *   2. si le module a son propre fichier `db/schema/<id>.ts`, l'enregistrer dans
 *      `SCHEMAS_PAR_MODULE` (mcd-introspect.ts) ; sinon, rattacher ses tables
 *      via `TABLE_MODULE_OVERRIDES`.
 *   Le test `tests/unit/lib/admin/mcd-introspect.test.ts` échoue tant que la
 *   config est incohérente (table orpheline, override vers une table absente…).
 */

export type McdModuleId =
  | 'auth'
  | 'rbac'
  | 'utilisateurs'
  | 'entreprises'
  | 'audit'
  | 'numerotation'
  | 'catalogue'
  | 'commercial'
  | 'chantiers'
  | 'compte-prorata'
  | 'planning'
  | 'employes'
  | 'pointages'
  | 'tiers'
  | 'facturation'
  | 'sous-traitance';

export type McdModule = {
  id: McdModuleId;
  label: string;
  /** Couleur de bordure / accents (HEX). */
  color: string;
  /** Couleur de fond pâle des nœuds (HEX). */
  bg: string;
};

export const MCD_MODULES: Record<McdModuleId, McdModule> = {
  auth: { id: 'auth', label: 'Authentification', color: '#475569', bg: '#f1f5f9' },
  rbac: { id: 'rbac', label: 'Rôles & permissions', color: '#dc2626', bg: '#fee2e2' },
  utilisateurs: { id: 'utilisateurs', label: 'Utilisateurs', color: '#dc2626', bg: '#fee2e2' },
  entreprises: {
    id: 'entreprises',
    label: 'Entreprises (tenant)',
    color: '#be123c',
    bg: '#ffe4e6',
  },
  audit: { id: 'audit', label: 'Audit', color: '#7c3aed', bg: '#ede9fe' },
  numerotation: { id: 'numerotation', label: 'Numérotation', color: '#0891b2', bg: '#cffafe' },
  catalogue: { id: 'catalogue', label: 'Catalogue', color: '#16a34a', bg: '#dcfce7' },
  commercial: { id: 'commercial', label: 'Commercial', color: '#2563eb', bg: '#dbeafe' },
  chantiers: { id: 'chantiers', label: 'Chantiers', color: '#ea580c', bg: '#ffedd5' },
  'compte-prorata': {
    id: 'compte-prorata',
    label: 'Compte prorata',
    color: '#65a30d',
    bg: '#ecfccb',
  },
  planning: { id: 'planning', label: 'Planning (Gantt)', color: '#4f46e5', bg: '#e0e7ff' },
  employes: { id: 'employes', label: 'RH — Employés', color: '#db2777', bg: '#fce7f3' },
  pointages: { id: 'pointages', label: 'Pointages', color: '#9333ea', bg: '#f3e8ff' },
  tiers: { id: 'tiers', label: 'Tiers', color: '#ca8a04', bg: '#fef3c7' },
  facturation: { id: 'facturation', label: 'Facturation', color: '#0d9488', bg: '#ccfbf1' },
  'sous-traitance': {
    id: 'sous-traitance',
    label: 'Sous-traitance',
    color: '#854d0e',
    bg: '#fef9c3',
  },
};

export const MCD_MODULE_ORDER: readonly McdModuleId[] = [
  'auth',
  'entreprises',
  'utilisateurs',
  'rbac',
  'audit',
  'numerotation',
  'tiers',
  'catalogue',
  'commercial',
  'chantiers',
  'compte-prorata',
  'planning',
  'employes',
  'pointages',
  'facturation',
  'sous-traitance',
];

/**
 * Rattachement explicite d'une table à un module, prioritaire sur son fichier
 * source. Indispensable pour les modules transverses dont les tables vivent
 * dans le fichier d'un autre domaine.
 *
 * Planning (migration 0053) : la table `chantier_taches` préexiste (migration
 * 0010) et reste rattachée au domaine Chantiers ; seule `chantier_tache_equipe`
 * — créée par le module — est colorée « Planning ».
 */
export const TABLE_MODULE_OVERRIDES: Partial<Record<string, McdModuleId>> = {
  chantier_tache_equipe: 'planning',
};

/**
 * Style de repli quand une table référence un module inconnu de `MCD_MODULES`.
 * L'invariant « tout `moduleId` ∈ `MCD_MODULES` » est garanti côté données par
 * `tests/unit/lib/admin/mcd-introspect.test.ts` ; ce repli ne protège donc que
 * contre une désynchronisation transitoire du bundle client (HMR), où le schéma
 * sérialisé par le serveur peut référencer un module absent du `MCD_MODULES`
 * encore en mémoire. Sans lui, un seul nœud orphelin fait planter tout le
 * diagramme (« Cannot read properties of undefined (reading 'label') »).
 */
export const MODULE_INCONNU = {
  id: '__inconnu__',
  label: 'Module inconnu',
  color: '#94A3B8',
  bg: '#F1F5F9',
} as const;

const MODULES_INDEX: Record<string, McdModule | undefined> = MCD_MODULES;

/** Retourne le style du module ; repli neutre si l'id n'est pas déclaré. */
export function moduleStyle(moduleId: string): Pick<McdModule, 'label' | 'color' | 'bg'> {
  return MODULES_INDEX[moduleId] ?? MODULE_INCONNU;
}
