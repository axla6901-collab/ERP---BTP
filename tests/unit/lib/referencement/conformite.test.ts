import { describe, expect, it } from 'vitest';

import {
  documentsRequisTier,
  evaluerConformiteTier,
  statutDocument,
  type DocumentLite,
  type MatriceLigne,
  type NatureDocLite,
} from '@/lib/referencement/conformite';

const AUJ = '2026-06-10';

function nature(partial: Partial<NatureDocLite> & { id: string }): NatureDocLite {
  return {
    code: partial.id.toUpperCase(),
    libelle: partial.id,
    modeControle: 'duree_jours',
    delaiValiditeJours: 180,
    delaiRelanceJours: 10,
    ...partial,
  };
}

describe('statutDocument', () => {
  const kbis = nature({ id: 'kbis', modeControle: 'duree_jours', delaiRelanceJours: 10 });
  const ppsps = nature({ id: 'ppsps', modeControle: 'case_a_cocher', delaiValiditeJours: null, delaiRelanceJours: null });

  it('renvoie "manquant" si aucun document', () => {
    expect(statutDocument(null, kbis, AUJ)).toBe('manquant');
    expect(statutDocument(undefined, kbis, AUJ)).toBe('manquant');
  });

  it('priorise le statut de workflow refusé', () => {
    const doc: DocumentLite = { natureDocumentId: 'kbis', statut: 'refuse', dateFinValidite: '2027-01-01' };
    expect(statutDocument(doc, kbis, AUJ)).toBe('refuse');
  });

  it('priorise le statut en attente de validation', () => {
    const doc: DocumentLite = { natureDocumentId: 'kbis', statut: 'en_attente_validation', dateFinValidite: '2027-01-01' };
    expect(statutDocument(doc, kbis, AUJ)).toBe('en_attente');
  });

  it('mode case à cocher : présent ⇒ à jour (pas d\'expiration)', () => {
    const doc: DocumentLite = { natureDocumentId: 'ppsps', statut: 'valide', dateFinValidite: null };
    expect(statutDocument(doc, ppsps, AUJ)).toBe('a_jour');
  });

  it('mode daté : validité largement future ⇒ à jour', () => {
    const doc: DocumentLite = { natureDocumentId: 'kbis', statut: 'valide', dateFinValidite: '2026-12-31' };
    expect(statutDocument(doc, kbis, AUJ)).toBe('a_jour');
  });

  it('mode daté : dans la fenêtre de relance ⇒ à renouveler', () => {
    // délai relance = 10 j ; expire dans 5 j → à renouveler
    const doc: DocumentLite = { natureDocumentId: 'kbis', statut: 'valide', dateFinValidite: '2026-06-15' };
    expect(statutDocument(doc, kbis, AUJ)).toBe('a_renouveler');
  });

  it('mode daté : exactement au seuil de relance ⇒ à renouveler', () => {
    const doc: DocumentLite = { natureDocumentId: 'kbis', statut: 'valide', dateFinValidite: '2026-06-20' };
    expect(statutDocument(doc, kbis, AUJ)).toBe('a_renouveler');
  });

  it('mode daté : juste au-delà du seuil ⇒ à jour', () => {
    const doc: DocumentLite = { natureDocumentId: 'kbis', statut: 'valide', dateFinValidite: '2026-06-21' };
    expect(statutDocument(doc, kbis, AUJ)).toBe('a_jour');
  });

  it('mode daté : date de fin dépassée ⇒ expiré', () => {
    const doc: DocumentLite = { natureDocumentId: 'kbis', statut: 'valide', dateFinValidite: '2026-06-01' };
    expect(statutDocument(doc, kbis, AUJ)).toBe('expire');
  });

  it('mode daté sans date de validité ⇒ à jour (on ne peut pas calculer l\'expiration)', () => {
    const doc: DocumentLite = { natureDocumentId: 'kbis', statut: 'valide', dateFinValidite: null };
    expect(statutDocument(doc, kbis, AUJ)).toBe('a_jour');
  });
});

