/**
 * Introspection du schéma Drizzle pour produire le JSON exposé au composant
 * client du MCD. On parcourt chaque module (`db/schema/<module>.ts`), on
 * identifie les `PgTable`, puis on extrait colonnes + clés primaires + FK.
 */

import { is } from 'drizzle-orm';
import { type PgColumn, PgTable, getTableConfig } from 'drizzle-orm/pg-core';

import * as audit from '@/db/schema/audit';
import * as auth from '@/db/schema/auth';
import * as catalogue from '@/db/schema/catalogue';
import * as chantiers from '@/db/schema/chantiers';
import * as compteProrata from '@/db/schema/compte-prorata';
import * as commercial from '@/db/schema/commercial';
import * as employes from '@/db/schema/employes';
import * as entreprises from '@/db/schema/entreprises';
import * as facturation from '@/db/schema/facturation';
import * as numerotation from '@/db/schema/numerotation';
import * as pointages from '@/db/schema/pointages';
import * as rbac from '@/db/schema/rbac';
import * as referentielTiers from '@/db/schema/referentiel-tiers';
import * as societes from '@/db/schema/societes';
import * as sousTraitance from '@/db/schema/sous-traitance';
import * as tiers from '@/db/schema/tiers';
import * as tiersRegistre from '@/db/schema/tiers-registre';
import * as utilisateurs from '@/db/schema/utilisateurs';

import {
  MCD_MODULES,
  MCD_MODULE_ORDER,
  TABLE_MODULE_OVERRIDES,
  type McdModule,
  type McdModuleId,
} from './mcd-modules';

export type McdColumn = {
  name: string;
  sqlType: string;
  notNull: boolean;
  primary: boolean;
  unique: boolean;
  indexed: boolean;
  hasDefault: boolean;
  fk: {
    table: string;
    column: string;
    onDelete?: string;
    onUpdate?: string;
  } | null;
};

export type McdTable = {
  name: string;
  moduleId: McdModuleId;
  columns: McdColumn[];
  /** Nombre de colonnes qui sont PK (utile pour signaler les tables d'association). */
  pkCount: number;
  /** True si la table est une pure association (toutes les colonnes sont des FK PK). */
  isJunction: boolean;
};

export type McdRelation = {
  /** Identifiant stable de l'arête. */
  id: string;
  source: string;
  sourceColumn: string;
  target: string;
  targetColumn: string;
  onDelete?: string;
  /** Cardinalité côté source. 1:1 si la colonne source est unique, sinon N:1. */
  cardinality: '1:1' | 'N:1';
};

export type McdSchema = {
  modules: McdModule[];
  tables: McdTable[];
  relations: McdRelation[];
  generatedAt: string;
};

// Modules « virtuels » (Planning, …) absents de ce mapping : ils n'ont pas de
// fichier `db/schema/` propre et récupèrent leurs tables via
// `TABLE_MODULE_OVERRIDES`. D'où le `Partial`.
const SCHEMAS_PAR_MODULE: Partial<Record<McdModuleId, Record<string, unknown>>> = {
  auth,
  rbac,
  utilisateurs,
  entreprises,
  audit,
  numerotation,
  catalogue,
  commercial,
  chantiers,
  'compte-prorata': compteProrata,
  employes,
  pointages,
  // Module Tiers : ancien modèle (tiers.ts) + registre/agrément (0028-0033).
  // On fusionne les namespaces : toutes ces tables sont rattachées au module `tiers`.
  tiers: { ...tiers, ...societes, ...referentielTiers, ...tiersRegistre },
  facturation,
  'sous-traitance': sousTraitance,
};

function getColumnSqlType(col: PgColumn): string {
  try {
    return col.getSQLType();
  } catch {
    return col.columnType;
  }
}

