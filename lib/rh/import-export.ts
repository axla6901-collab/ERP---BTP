'use server';

import 'server-only';

import { and, asc, eq, gte, isNull, lte, type SQL } from 'drizzle-orm';

import { auditLogIn } from '@/lib/audit/log';
import { requireTenantContextWithMfa } from '@/lib/auth/tenant-guards';
import { withTenant } from '@/lib/db/with-tenant';
import { lireClasseurBytes, ClasseurFormatError } from '@/lib/import/classeur';
import { chantiers } from '@/db/schema/chantiers';
import { clients } from '@/db/schema/commercial';
import { employes } from '@/db/schema/employes';
import { pointages } from '@/db/schema/pointages';
import type { MotifAbsence, TypePointage, TypeContrat } from '@/lib/validation/rh';

import { ROLES_RH_WRITE } from './permissions';
import type { FiltresExport, ImportStats } from './import-export-types';
import type { ActionResult } from '@/lib/catalogue/types';

// ─────────────────────────────────────────────────────────────
// Parsing utilitaires (mêmes mappings que scripts/import-pointage.ts)
// ─────────────────────────────────────────────────────────────

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

function mapType(raw: string | null | undefined): TypePointage {
  if (!raw) return 'heures';
  const trimmed = String(raw).trim();
  return MAP_TYPE_DOCUMENT[trimmed] ?? MAP_TYPE_DOCUMENT[trimmed.replace(/\s+/g, ' ')] ?? 'heures';
}

function mapMotif(raw: string | null | undefined): MotifAbsence {
  if (!raw) return 'autre';
  return MAP_MOTIF[String(raw).trim()] ?? 'autre';
}

function parseCollab(raw: string): {
  nom: string;
  prenom: string;
  typeContrat: TypeContrat;
  societe: string;
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
  const societeFinale = typeContrat === 'INT' ? societe || 'Non précisée' : societe || '';
  return { nom, prenom, typeContrat, societe: societeFinale };
}

function parseChantier(raw: string): { libelle: string; ville: string | null } {
  const parts = raw
    .split('-')
    .map((s) => s.trim())
    .filter(Boolean);
  if (parts.length >= 3) {
    const zoneRaw = parts[parts.length - 1]!.toUpperCase();
    const isZone = ['Z1', 'Z2', 'Z3', 'Z4', 'Z5', 'GD', 'GE'].includes(zoneRaw);
    return {
      libelle: parts.slice(0, parts.length - (isZone ? 1 : 0)).join(' - '),
      ville: parts[0] ?? null,
    };
  }
  return { libelle: raw, ville: parts[0] ?? null };
}

// ─────────────────────────────────────────────────────────────
// Type du JSON Pointage attendu
// ─────────────────────────────────────────────────────────────

type SourcePointage = {
  chantier: string | null;
  collaborateur: string | null;
  date: string | null;
  nbr_heures_kg: number | null;
  type_document: string | null;
  taches?: string | null;
  interimaire_alternant?: string | null;
  semaine?: number | null;
  motif_absence: string | null;
  ville?: string | null;
  trajet?: string | null;
  panier?: number | null;
  grand_panier?: number | null;
  nuit_panier_soir?: number | null;
  mois?: string | null;
  nom_interim?: string | null;
  annee?: number | null;
};

type SourceData = {
  pointage: SourcePointage[];
  bdd?: Array<{ collaborateurs?: string | null; programmes?: string | null }>;
};

// ─────────────────────────────────────────────────────────────
// Import JSON Pointage
// ─────────────────────────────────────────────────────────────

