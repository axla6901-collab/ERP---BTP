import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

import { describe, expect, it, vi } from 'vitest';
import * as XLSX from 'xlsx';

vi.mock('@/lib/auth/guards', () => ({
  requirePermission: vi.fn().mockResolvedValue({ id: 'u1', role: 'admin' }),
}));

import { analyserClasseurDpgf, importerAvecMappingDpgf, type MappingDpgf } from './import-dpgf';

/**
 * DPGF "type économiste" :
 *   - feuille 1 : page de garde (1 ligne) — doit être ignorée
 *   - feuille 2 : le détail des postes
 *   - col 0 : position sans en-tête
 *   - col 1 : "DESIGNATION DU POSTE"
 *   - col 2 : "U" (unité)
 *   - col 3-4 : 2 colonnes de quantité (économiste / entreprise)
 *   - col 5 : "P.U." (à ignorer)
 */
function buildDpgfBuffer(): string {
  const wb = XLSX.utils.book_new();

  const garde = XLSX.utils.aoa_to_sheet([['LOT 32 — Page de garde']]);
  XLSX.utils.book_append_sheet(wb, garde, 'Garde');

  const aoa: (string | number | null)[][] = [
    [null, null, null, null, null, null, null],
    [
      null,
      'DESIGNATION DU POSTE',
      'U',
      'Quantité économiste',
      'Quantité entreprise',
      'P.U.',
      'Total',
    ],
    [null, null, null, null, null, null, null],
    ['2.1', 'PRESTATIONS COMPLEMENTAIRES', null, null, null, null, null],
    ['2.1.1', "Études d'exécution", 'Ft', 1, 1, 19800, 19800],
    ['2.1.2', 'État des lieux par constat d’Huissier', 'Ft', 1, 1, 792, 792],
    [null, 'Total PRESTATIONS COMPLEMENTAIRES', null, null, null, null, 20592],
    ['3.1.1', 'TERRASSEMENTS COMPLEMENTAIRES', null, null, null, null, null],
    ['3.1.1.1', 'Fouilles en trous / puits', 'm³', 16.33, 16.33, 17.25, 281.69],
    ['3.1.1.2', 'Fouilles en rigoles', 'm³', 82.817, 82.817, 17.25, 1428.59],
    [null, 'Montant HT du Lot N°32 GROS-OEUVRE', null, null, null, null, 1044999.99],
    [20, 'Montant TVA (20%)', null, null, null, null, 208999.99],
    [null, 'Montant TTC', null, null, null, null, 1253999.99],
  ];
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(aoa), 'Lot 32 GROS-OEUVRE');

  const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }) as Buffer;
  return buf.toString('base64');
}

describe('analyserClasseurDpgf', () => {
  it('renvoie toutes les feuilles, leur aperçu, et un mapping suggéré pour la plus volumineuse', async () => {
    const base64 = buildDpgfBuffer();
    const res = await analyserClasseurDpgf(base64, 'dpgf.xlsx');
    expect(res.ok).toBe(true);
    if (!res.ok) return;

    expect(res.data.feuilles.map((f) => f.nom)).toEqual(['Garde', 'Lot 32 GROS-OEUVRE']);
    expect(res.data.suggestion).not.toBeNull();
    expect(res.data.suggestion!).toMatchObject({
      feuille: 'Lot 32 GROS-OEUVRE',
      headerRow: 1,
      idxPosition: 0,
      idxDesignation: 1,
      idxUnite: 2,
    });
    // idxQuantite peut tomber sur "Quantité économiste" (col 3) — première match alias.
    expect(res.data.suggestion!.idxQuantite).toBe(3);

    // Aperçu : on doit avoir au moins une ligne avec "DESIGNATION DU POSTE" dans
    // les premières lignes de la 2e feuille.
    const lot = res.data.feuilles.find((f) => f.nom === 'Lot 32 GROS-OEUVRE')!;
    expect(lot.apercu.length).toBeGreaterThan(5);
    expect(lot.nbColonnes).toBeGreaterThanOrEqual(7);
  });

  it('refuse un fichier sans aucune feuille exploitable', async () => {
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([[null]]), 'Vide');
    const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }) as Buffer;
    const res = await analyserClasseurDpgf(buf.toString('base64'), 'vide.xlsx');
    expect(res.ok).toBe(true); // on renvoie quand même la liste des feuilles…
    if (!res.ok) return;
    // …mais sans suggestion
    expect(res.data.suggestion).toBeNull();
  });
});