export function introspectMcd(): McdSchema {
  const tableToModule = new Map<string, McdModuleId>();
  const tables: McdTable[] = [];
  const relations: McdRelation[] = [];

  // 1. Parcours module par module pour rattacher chaque table à son module
  // et collecter colonnes + PK.
  for (const moduleId of MCD_MODULE_ORDER) {
    const exports = SCHEMAS_PAR_MODULE[moduleId];
    // Module virtuel (pas de fichier `db/schema/`) : ses tables sont récupérées
    // depuis d'autres fichiers via TABLE_MODULE_OVERRIDES, traité plus bas.
    if (!exports) continue;
    for (const value of Object.values(exports)) {
      if (!is(value, PgTable)) continue;
      const config = getTableConfig(value);

      // Une table peut être ré-exportée par plusieurs modules (cas rare) — on
      // garde le premier module dans MCD_MODULE_ORDER qui la mentionne.
      // `tableToModule` reste le module *fichier* (sert à la dédup et à la passe
      // FK) ; l'override n'agit que sur le module *effectif* affiché.
      if (tableToModule.has(config.name)) continue;
      tableToModule.set(config.name, moduleId);
      const moduleEffectif = TABLE_MODULE_OVERRIDES[config.name] ?? moduleId;

      // Colonnes participant à une PK composite (pgTable(..., (t) => [...])
      // via primaryKey()) : on les marque `primary = true` en plus des PK
      // colonnes simples (.primaryKey()).
      const compositePkColumns = new Set<string>();
      for (const pk of config.primaryKeys) {
        for (const c of pk.columns) compositePkColumns.add(c.name);
      }

      // Colonnes apparaissant dans au moins un index
      const indexedColumns = new Set<string>();
      for (const idx of config.indexes) {
        for (const c of idx.config.columns) {
          // Drizzle expose la colonne via .name ou via un objet GetColumnConfig.
          const nm =
            typeof (c as { name?: string }).name === 'string' ? (c as { name: string }).name : null;
          if (nm) indexedColumns.add(nm);
        }
      }

      const columns: McdColumn[] = config.columns.map((col) => {
        const isPrimary = col.primary || compositePkColumns.has(col.name);
        return {
          name: col.name,
          sqlType: getColumnSqlType(col),
          notNull: col.notNull,
          primary: isPrimary,
          unique: !isPrimary && col.isUnique,
          indexed: indexedColumns.has(col.name),
          hasDefault: col.hasDefault,
          fk: null,
        };
      });

      const pkCount = columns.filter((c) => c.primary).length;

      tables.push({
        name: config.name,
        moduleId: moduleEffectif,
        columns,
        pkCount,
        isJunction: false,
      });
    }
  }

  // 2. Deuxième passe pour les FK (on a besoin des tables résolues).
  const columnByTable = new Map<string, Map<string, McdColumn>>();
  for (const t of tables) {
    const m = new Map<string, McdColumn>();
    for (const c of t.columns) m.set(c.name, c);
    columnByTable.set(t.name, m);
  }

  for (const moduleId of MCD_MODULE_ORDER) {
    const exports = SCHEMAS_PAR_MODULE[moduleId];
    if (!exports) continue;
    for (const value of Object.values(exports)) {
      if (!is(value, PgTable)) continue;
      const config = getTableConfig(value);
      if (tableToModule.get(config.name) !== moduleId) continue;

      for (const fk of config.foreignKeys) {
        const ref = fk.reference();
        const targetConfig = getTableConfig(ref.foreignTable);
        const onDelete = fk.onDelete;
        const onUpdate = fk.onUpdate;

        // Drizzle gère les FK multi-colonnes ; pour le MCD on émet une arête
        // par paire (source, target). En pratique, toutes nos FK sont
        // mono-colonne pour l'instant.
        const len = Math.min(ref.columns.length, ref.foreignColumns.length);
        for (let i = 0; i < len; i++) {
          const sourceCol = ref.columns[i]!;
          const targetCol = ref.foreignColumns[i]!;

          // Renseigne la FK sur la colonne source.
          const srcColEntry = columnByTable.get(config.name)?.get(sourceCol.name);
          if (srcColEntry) {
            const fkInfo: McdColumn['fk'] = {
              table: targetConfig.name,
              column: targetCol.name,
            };
            if (onDelete) fkInfo!.onDelete = onDelete;
            if (onUpdate) fkInfo!.onUpdate = onUpdate;
            srcColEntry.fk = fkInfo;
          }

          const relation: McdRelation = {
            id: `${config.name}.${sourceCol.name}->${targetConfig.name}.${targetCol.name}`,
            source: config.name,
            sourceColumn: sourceCol.name,
            target: targetConfig.name,
            targetColumn: targetCol.name,
            cardinality: sourceCol.isUnique ? '1:1' : 'N:1',
          };
          if (onDelete) relation.onDelete = onDelete;
          relations.push(relation);
        }
      }
    }
  }

  // 3. Détection des tables de jonction : toutes les colonnes sont primary et FK.
  for (const t of tables) {
    if (t.pkCount < 2) continue;
    const allPkAreFk = t.columns.filter((c) => c.primary).every((c) => c.fk !== null);
    if (allPkAreFk) t.isJunction = true;
  }

  // Tri stable des tables par module puis par nom pour un layout reproductible.
  tables.sort((a, b) => {
    const ma = MCD_MODULE_ORDER.indexOf(a.moduleId);
    const mb = MCD_MODULE_ORDER.indexOf(b.moduleId);
    if (ma !== mb) return ma - mb;
    return a.name.localeCompare(b.name);
  });

  relations.sort((a, b) => a.id.localeCompare(b.id));

  const modulesUtilises = new Set(tables.map((t) => t.moduleId));
  const modules = MCD_MODULE_ORDER.filter((id) => modulesUtilises.has(id)).map(
    (id) => MCD_MODULES[id],
  );

  return {
    modules,
    tables,
    relations,
    generatedAt: new Date().toISOString(),
  };
}
