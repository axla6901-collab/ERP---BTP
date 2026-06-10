/**
 * Importe en bulk le JSON du projet Pointage dans erp-btp.
 *
 * Usage :
 *   pnpm tsx scripts/import-pointage.ts <chemin/vers/pointage_data.json>
 *
 * Comportement :
 * - Lit le JSON (clés `pointage` + `bdd`)
 * - Crée un client par défaut "PTG-HIST" si absent (rattachement des chantiers)
 * - Parse chaque collaborateur ("NOM Prénom - Type - Société") → table `employes`
 * - Parse chaque chantier ("Ville - Client - Zone") → table `chantiers`
 *   (sauf "Absence" qui devient `chantier_id = NULL`)
 * - Insère les pointages en mappant `type_document` → enum + `motif_absence` → enum
 * - Idempotent : ne réinsère pas un employe/chantier déjà présent par libellé exact
 *   (clé canonique : raw string Pointage). Re-import écrase les doublons pointages
 *   via la clé unique partielle (employe, date, chantier, type).
 *
 * Pas de transactions globales (volume) : batchs INSERT de 500.
 */

import { readFileSync } from 'node:fs';

import { and, eq, isNull, sql } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/postgres-js';
import * as dotenv from 'dotenv';
import postgres from 'postgres';

dotenv.config({ path: '.env.local' });
dotenv.config({ path: '.env' });

// On utilise app_migrator pour avoir tous les droits (insert sans audit log côté seed).
const url = process.env.DATABASE_MIGRATOR_URL ?? process.env.DATABASE_URL;
if (!url) {
  console.error('DATABASE_MIGRATOR_URL ou DATABASE_URL requis dans .env.local');
  process.exit(1);
}

const client = postgres(url, { prepare: false, max: 5 });
const db = drizzle(client, { casing: 'snake_case' });

// Schémas Drizzle directement (pas de Server Actions, on est en CLI)
import { clients } from '@/db/schema/commercial';
import { chantiers } from '@/db/schema/chantiers';
import { employes } from '@/db/schema/employes';
import { entreprises } from '@/db/schema/entreprises';
import { pointages } from '@/db/schema/pointages';
import type {
  MotifAbsence,
  TypeContrat,
  TypePointage,
  ZoneDeplacement,
} from '@/lib/validation/rh';

type SourceBdd = {
  collaborateurs?: string | null;
  programmes?: string | null;
  taches?: string | null;
  motifs_absence?: string | null;
  type_document?: string | null;
};

type SourcePointage = {
  chantier: string | null;
  collaborateur: string | null;
  date: string | null;
  nbr_heures_kg: number | null;
  type_document: string | null;
  taches: string | null;
  interimaire_alternant: string | null;
  semaine: number | null;
  motif_absence: string | null;
  ville: string | null;
  trajet: string | null;
  panier: number | null;
  grand_panier: number | null;
  nuit_panier_soir: number | null;
  mois: string | null;
  nom_interim: string | null;
  annee: number | null;
};

type SourceData = {
  pointage: SourcePointage[];
  bdd: SourceBdd[];
};

// ─────────────────────────────────────────────────────────────
// Parsers
// ─────────────────────────────────────────────────────────────