describe('importerAvecMappingDpgf', () => {
  function mapping(): MappingDpgf {
    return {
      feuille: 'Lot 32 GROS-OEUVRE',
      headerRow: 1,
      idxPosition: 0,
      idxDesignation: 1,
      idxUnite: 2,
      idxQuantite: 4,
    };
  }

  it('applique le mapping suggéré et produit la preview attendue', async () => {
    const res = await importerAvecMappingDpgf(buildDpgfBuffer(), 'dpgf.xlsx', mapping());
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.data.feuilleUtilisee).toBe('Lot 32 GROS-OEUVRE');
    expect(res.data.nbArticles).toBe(4);
    // 2 chapitres (2.1, 3.1.1) sont gardés comme sections car sans qté/unité
    expect(res.data.nbSections).toBe(2);
    expect(res.data.nbErreurs).toBe(0);

    const articles = res.data.lignes.filter((l) => l.type === 'libre');
    expect(articles[0]).toMatchObject({
      type: 'libre',
      position: '2.1.1',
      designation: "Études d'exécution",
      quantite: '1',
      unite: 'Ft',
    });
  });

  it('mapping différent : sans unité ni quantité, toutes les lignes deviennent des sections', async () => {
    const m = mapping();
    m.idxUnite = null;
    m.idxQuantite = null;
    const res = await importerAvecMappingDpgf(buildDpgfBuffer(), 'dpgf.xlsx', m);
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.data.nbArticles).toBe(0);
    expect(res.data.lignes.every((l) => l.type === 'section')).toBe(true);
  });

  it('rejette un mapping pointant vers une feuille inexistante', async () => {
    const m = mapping();
    m.feuille = 'Feuille inexistante';
    const res = await importerAvecMappingDpgf(buildDpgfBuffer(), 'dpgf.xlsx', m);
    expect(res.ok).toBe(false);
  });

  it('rejette un mapping avec un index de colonne hors limites', async () => {
    const m = mapping();
    m.idxDesignation = 99;
    const res = await importerAvecMappingDpgf(buildDpgfBuffer(), 'dpgf.xlsx', m);
    expect(res.ok).toBe(false);
  });

  /**
   * Test d'intégration sur le vrai DPGF du prospect (présent en local seulement).
   */
  const dpgfReel = path.join(
    process.cwd(),
    'fichier exemple',
    '32 GROS-OEUVRE -  FLOCAGE mise à jour 06.11.25.xlsx',
  );
  const itIfFile = existsSync(dpgfReel) ? it : it.skip;

  itIfFile('analyse puis importe le DPGF réel envoyé par le prospect (Côte Marquis)', async () => {
    const base64 = readFileSync(dpgfReel).toString('base64');
    const ana = await analyserClasseurDpgf(base64, path.basename(dpgfReel));
    expect(ana.ok).toBe(true);
    if (!ana.ok) return;
    expect(ana.data.suggestion).not.toBeNull();

    const res = await importerAvecMappingDpgf(
      base64,
      path.basename(dpgfReel),
      ana.data.suggestion!,
    );
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.data.nbArticles).toBeGreaterThanOrEqual(100);
    expect(res.data.nbErreurs).toBe(0);

    // Aucune ligne « Total … » ou « Montant TVA » ne doit subsister
    const designations = res.data.lignes.map((l) => l.designation);
    expect(designations.some((d) => /^total /i.test(d))).toBe(false);
    expect(designations.some((d) => /^montant (ht|tva|ttc)/i.test(d))).toBe(false);
  });
});
