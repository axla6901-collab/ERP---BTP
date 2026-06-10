import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

import { describe, expect, it, vi } from 'vitest';
import * as XLSX from 'xlsx';

vi.mock('@/lib/auth/guards', () => ({
  requireAuthWithMfa: vi.fn().mockResolvedValue({ id: 'u1', role: 'admin' }),
}));

vi.mock('@/lib/auth/tenant-guards', () => ({
  requireTenantContextWithMfa: vi.fn().mockResolvedValue({
    utilisateur: { id: 'u1', role: 'admin' },
    entreprise: { id: 'e1', slug: 'test', raisonSociale: 'Test', roleId: 'r1' },
  }),
}));

// Le client DB est référencé en chaîne via tenant-guards → with-tenant → client.
// On stubble la variable d'env pour éviter le throw au chargement du module.
process.env.DATABASE_URL ??= 'postgresql://stub:stub@localhost:5432/stub';

vi.mock('@/lib/db/client', () => ({
  db: {},
  getDbAdmin: vi.fn(),
}));

vi.mock('@/lib/db/with-tenant', () => ({
  withTenant: vi.fn(),
}));

import { parserFichierSituation } from './import-situation';

function aoaToBase64(aoa: (string | number | null)[][]): string {
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(aoa), 'F');
  const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }) as Buffer;
  return buf.toString('base64');
}

describe('parserFichierSituation', () => {
  it('importe un modèle "situation" type prospect (col 0 = position, col 1 = désignation sans en-tête)', async () => {
    const base64 = aoaToBase64([
      [null, null, null, null, null, null],
      ['DESIGNATION', null, 'U', 'Q', 'PU', 'Montant', '%'],
      [null, 'LOT 32 - GROS ŒUVRE', null, null, null, null, null],
      ['2.1', 'PRESTATIONS COMPLEMENTAIRES', null, null, null, null, null],
      ['2.1.1', "Études d'exécution", null, null, null, 10394.95, 0.5],
      ['2.1.2', "État des lieux", null, null, null, 415.8, 0],
      [null, 'Total PRESTATIONS COMPLEMENTAIRES', null, null, null, 10810.75, null],
    ]);
    const res = await parserFichierSituation(base64, 'situation.xlsx');
    expect(res.ok).toBe(true);
    if (!res.ok) return;

    expect(res.data.lignes).toHaveLength(2);
    expect(res.data.nbLignesValides).toBe(2);
    expect(res.data.nbLignesErreurs).toBe(0);
    expect(res.data.lignes[0]).toMatchObject({
      designation: "2.1.1 Études d'exécution",
      montantMarcheHt: '10394.95',
      pctAvancementCumule: '50',
    });
    expect(res.data.lignes[1]).toMatchObject({
      designation: '2.1.2 État des lieux',
      montantMarcheHt: '415.8',
      pctAvancementCumule: '0',
    });
  });

  it('ignore silencieusement les lignes de chapitre (sans qté, sans montant, sans %)', async () => {
    const base64 = aoaToBase64([
      ['DESIGNATION', null, 'U', 'Q', 'PU', 'Montant', '%'],
      ['2.1', 'PRESTATIONS COMPLEMENTAIRES', null, null, null, null, null],
      ['2.1.1', 'Article 1', 'U', 1, 100, null, 0.5],
    ]);
    const res = await parserFichierSituation(base64, 'situation.xlsx');
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.data.lignes).toHaveLength(1);
    expect(res.data.lignes[0]?.designation).toBe('2.1.1 Article 1');
  });

  /**
   * Tests d'intégration sur les fichiers réels du prospect (présents en
   * local seulement — CI les skip).
   */
  const racine = process.cwd();
  const situations = [
    path.join(racine, 'fichier exemple', 'SITUATION 01 FEVRIER COTE MARQUIS BATIMENT COLLECTIF.xlsx'),
    path.join(racine, 'fichier exemple', 'SITUATION 01 FEVRIER COTE MARQUIS MAISONS INDIVIDUELLES.xlsx'),
  ];
  for (const fichier of situations) {
    const itIfFile = existsSync(fichier) ? it : it.skip;
    itIfFile(`parse le fichier de situation réel : ${path.basename(fichier)}`, async () => {
      const base64 = readFileSync(fichier).toString('base64');
      const res = await parserFichierSituation(base64, path.basename(fichier));
      expect(res.ok).toBe(true);
      if (!res.ok) return;
      expect(res.data.nbLignesValides).toBeGreaterThan(100);
      expect(res.data.nbLignesErreurs).toBe(0);
      const designations = res.data.lignes.map((l) => l.designation);
      expect(designations.some((d) => /^total /i.test(d))).toBe(false);
      expect(designations.some((d) => /^tva /i.test(d))).toBe(false);
      // Les positions hiérarchiques doivent être préfixées aux désignations.
      expect(designations.some((d) => /^\d+(\.\d+)+\s/.test(d))).toBe(true);
    });
  }
});
