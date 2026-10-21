import { describe, expect, it } from 'vitest';

import {
  documentMetadonneesSchema,
  dossierDocumentsSchema,
  televersementDocumentSchema,
} from '@/lib/validation/test-sirh/documents';

const UUID = '3f2b8c1e-6d4a-4e7b-9a1c-2b3c4d5e6f70';

describe('dossierDocumentsSchema', () => {
  it('accepte un dossier et convertit l’ordre', () => {
    const r = dossierDocumentsSchema.safeParse({
      nom: 'Bulletins de paie',
      description: '',
      visibleSalarie: true,
      ordre: '20',
    });
    expect(r.success).toBe(true);
    expect(r.data?.ordre).toBe(20);
    expect(r.data?.description).toBeNull();
  });

  it('refuse un nom vide ou un ordre négatif', () => {
    expect(
      dossierDocumentsSchema.safeParse({
        nom: '',
        description: null,
        visibleSalarie: false,
        ordre: 0,
      }).success,
    ).toBe(false);
    expect(
      dossierDocumentsSchema.safeParse({
        nom: 'Divers',
        description: null,
        visibleSalarie: false,
        ordre: -1,
      }).success,
    ).toBe(false);
  });
});

describe('documentMetadonneesSchema', () => {
  const valide = {
    id: UUID,
    titre: 'Habilitation électrique B1V',
    dossierId: UUID,
    dateDocument: '2026-01-15',
    dateExpiration: '2029-01-15',
    visibleSalarie: true,
    signatureRequise: false,
    notes: null,
  };

  it('accepte des métadonnées complètes', () => {
    expect(documentMetadonneesSchema.safeParse(valide).success).toBe(true);
    expect(documentMetadonneesSchema.parse({ ...valide, dossierId: '' }).dossierId).toBeNull();
  });

  it('refuse une expiration antérieure à la date du document ou un titre vide', () => {
    const r = documentMetadonneesSchema.safeParse({ ...valide, dateExpiration: '2025-12-31' });
    expect(r.success).toBe(false);
    expect(r.error?.issues[0]?.path).toEqual(['dateExpiration']);
    expect(documentMetadonneesSchema.safeParse({ ...valide, titre: ' ' }).success).toBe(false);
  });
});

describe('televersementDocumentSchema', () => {
  const base = {
    cibleType: 'employe' as const,
    employeId: UUID,
    titre: '',
    dossierId: null,
    dateDocument: null,
    dateExpiration: null,
    visibleSalarie: true,
    signatureRequise: true,
    notes: null,
  };

  it('document salarié : collaborateur requis', () => {
    expect(televersementDocumentSchema.safeParse(base).success).toBe(true);
    const r = televersementDocumentSchema.safeParse({ ...base, employeId: null });
    expect(r.success).toBe(false);
    expect(r.error?.issues[0]?.path).toEqual(['employeId']);
  });

  it('document d’entreprise : sans collaborateur', () => {
    expect(
      televersementDocumentSchema.safeParse({ ...base, cibleType: 'entreprise', employeId: null })
        .success,
    ).toBe(true);
  });

  it('titre facultatif (vide → null) et contrôle des dates', () => {
    expect(televersementDocumentSchema.parse(base).titre).toBeNull();
    expect(
      televersementDocumentSchema.safeParse({
        ...base,
        dateDocument: '2026-05-01',
        dateExpiration: '2026-04-30',
      }).success,
    ).toBe(false);
  });
});