export async function importerJsonPointage(jsonText: string): Promise<ActionResult<ImportStats>> {
  const ctx = await requireTenantContextWithMfa(ROLES_RH_WRITE);

  let parsed: SourceData;
  try {
    parsed = JSON.parse(jsonText);
  } catch {
    return { ok: false, error: 'JSON invalide.' };
  }
  if (!Array.isArray(parsed.pointage)) {
    return { ok: false, error: 'JSON inattendu : clé "pointage" manquante ou non-tableau.' };
  }

  const stats = await withTenant(ctx.entreprise.id, async (tx) => {
    // ─── Client par défaut ──
    let clientId: string;
    const [existingClient] = await tx
      .select({ id: clients.id })
      .from(clients)
      .where(and(eq(clients.code, 'PTG-HIST'), isNull(clients.deletedAt)));
    if (existingClient) {
      clientId = existingClient.id;
    } else {
      const [inserted] = await tx
        .insert(clients)
        .values({
          entrepriseId: ctx.entreprise.id,
          code: 'PTG-HIST',
          type: 'professionnel',
          raisonSociale: 'Historique Pointage',
          adresseLigne1: 'Adresse non renseignée',
          codePostal: '00000',
          ville: 'Non renseignée',
          createdBy: ctx.utilisateur.id,
          updatedBy: ctx.utilisateur.id,
        })
        .returning({ id: clients.id });
      clientId = inserted!.id;
    }

    // ─── Employés ──
    const collabsRaw = new Set<string>();
    parsed.pointage.forEach((p) => p.collaborateur && collabsRaw.add(p.collaborateur));
    parsed.bdd?.forEach((b) => b.collaborateurs && collabsRaw.add(b.collaborateurs));

    function cleEmp(nom: string, prenom: string, societe: string): string {
      return `${nom}||${prenom}||${societe.toUpperCase()}`;
    }
    const existingEmp = await tx
      .select({
        id: employes.id,
        nom: employes.nom,
        prenom: employes.prenom,
        societe: employes.societeInterim,
      })
      .from(employes);
    const existingByLibelle = new Map<string, string>();
    for (const e of existingEmp) {
      existingByLibelle.set(cleEmp(e.nom, e.prenom, e.societe ?? ''), e.id);
    }

    const empMap = new Map<string, string>();
    const toInsertEmp: Array<typeof employes.$inferInsert> = [];
    for (const raw of collabsRaw) {
      const p = parseCollab(raw);
      const key = cleEmp(p.nom, p.prenom, p.societe);
      const existing = existingByLibelle.get(key);
      if (existing) {
        empMap.set(raw, existing);
        continue;
      }
      toInsertEmp.push({
        entrepriseId: ctx.entreprise.id,
        nom: p.nom,
        prenom: p.prenom,
        typeContrat: p.typeContrat,
        societeInterim: p.societe || null,
        actif: true,
        createdBy: ctx.utilisateur.id,
        updatedBy: ctx.utilisateur.id,
      });
    }
    let newEmployes = 0;
    for (let i = 0; i < toInsertEmp.length; i += 200) {
      const chunk = toInsertEmp.slice(i, i + 200);
      const inserted = await tx.insert(employes).values(chunk).returning({
        id: employes.id,
        nom: employes.nom,
        prenom: employes.prenom,
        societe: employes.societeInterim,
      });
      newEmployes += inserted.length;
      for (const e of inserted) {
        existingByLibelle.set(cleEmp(e.nom, e.prenom, e.societe ?? ''), e.id);
      }
    }
    for (const raw of collabsRaw) {
      if (empMap.has(raw)) continue;
      const p = parseCollab(raw);
      const id = existingByLibelle.get(cleEmp(p.nom, p.prenom, p.societe));
      if (id) empMap.set(raw, id);
    }

    // ─── Chantiers ──
    const chantiersRaw = new Set<string>();
    parsed.pointage.forEach((p) => {
      if (p.chantier && p.chantier !== 'Absence') chantiersRaw.add(p.chantier);
    });
    parsed.bdd?.forEach((b) => {
      if (b.programmes && b.programmes !== 'Absence') chantiersRaw.add(b.programmes);
    });

    const existingCh = await tx
      .select({ id: chantiers.id, libelle: chantiers.libelle })
      .from(chantiers);
    const existingChByLibelle = new Map<string, string>();
    for (const c of existingCh) existingChByLibelle.set(c.libelle, c.id);

    const chMap = new Map<string, string>();
    const toInsertCh: Array<typeof chantiers.$inferInsert> = [];
    for (const raw of chantiersRaw) {
      const existing = existingChByLibelle.get(raw);
      if (existing) {
        chMap.set(raw, existing);
        continue;
      }
      const parsedC = parseChantier(raw);
      toInsertCh.push({
        entrepriseId: ctx.entreprise.id,
        numero: `IMP-${Date.now()}-${Math.floor(Math.random() * 100000)}`,
        libelle: raw,
        clientId,
        statut: 'termine',
        ville: parsedC.ville,
        createdBy: ctx.utilisateur.id,
        updatedBy: ctx.utilisateur.id,
      });
    }
    let newChantiers = 0;
    for (let i = 0; i < toInsertCh.length; i += 100) {
      const chunk = toInsertCh.slice(i, i + 100);
      const ts = Date.now();
      const chunkResolved = chunk.map((c, idx) => ({ ...c, numero: `IMP-${ts}-${i + idx}` }));
      const inserted = await tx
        .insert(chantiers)
        .values(chunkResolved)
        .returning({ id: chantiers.id, libelle: chantiers.libelle });
      newChantiers += inserted.length;
      for (const c of inserted) existingChByLibelle.set(c.libelle, c.id);
    }
    for (const raw of chantiersRaw) {
      if (chMap.has(raw)) continue;
      const id = existingChByLibelle.get(raw);
      if (id) chMap.set(raw, id);
    }

    // ─── Pointages ──
    type RowToInsert = typeof pointages.$inferInsert;
    const batch: RowToInsert[] = [];
    let skipped = 0;
    let invalidEmp = 0;

    for (const p of parsed.pointage) {
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
      let chantierId: string | null = null;
      if (!isAbsence) {
        chantierId = chMap.get(p.chantier!) ?? null;
        if (!chantierId) {
          skipped++;
          continue;
        }
      }
      let typeFinal: TypePointage;
      let motif: MotifAbsence | null = null;
      if (isAbsence) {
        typeFinal = 'absence';
        motif = mapMotif(p.motif_absence);
        chantierId = null;
      } else {
        const t = mapType(p.type_document);
        typeFinal = t === 'absence' ? 'heures' : t;
        motif = null;
      }

      batch.push({
        entrepriseId: ctx.entreprise.id,
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
        createdBy: ctx.utilisateur.id,
        updatedBy: ctx.utilisateur.id,
      });
    }

    let inserted = 0;
    for (let i = 0; i < batch.length; i += 500) {
      const chunk = batch.slice(i, i + 500);
      try {
        const ins = await tx
          .insert(pointages)
          .values(chunk)
          .onConflictDoNothing()
          .returning({ id: pointages.id });
        inserted += ins.length;
      } catch {
        // batch skip
      }
    }

    await auditLogIn(tx, {
      action: 'insert',
      tableName: 'pointages',
      rowId: `import-json-${Date.now()}`,
      after: { inserted, skipped, invalidEmp, newEmployes, newChantiers },
    });

    return { inserted, skipped, invalidEmp, newEmployes, newChantiers };
  });

  return { ok: true, data: stats };
}