function parseCollab(raw: string): {
  nom: string;
  prenom: string;
  typeContrat: TypeContrat;
  societe: string | null;
} {
  const parts = raw
    .split('-')
    .map((s) => s.trim())
    .filter(Boolean);

  let typeRaw = '';
  let societe = '';
  let identite = raw;

  if (parts.length >= 3) {
    identite = parts.slice(0, parts.length - 2).join(' - ');
    typeRaw = parts[parts.length - 2] ?? '';
    societe = parts[parts.length - 1] ?? '';
  } else if (parts.length === 2) {
    identite = parts[0] ?? '';
    typeRaw = parts[1] ?? '';
  }

  // Identité au format "NOM Prénom" → premier mot = nom (majuscule), reste = prénom
  const tokens = identite.split(/\s+/).filter(Boolean);
  const nom = tokens[0] ?? identite;
  const prenom = tokens.slice(1).join(' ') || '—';

  const typeContrat: TypeContrat = (() => {
    const upper = typeRaw.toUpperCase();
    if (upper === 'INT' || upper.includes('INTERIM')) return 'INT';
    if (upper === 'ALT' || upper.includes('ALTERN')) return 'ALT';
    if (upper === 'CDD') return 'CDD';
    if (upper === 'STAGE') return 'STAGE';
    return 'CDI';
  })();

  // CHECK SQL employes : type=INT exige societe_interim NOT NULL.
  // Pour les INT sans société renseignée dans Pointage, on met une valeur sentinel.
  const societeFinale =
    typeContrat === 'INT' ? societe || 'Non précisée' : societe || null;

  return {
    nom,
    prenom,
    typeContrat,
    societe: societeFinale,
  };
}

function parseChantier(raw: string): {
  libelle: string;
  ville: string | null;
  zone: ZoneDeplacement | null;
} {
  // Format "Ville - Client - Zone" ; certaines lignes ont uniquement 1 ou 2 parts.
  const parts = raw
    .split('-')
    .map((s) => s.trim())
    .filter(Boolean);
  if (parts.length >= 3) {
    const ville = parts[0]!;
    const zoneRaw = parts[parts.length - 1]!.toUpperCase();
    const zone = (['Z1', 'Z2', 'Z3', 'Z4', 'Z5', 'GD', 'GE'].includes(zoneRaw)
      ? zoneRaw
      : null) as ZoneDeplacement | null;
    return {
      libelle: parts.slice(0, parts.length - (zone ? 1 : 0)).join(' - '),
      ville,
      zone,
    };
  }
  if (parts.length === 2) {
    return { libelle: raw, ville: parts[0] ?? null, zone: null };
  }
  return { libelle: raw, ville: null, zone: null };
}

const MAP_TYPE_DOCUMENT: Record<string, TypePointage> = {
  '1 - Heures': 'heures',
  '1 - Budget Heures': 'budget_heures',
  "1 - % d'avancement": 'pct_avancement_heures',
  '2 - ACIER HA / kg': 'kg_acier_ha',
  '2 - Budget ACIER HA': 'budget_kg_acier_ha',
  "2 - % d'avancement": 'pct_avancement_acier_ha',
  '3 - ACIER TS / kg': 'kg_acier_ts',
  '3 - Budget ACIER TS': 'budget_kg_acier_ts',
  "3 - % d'avancement": 'pct_avancement_acier_ts',
  '4 - BETON B16 / m3': 'm3_beton_b16',
  '4 - Budget BETON B16 ': 'budget_m3_beton_b16',
  '4 - Budget BETON B16': 'budget_m3_beton_b16',
  "4 - % d'avancement": 'pct_avancement_beton_b16',
  '5 - BETON B25 / m3': 'm3_beton_b25',
  '5 - Budget BETON B25': 'budget_m3_beton_b25',
  "5 - % d'avancement": 'pct_avancement_beton_b25',
};

const MAP_MOTIF: Record<string, MotifAbsence> = {
  'Jour Férié': 'jour_ferie',
  Absence: 'autre',
  Vacances: 'vacances',
  Naissance: 'naissance',
  Maladie: 'maladie',
  Intempérie: 'intemperie',
  'Accident de travail': 'accident_travail',
  Mariage: 'mariage',
  SPOU: 'spou',
  Décès: 'deces',
  JPS: 'jps',
  'Motifs Absence': 'autre',
  Formation: 'formation',
  Ecole: 'ecole',
};

function mapType(raw: string | null): TypePointage | null {
  if (!raw) return null;
  const trimmed = raw.trim();
  return MAP_TYPE_DOCUMENT[trimmed] ?? MAP_TYPE_DOCUMENT[trimmed.replace(/\s+/g, ' ')] ?? null;
}

