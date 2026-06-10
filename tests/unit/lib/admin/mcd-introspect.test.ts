import { is } from 'drizzle-orm';
import { PgTable, getTableConfig } from 'drizzle-orm/pg-core';
import { describe, expect, it } from 'vitest';

import * as schema from '@/db/schema';
import { introspectMcd } from '@/lib/admin/mcd-introspect';
import {
  MCD_MODULES,
  MCD_MODULE_ORDER,
  MODULE_INCONNU,
  TABLE_MODULE_OVERRIDES,
  moduleStyle,
} from '@/lib/admin/mcd-modules';

/**
 * Ces tests garantissent que le MCD se complète automatiquement quand un module
 * grandit : toute table du schéma Drizzle DOIT apparaître dans le MCD, rattachée
 * à un module connu. Ils échouent (avec le nom de la table fautive) dès qu'on
 * ajoute une table/un module sans mettre à jour la config MCD — c'est le
 * garde-fou contre l'oubli qui avait laissé le Planning invisible.
 */

/** Noms de toutes les tables Postgres déclarées dans `db/schema` (barrel). */
function nomsTablesSchema(): Set<string> {
  const noms = new Set<string>();
  for (const value of Object.values(schema)) {
    if (is(value, PgTable)) noms.add(getTableConfig(value).name);
  }
  return noms;
}

describe('introspectMcd — couverture du schéma', () => {
  const result = introspectMcd();
  const introspectees = new Set(result.tables.map((t) => t.name));

  it("n'oublie aucune table du schéma Drizzle", () => {
    const orphelines = [...nomsTablesSchema()].filter((n) => !introspectees.has(n));
    // Si ça casse : enregistrer le fichier dans SCHEMAS_PAR_MODULE
    // (mcd-introspect.ts) ou rattacher la table via TABLE_MODULE_OVERRIDES.
    expect(orphelines, `Tables absentes du MCD : ${orphelines.join(', ')}`).toEqual([]);
  });

  it('rattache chaque table à un module déclaré', () => {
    for (const t of result.tables) {
      expect(MCD_MODULES[t.moduleId], `module inconnu pour ${t.name}`).toBeDefined();
    }
  });

  it('ordonne les modules visibles selon MCD_MODULE_ORDER', () => {
    for (const m of result.modules) {
      expect(MCD_MODULE_ORDER).toContain(m.id);
    }
  });
});

describe('TABLE_MODULE_OVERRIDES — cohérence', () => {
  const tablesSchema = nomsTablesSchema();

  it('ne cible que des tables existantes', () => {
    for (const nomTable of Object.keys(TABLE_MODULE_OVERRIDES)) {
      expect(tablesSchema.has(nomTable), `override sur table inconnue : ${nomTable}`).toBe(true);
    }
  });

  it('ne cible que des modules déclarés', () => {
    for (const moduleId of Object.values(TABLE_MODULE_OVERRIDES)) {
      expect(
        moduleId && MCD_MODULES[moduleId],
        `module d'override inconnu : ${moduleId}`,
      ).toBeTruthy();
    }
  });
});

describe('moduleStyle — repli sur module inconnu', () => {
  it('retourne le style du module pour un id déclaré', () => {
    expect(moduleStyle('planning')).toBe(MCD_MODULES.planning);
    expect(moduleStyle('tiers')).toBe(MCD_MODULES.tiers);
  });

  it('retombe sur MODULE_INCONNU pour un id absent (désync bundle HMR)', () => {
    // Sans ce repli, un nœud référençant un module inconnu fait planter tout le
    // diagramme : « Cannot read properties of undefined (reading 'label') ».
    expect(moduleStyle('module_inexistant')).toBe(MODULE_INCONNU);
    expect(moduleStyle('')).toBe(MODULE_INCONNU);
  });
});

describe('Module Planning', () => {
  const result = introspectMcd();

  it('apparaît dans la légende', () => {
    expect(result.modules.map((m) => m.id)).toContain('planning');
  });

  it("rattache chantier_tache_equipe au module 'planning'", () => {
    const equipe = result.tables.find((t) => t.name === 'chantier_tache_equipe');
    expect(equipe?.moduleId).toBe('planning');
  });

  it("laisse chantier_taches dans le module 'chantiers'", () => {
    const taches = result.tables.find((t) => t.name === 'chantier_taches');
    expect(taches?.moduleId).toBe('chantiers');
  });
});