// ─────────────────────────────────────────────────────────────
// Export CSV des pointages
// ─────────────────────────────────────────────────────────────

export async function exporterPointagesCSV(
  filtres: FiltresExport = {},
): Promise<{ ok: true; filename: string; csv: string } | { ok: false; error: string }> {
  const ctx = await requireTenantContextWithMfa();

  const where: SQL[] = [isNull(pointages.deletedAt)];
  if (filtres.dateMin) where.push(gte(pointages.datePointage, filtres.dateMin));
  if (filtres.dateMax) where.push(lte(pointages.datePointage, filtres.dateMax));
  if (filtres.employeId) where.push(eq(pointages.employeId, filtres.employeId));
  if (filtres.chantierId) where.push(eq(pointages.chantierId, filtres.chantierId));
  if (filtres.type) where.push(eq(pointages.type, filtres.type));

  const rows = await withTenant(ctx.entreprise.id, (tx) =>
    tx
      .select({
        date: pointages.datePointage,
        nom: employes.nom,
        prenom: employes.prenom,
        societe: employes.societeInterim,
        type_contrat: employes.typeContrat,
        chantier_numero: chantiers.numero,
        chantier_libelle: chantiers.libelle,
        type: pointages.type,
        quantite: pointages.quantite,
        motif_absence: pointages.motifAbsence,
        zone_deplacement: pointages.zoneDeplacement,
        panier: pointages.panier,
        grand_panier: pointages.grandPanier,
        nuit_panier_soir: pointages.nuitPanierSoir,
        notes: pointages.notes,
      })
      .from(pointages)
      .innerJoin(employes, eq(pointages.employeId, employes.id))
      .leftJoin(chantiers, eq(pointages.chantierId, chantiers.id))
      .where(and(...where))
      .orderBy(asc(pointages.datePointage), asc(employes.nom)),
  );

  const headers = [
    'date',
    'nom',
    'prenom',
    'societe_interim',
    'type_contrat',
    'chantier_numero',
    'chantier_libelle',
    'type',
    'quantite',
    'motif_absence',
    'zone_deplacement',
    'panier',
    'grand_panier',
    'nuit_panier_soir',
    'notes',
  ];

  const escape = (v: unknown): string => {
    if (v === null || v === undefined) return '';
    const s = String(v);
    if (/[";\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
    return s;
  };

  const csv =
    '﻿' +
    [headers.join(';')]
      .concat(
        rows.map((r) =>
          [
            r.date,
            r.nom,
            r.prenom,
            r.societe,
            r.type_contrat,
            r.chantier_numero,
            r.chantier_libelle,
            r.type,
            r.quantite,
            r.motif_absence,
            r.zone_deplacement,
            r.panier ? '1' : '',
            r.grand_panier ? '1' : '',
            r.nuit_panier_soir ? '1' : '',
            r.notes,
          ]
            .map(escape)
            .join(';'),
        ),
      )
      .join('\r\n');

  const partDate = `${filtres.dateMin ?? 'tous'}_${filtres.dateMax ?? 'tous'}`;
  const filename = `pointages_${partDate}.csv`;
  return { ok: true, filename, csv };
}

// ─────────────────────────────────────────────────────────────
// Import Excel/CSV (mêmes colonnes que l'export)
// ─────────────────────────────────────────────────────────────

const EXCEL_HEADER_MAP: Record<string, keyof SourcePointage> = {
  chantier: 'chantier',
  collaborateur: 'collaborateur',
  date: 'date',
  'nbr heures / kg': 'nbr_heures_kg',
  nbr_heures_kg: 'nbr_heures_kg',
  heures: 'nbr_heures_kg',
  quantite: 'nbr_heures_kg',
  'type de document': 'type_document',
  type_document: 'type_document',
  type: 'type_document',
  taches: 'taches',
  tâches: 'taches',
  'intérimaire / alternant': 'interimaire_alternant',
  interimaire_alternant: 'interimaire_alternant',
  semaine: 'semaine',
  "motif d'absence": 'motif_absence',
  motif_absence: 'motif_absence',
  ville: 'ville',
  trajet: 'trajet',
  panier: 'panier',
  'grand panier': 'grand_panier',
  grand_panier: 'grand_panier',
  'nuit + panier soir': 'nuit_panier_soir',
  nuit_panier_soir: 'nuit_panier_soir',
  mois: 'mois',
  'nom interim': 'nom_interim',
  nom_interim: 'nom_interim',
  année: 'annee',
  annee: 'annee',
};

function rowsExcelToJson(rows: unknown[][]): SourcePointage[] {
  if (rows.length < 2) return [];
  const headers = (rows[0] ?? []).map((h) =>
    String(h ?? '')
      .toLowerCase()
      .trim(),
  );
  const out: SourcePointage[] = [];
  for (const row of rows.slice(1)) {
    if (!row.some((v) => v !== null && v !== undefined && v !== '')) continue;
    const obj: Partial<SourcePointage> = {};
    headers.forEach((h, i) => {
      const key = EXCEL_HEADER_MAP[h];
      if (!key) return;
      const v = row[i];
      if (v === undefined || v === null || v === '') {
        // garde null
        (obj as Record<string, unknown>)[key] = null;
        return;
      }
      if (key === 'date') {
        (obj as Record<string, unknown>)[key] = normalizeDate(v);
      } else if (
        key === 'nbr_heures_kg' ||
        key === 'panier' ||
        key === 'grand_panier' ||
        key === 'nuit_panier_soir' ||
        key === 'semaine' ||
        key === 'annee'
      ) {
        const n = typeof v === 'number' ? v : Number(String(v).replace(',', '.'));
        (obj as Record<string, unknown>)[key] = Number.isNaN(n) ? null : n;
      } else {
        (obj as Record<string, unknown>)[key] = String(v);
      }
    });
    out.push(obj as SourcePointage);
  }
  return out;
}

function normalizeDate(v: unknown): string | null {
  if (v === null || v === undefined || v === '') return null;
  if (typeof v === 'number') {
    // Excel date serial → JS Date
    const ms = (v - 25569) * 86400 * 1000;
    const d = new Date(ms);
    return d.toISOString().slice(0, 10);
  }
  if (v instanceof Date) {
    return v.toISOString().slice(0, 10);
  }
  const s = String(v);
  const m1 = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m1) return `${m1[1]}-${m1[2]}-${m1[3]}`;
  const m2 = s.match(/^(\d{2})\/(\d{2})\/(\d{4})/);
  if (m2) return `${m2[3]}-${m2[2]}-${m2[1]}`;
  return s.slice(0, 10);
}

export async function importerExcelPointage(
  buffer: ArrayBuffer | Uint8Array,
): Promise<ActionResult<ImportStats>> {
  await requireTenantContextWithMfa(ROLES_RH_WRITE);
  let rows: unknown[][];
  try {
    const classeur = await lireClasseurBytes(buffer);
    const sheetName = classeur.sheetNames[0];
    if (!sheetName) return { ok: false, error: 'Pas de feuille dans le classeur.' };
    rows = classeur.feuille(sheetName);
  } catch (err) {
    if (err instanceof ClasseurFormatError) return { ok: false, error: err.message };
    return {
      ok: false,
      error: 'Lecture Excel impossible : ' + (err instanceof Error ? err.message : 'erreur'),
    };
  }
  const records = rowsExcelToJson(rows);
  if (records.length === 0) {
    return { ok: false, error: 'Aucune ligne exploitable trouvée dans le fichier.' };
  }
  // Réutilise le pipeline JSON
  return importerJsonPointage(JSON.stringify({ pointage: records, bdd: [] }));
}