function mapMotif(raw: string | null): MotifAbsence | null {
  if (!raw) return null;
  return MAP_MOTIF[raw.trim()] ?? 'autre';
}

// ─────────────────────────────────────────────────────────────
// Import principal
// ─────────────────────────────────────────────────────────────

async function main() {
  const filePath = process.argv[2];
  if (!filePath) {
    console.error('Usage : pnpm tsx scripts/import-pointage.ts <pointage_data.json>');
    process.exit(1);
  }

  console.log(`[1/6] Lecture ${filePath}…`);
  const raw = readFileSync(filePath, 'utf8');
  const data = JSON.parse(raw) as SourceData;
  console.log(`  → ${data.pointage.length} pointages, ${data.bdd.length} entrées BDD`);

  // ─── 1.5 Résolution de l'entreprise cible (multi-tenant) ─────
  // L'import legacy alimente l'entreprise « default » par convention.
  // Permet une surcharge via ENV pour pointer vers une autre entreprise lors
  // d'imports ciblés (ex: IMPORT_ENTREPRISE_SLUG=acme pnpm tsx ...).
  const targetSlug = process.env.IMPORT_ENTREPRISE_SLUG ?? 'default';
  const [entreprise] = await db
    .select({ id: entreprises.id })
    .from(entreprises)
    .where(and(eq(entreprises.slug, targetSlug), isNull(entreprises.deletedAt)));
  if (!entreprise) {
    console.error(
      `Entreprise « ${targetSlug} » introuvable. Crée-la avant d'importer (slug actif requis).`,
    );
    process.exit(1);
  }
  const entrepriseId = entreprise.id;
  console.log(`  → cible : entreprise « ${targetSlug} » (${entrepriseId})`);

  // ─── 2. Client par défaut ─────────────────────────────────────
  console.log('[2/6] Client par défaut « PTG-HIST »…');
  const [existingClient] = await db
    .select()
    .from(clients)
    .where(and(eq(clients.code, 'PTG-HIST'), isNull(clients.deletedAt)));
  let clientId: string;
  if (existingClient) {
    clientId = existingClient.id;
    console.log(`  → existe déjà : ${clientId}`);
  } else {
    const [inserted] = await db
      .insert(clients)
      .values({
        entrepriseId,
        code: 'PTG-HIST',
        type: 'professionnel',
        raisonSociale: 'Historique Pointage',
        adresseLigne1: 'Adresse non renseignée',
        codePostal: '00000',
        ville: 'Non renseignée',
      })
      .returning({ id: clients.id });
    clientId = inserted!.id;
    console.log(`  → créé : ${clientId}`);
  }

  // ─── 3. Employés ──────────────────────────────────────────────
  const collabsRaw = new Set<string>();
  data.pointage.forEach((p) => p.collaborateur && collabsRaw.add(p.collaborateur));
  data.bdd.forEach((b) => b.collaborateurs && collabsRaw.add(b.collaborateurs));
  console.log(`[3/6] Employés (${collabsRaw.size} uniques)…`);

  const empMap = new Map<string, string>(); // raw → id
  const existingEmp = await db
    .select({ id: employes.id, nom: employes.nom, prenom: employes.prenom, societe: employes.societeInterim })
    .from(employes);
  // index par libellé canonique pour l'idempotence
  function cle(nom: string, prenom: string, societe: string | null): string {
    return `${nom}||${prenom}||${(societe ?? '').toUpperCase()}`;
  }
  const existingByLibelle = new Map<string, string>();
  for (const e of existingEmp) {
    existingByLibelle.set(cle(e.nom, e.prenom, e.societe), e.id);
  }

  const toInsertEmp: Array<typeof employes.$inferInsert> = [];
  for (const raw of collabsRaw) {
    const parsed = parseCollab(raw);
    const key = cle(parsed.nom, parsed.prenom, parsed.societe);
    const existing = existingByLibelle.get(key);
    if (existing) {
      empMap.set(raw, existing);
      continue;
    }
    toInsertEmp.push({
      entrepriseId,
      nom: parsed.nom,
      prenom: parsed.prenom,
      typeContrat: parsed.typeContrat,
      societeInterim: parsed.societe,
      actif: true,
    });
  }

  if (toInsertEmp.length > 0) {
    // Insertion par chunks de 200
    for (let i = 0; i < toInsertEmp.length; i += 200) {
      const chunk = toInsertEmp.slice(i, i + 200);
      const inserted = await db.insert(employes).values(chunk).returning({
        id: employes.id,
        nom: employes.nom,
        prenom: employes.prenom,
        societe: employes.societeInterim,
      });
      for (const e of inserted) {
        existingByLibelle.set(cle(e.nom, e.prenom, e.societe), e.id);
      }
    }
  }
  // Re-map after insert
  for (const raw of collabsRaw) {
    if (empMap.has(raw)) continue;
    const parsed = parseCollab(raw);
    const key = cle(parsed.nom, parsed.prenom, parsed.societe);
    const id = existingByLibelle.get(key);
    if (id) empMap.set(raw, id);
  }
  console.log(`  → ${toInsertEmp.length} insérés, ${empMap.size} mappés au total`);

  // ─── 4. Chantiers ─────────────────────────────────────────────
  const chantiersRaw = new Set<string>();
  data.pointage.forEach((p) => {
    if (p.chantier && p.chantier !== 'Absence') chantiersRaw.add(p.chantier);
  });
  data.bdd.forEach((b) => {
    if (b.programmes && b.programmes !== 'Absence') chantiersRaw.add(b.programmes);
  });
  console.log(`[4/6] Chantiers (${chantiersRaw.size} uniques)…`);

  const chMap = new Map<string, string>(); // raw → id
  const existingCh = await db.select({ id: chantiers.id, libelle: chantiers.libelle }).from(chantiers);
  const existingChByLibelle = new Map<string, string>();
  for (const c of existingCh) existingChByLibelle.set(c.libelle, c.id);

  const toInsertCh: Array<typeof chantiers.$inferInsert> = [];
  for (const raw of chantiersRaw) {
    const parsed = parseChantier(raw);
    const existing = existingChByLibelle.get(raw);
    if (existing) {
      chMap.set(raw, existing);
      continue;
    }
    // pas de generate_numero('chantier') pour gain perf : on génère ad-hoc
    // → on utilise libellé = raw pour conserver l'idempotence
    toInsertCh.push({
      entrepriseId,
      numero: `IMP-${raw.slice(0, 40).replace(/[^A-Za-z0-9-]/g, '_')}`,
      libelle: raw,
      clientId,
      statut: 'termine', // imports legacy → marqués terminés par défaut
      ville: parsed.ville,
    });
  }

  if (toInsertCh.length > 0) {
    for (let i = 0; i < toInsertCh.length; i += 100) {
      const chunk = toInsertCh.slice(i, i + 100);
      // Les numéros pouvant collider sur le slice → fallback timestamp
      const ts = Date.now();
      const insertedChunk = chunk.map((c, idx) => ({
        ...c,
        numero: `IMP-${ts}-${i + idx}`,
      }));
      const inserted = await db
        .insert(chantiers)
        .values(insertedChunk)
        .returning({ id: chantiers.id, libelle: chantiers.libelle });
      for (const c of inserted) existingChByLibelle.set(c.libelle, c.id);
    }
  }
  for (const raw of chantiersRaw) {
    if (chMap.has(raw)) continue;
    const id = existingChByLibelle.get(raw);
    if (id) chMap.set(raw, id);
  }
  console.log(`  → ${toInsertCh.length} insérés, ${chMap.size} mappés au total`);

  // ─── 5. Pointages ─────────────────────────────────────────────
  console.log(`[5/6] Pointages (${data.pointage.length} entrées)…`);

  // Purge des anciens pointages avant ré-import (idempotence robuste)
  // Note : on hard-delete pas, on soft-delete via UPDATE deleted_at.
  // Mais comme on n'a pas d'utilisateur courant, on fait un vrai DELETE des rows
  // dont created_by IS NULL (= venant d'imports précédents).
  const deleted = await db.execute(
    sql`DELETE FROM pointages WHERE created_by IS NULL RETURNING id`,
  );
  console.log(`  → ${deleted.length} anciens pointages d'import purgés`);

  // Préparer batch
  type RowToInsert = typeof pointages.$inferInsert;
  const batch: RowToInsert[] = [];
  let skipped = 0;
  let invalidType = 0;
  let invalidEmp = 0;

  for (const p of data.pointage) {
    if (!p.collaborateur || !p.date) {
      skipped++;
      continue;
    }
    const employeId = empMap.get(p.collaborateur);
    if (!employeId) {
      invalidEmp++;
      continue;
    }
    const quantite = p.nbr_heures_kg;
    if (!quantite || quantite <= 0) {
      skipped++;
      continue;
    }

    const isAbsence = !p.chantier || p.chantier === 'Absence';
    const type = mapType(p.type_document) ?? 'heures';
    if (!type) {
      invalidType++;
      continue;
    }

    let chantierId: string | null = null;
    if (!isAbsence) {
      chantierId = chMap.get(p.chantier!) ?? null;
      if (!chantierId) {
        skipped++;
        continue;
      }
    }

    // Cohérence stricte des CHECK SQL :
    // - type='absence' requiert chantier_id NULL ET motif_absence NOT NULL
    // - type<>'absence' requiert chantier_id NOT NULL ET motif_absence NULL
    let typeFinal: TypePointage = type;
    let motif: MotifAbsence | null = null;
    if (isAbsence) {
      typeFinal = 'absence';
      motif = mapMotif(p.motif_absence) ?? 'autre';
      chantierId = null;
    } else {
      // Si type est 'absence' mais le chantier n'est pas Absence → on remappe en 'heures'
      if (type === 'absence') typeFinal = 'heures';
      motif = null;
    }

    batch.push({
      entrepriseId,
      employeId,
      chantierId,
      datePointage: p.date,
      type: typeFinal,
      quantite: String(quantite),
      motifAbsence: motif,
      zoneDeplacement: null,
      panier: p.panier === 1,
      grandPanier: p.grand_panier === 1,
      nuitPanierSoir: p.nuit_panier_soir === 1,
    });
  }

  console.log(
    `  → ${batch.length} à insérer ; ${skipped} skipped (sans collab/quantité/chantier) ; ${invalidEmp} sans employé mappé ; ${invalidType} type document inconnu`,
  );

  let inserted = 0;
  for (let i = 0; i < batch.length; i += 500) {
    const chunk = batch.slice(i, i + 500);
    try {
      const ins = await db.insert(pointages).values(chunk).onConflictDoNothing().returning({
        id: pointages.id,
      });
      inserted += ins.length;
    } catch (err) {
      console.error(`  ⚠ batch ${i} en échec :`, err instanceof Error ? err.message : err);
    }
    if (i % 5000 === 0 && i > 0) {
      console.log(`  … ${i}/${batch.length} (${inserted} insérés à ce stade)`);
    }
  }
  console.log(`  → ${inserted} pointages insérés au total`);

  // ─── 6. Stats finales ─────────────────────────────────────────
  console.log('[6/6] Vérification…');
  const [counts] = await db.execute<{
    employes: number;
    chantiers: number;
    pointages: number;
  }>(sql`
    SELECT
      (SELECT COUNT(*)::int FROM employes WHERE deleted_at IS NULL) AS employes,
      (SELECT COUNT(*)::int FROM chantiers WHERE deleted_at IS NULL) AS chantiers,
      (SELECT COUNT(*)::int FROM pointages WHERE deleted_at IS NULL) AS pointages
  `);
  console.log('  Total DB après import :', counts);

  await client.end();
  console.log('✅ Import terminé.');
}

main().catch((err) => {
  console.error('❌ Erreur import :', err);
  client.end().finally(() => process.exit(1));
});