describe('documentsRequisTier', () => {
  const matrice: MatriceLigne[] = [
    { corpsEtatId: 'go', natureDocumentId: 'kbis', natureTiers: 'artisan', estBloquant: true },
    { corpsEtatId: 'go', natureDocumentId: 'urssaf', natureTiers: 'artisan', estBloquant: true },
    { corpsEtatId: 'elec', natureDocumentId: 'kbis', natureTiers: 'artisan', estBloquant: false },
    { corpsEtatId: 'go', natureDocumentId: 'kbis', natureTiers: 'fournisseur', estBloquant: true },
  ];

  it('filtre par nature ET corps d\'état', () => {
    const res = documentsRequisTier('artisan', ['go'], matrice);
    expect(res.map((r) => r.natureDocumentId).sort()).toEqual(['kbis', 'urssaf']);
  });

  it('déduplique par nature de document sur plusieurs corps d\'état (bloquant = OR)', () => {
    const res = documentsRequisTier('artisan', ['go', 'elec'], matrice);
    const kbis = res.find((r) => r.natureDocumentId === 'kbis');
    expect(kbis?.estBloquant).toBe(true); // go=true OR elec=false ⇒ true
    expect(res).toHaveLength(2);
  });

  it('renvoie vide si le tier n\'a aucun corps d\'état', () => {
    expect(documentsRequisTier('artisan', [], matrice)).toEqual([]);
  });

  it('ne renvoie que les documents de la nature du tier', () => {
    const res = documentsRequisTier('fournisseur', ['go'], matrice);
    expect(res.map((r) => r.natureDocumentId)).toEqual(['kbis']);
  });
});

describe('evaluerConformiteTier', () => {
  const naturesById = new Map<string, NatureDocLite>([
    ['kbis', nature({ id: 'kbis', code: 'KBIS', libelle: 'K-bis', modeControle: 'duree_jours', delaiRelanceJours: 10 })],
    ['urssaf', nature({ id: 'urssaf', code: 'URSSAF', libelle: 'URSSAF', modeControle: 'duree_jours', delaiRelanceJours: 10 })],
    ['ppsps', nature({ id: 'ppsps', code: 'PPSPS', libelle: 'PPSPS', modeControle: 'case_a_cocher', delaiValiditeJours: null, delaiRelanceJours: null })],
  ]);
  const matrice: MatriceLigne[] = [
    { corpsEtatId: 'go', natureDocumentId: 'kbis', natureTiers: 'artisan', estBloquant: true },
    { corpsEtatId: 'go', natureDocumentId: 'urssaf', natureTiers: 'artisan', estBloquant: true },
  ];

  it('classe "à jour" un tier sans corps d\'état (aucune obligation)', () => {
    const res = evaluerConformiteTier({ natureTiers: 'artisan', corpsEtatIds: [] }, matrice, naturesById, new Map(), AUJ);
    expect(res.classe).toBe('a_jour');
    expect(res.lignes).toEqual([]);
    expect(res.nbProblemes).toBe(0);
  });

  it('classe "à relancer" si un document est manquant', () => {
    const docs = new Map<string, DocumentLite>([
      ['kbis', { natureDocumentId: 'kbis', statut: 'valide', dateFinValidite: '2026-12-31' }],
      // urssaf absent
    ]);
    const res = evaluerConformiteTier({ natureTiers: 'artisan', corpsEtatIds: ['go'] }, matrice, naturesById, docs, AUJ);
    expect(res.classe).toBe('a_relancer');
    expect(res.nbProblemes).toBe(1);
    expect(res.lignes.find((l) => l.code === 'URSSAF')?.statut).toBe('manquant');
    // la ligne en problème est triée en tête
    expect(res.lignes[0]?.statut).toBe('manquant');
  });

  it('classe "à jour" si tous les documents requis sont valides', () => {
    const docs = new Map<string, DocumentLite>([
      ['kbis', { natureDocumentId: 'kbis', statut: 'valide', dateFinValidite: '2026-12-31' }],
      ['urssaf', { natureDocumentId: 'urssaf', statut: 'valide', dateFinValidite: '2026-12-31' }],
    ]);
    const res = evaluerConformiteTier({ natureTiers: 'artisan', corpsEtatIds: ['go'] }, matrice, naturesById, docs, AUJ);
    expect(res.classe).toBe('a_jour');
    expect(res.nbProblemes).toBe(0);
    expect(res.lignes).toHaveLength(2);
  });

  it('classe "à relancer" si un document expire bientôt', () => {
    const docs = new Map<string, DocumentLite>([
      ['kbis', { natureDocumentId: 'kbis', statut: 'valide', dateFinValidite: '2026-12-31' }],
      ['urssaf', { natureDocumentId: 'urssaf', statut: 'valide', dateFinValidite: '2026-06-13' }],
    ]);
    const res = evaluerConformiteTier({ natureTiers: 'artisan', corpsEtatIds: ['go'] }, matrice, naturesById, docs, AUJ);
    expect(res.classe).toBe('a_relancer');
    expect(res.lignes.find((l) => l.code === 'URSSAF')?.statut).toBe('a_renouveler');
  });
});
