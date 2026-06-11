import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as XLSX from 'xlsx';

// Isole le module de toute dépendance DB / auth : on ne teste ici que le
// parsing du classeur et la construction de la preview. Les insertions
// (executerImportCatalogue) relèvent d'un test d'intégration avec vraie base.
vi.mock('@/lib/auth/guards', () => ({
  requirePermission: vi.fn().mockResolvedValue({ id: 'u1', roleId: 'r1' }),
}));
vi.mock('@/lib/auth/tenant-guards', () => ({
  requireTenantContextWithMfa: vi.fn().mockResolvedValue({
    utilisateur: { id: 'u1' },
    entreprise: { id: 'e1', slug: 'acme' },
  }),
}));
vi.mock('@/lib/db/with-tenant', () => ({ withTenant: vi.fn() }));
vi.mock('@/lib/audit/log', () => ({ auditLogIn: vi.fn() }));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));

import { withTenant } from '@/lib/db/with-tenant';

import {
  analyserClasseurCatalogue,
  previewImportCatalogue,
  type MappingCatalogue,
} from './import-catalogue-fournisseur';

/**
 * Tarif fournisseur "type négociant" : un onglet, en-tête en ligne 1,
 * 6 colonnes (code, désignation, famille, unité, prix, réf. fournisseur).
 */
function buildCatalogueBuffer(): string {
  const wb = XLSX.utils.book_new();
  const aoa: (string | number | null)[][] = [
    ['Code', 'Désignation', 'Famille', 'Unité', 'Prix HT', 'Réf fournisseur'],
    ['PLQ-13', 'Plaque BA13 standard', 'PLATRERIE', 'm2', 4.5, 'PP-BA13'],
    ['PLQ-18', 'Plaque BA18 hydrofuge', 'PLATRERIE', 'm2', 7.2, 'PP-BA18'],
    ['VIS-25', 'Vis TTPC 25mm (boîte 1000)', 'VISSERIE', 'B', '12,90', 'PP-V25'],
  ];
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(aoa), 'Tarif');
  const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }) as Buffer;
  return buf.toString('base64');
}

function mappingComplet(): MappingCatalogue {
  return {
    feuille: 'Tarif',
    headerRow: 0,
    idxCode: 0,
    idxLibelle: 1,
    idxFamille: 2,
    idxUnite: 3,
    idxPrix: 4,
    idxReferenceFournisseur: 5,
    idxDescription: null,
  };
}

describe('analyserClasseurCatalogue', () => {
  it('détecte la feuille, la ligne d’en-tête et les colonnes par alias', async () => {
    const res = await analyserClasseurCatalogue(buildCatalogueBuffer(), 'tarif.xlsx');
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.data.suggestion).not.toBeNull();
    expect(res.data.suggestion!).toMatchObject({
      feuille: 'Tarif',
      headerRow: 0,
      idxCode: 0,
      idxLibelle: 1,
      idxFamille: 2,
      idxUnite: 3,
      idxPrix: 4,
      idxReferenceFournisseur: 5,
    });
  });

  it('renvoie une suggestion nulle quand aucune colonne code+libellé n’est trouvée', async () => {
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(
      wb,
      XLSX.utils.aoa_to_sheet([
        ['Colonne A', 'Colonne B'],
        ['x', 'y'],
      ]),
      'F1',
    );
    const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }) as Buffer;
    const res = await analyserClasseurCatalogue(buf.toString('base64'), 'f.xlsx');
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.data.suggestion).toBeNull();
  });
});

describe('previewImportCatalogue', () => {
  beforeEach(() => {
    vi.mocked(withTenant).mockReset();
  });

  it('classe toutes les lignes en nouvelles quand le catalogue est vide', async () => {
    vi.mocked(withTenant).mockResolvedValue({
      articlesExistants: new Set<string>(),
      famillesExistantes: new Set<string>(),
      unitesExistantes: new Set<string>(),
    });
    const res = await previewImportCatalogue(
      buildCatalogueBuffer(),
      'tarif.xlsx',
      mappingComplet(),
    );
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.data.nbNouveaux).toBe(3);
    expect(res.data.nbDoublons).toBe(0);
    expect(res.data.nbErreurs).toBe(0);
    expect(res.data.famillesACreer).toEqual(['PLATRERIE', 'VISSERIE']);
    expect(res.data.unitesACreer).toEqual(['B', 'm2']);
    // virgule décimale française normalisée
    const vis = res.data.lignes.find((l) => l.code === 'VIS-25')!;
    expect(vis.prix).toBe('12.9');
    expect(vis.referenceFournisseur).toBe('PP-V25');
  });

  it('marque comme doublons les codes déjà présents et n’en recrée pas le référentiel', async () => {
    vi.mocked(withTenant).mockResolvedValue({
      articlesExistants: new Set(['PLQ-13']),
      famillesExistantes: new Set(['PLATRERIE']),
      unitesExistantes: new Set(['m2']),
    });
    const res = await previewImportCatalogue(
      buildCatalogueBuffer(),
      'tarif.xlsx',
      mappingComplet(),
    );
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.data.nbDoublons).toBe(1);
    expect(res.data.nbNouveaux).toBe(2);
    expect(res.data.famillesACreer).toEqual(['VISSERIE']);
    expect(res.data.unitesACreer).toEqual(['B']);
    expect(res.data.lignes.find((l) => l.code === 'PLQ-13')!.doublon).toBe(true);
  });

  it('signale les lignes en erreur (code/libellé manquant, prix négatif)', async () => {
    vi.mocked(withTenant).mockResolvedValue({
      articlesExistants: new Set<string>(),
      famillesExistantes: new Set<string>(),
      unitesExistantes: new Set<string>(),
    });
    const wb = XLSX.utils.book_new();
    const aoa: (string | number | null)[][] = [
      ['Code', 'Désignation', 'Prix HT'],
      [null, 'Sans code', 10],
      ['OK-1', null, 5],
      ['OK-2', 'Article négatif', -5],
      ['OK-3', 'Article valide', 9.9],
    ];
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(aoa), 'Tarif');
    const buf = (XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }) as Buffer).toString('base64');
    const res = await previewImportCatalogue(buf, 'tarif.xlsx', {
      feuille: 'Tarif',
      headerRow: 0,
      idxCode: 0,
      idxLibelle: 1,
      idxFamille: null,
      idxUnite: null,
      idxPrix: 2,
      idxReferenceFournisseur: null,
      idxDescription: null,
    });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.data.nbErreurs).toBe(3);
    expect(res.data.nbNouveaux).toBe(1);
  });

  it('rejette un mapping dont la feuille est introuvable', async () => {
    vi.mocked(withTenant).mockResolvedValue({
      articlesExistants: new Set<string>(),
      famillesExistantes: new Set<string>(),
      unitesExistantes: new Set<string>(),
    });
    const res = await previewImportCatalogue(buildCatalogueBuffer(), 'tarif.xlsx', {
      ...mappingComplet(),
      feuille: 'Inexistante',
    });
    expect(res.ok).toBe(false);
  });

  it('rejette un mapping où Code et Libellé pointent la même colonne', async () => {
    vi.mocked(withTenant).mockResolvedValue({
      articlesExistants: new Set<string>(),
      famillesExistantes: new Set<string>(),
      unitesExistantes: new Set<string>(),
    });
    const res = await previewImportCatalogue(buildCatalogueBuffer(), 'tarif.xlsx', {
      ...mappingComplet(),
      idxLibelle: 0,
    });
    expect(res.ok).toBe(false);
  });
});
