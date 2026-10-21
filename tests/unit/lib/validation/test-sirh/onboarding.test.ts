import { describe, expect, it } from 'vitest';

import {
  basculerTacheSchema,
  deplacerModeleTacheSchema,
  lancerProcessusSchema,
  modeleProcessusSchema,
  modeleTacheSchema,
  statutProcessusSchema,
  statutTacheSchema,
  tacheSchema,
} from '@/lib/validation/test-sirh/onboarding';

const UUID = '3f2b8c1e-6d4a-4e7b-9a1c-2b3c4d5e6f70';
const UUID_2 = '8a7d6c5b-4e3f-4a1b-9c2d-1e0f2a3b4c5d';

const messages = (r: { success: boolean; error?: { issues: Array<{ message: string }> } }) =>
  r.error?.issues.map((i) => i.message) ?? [];

describe('modeleProcessusSchema', () => {
  const valide = {
    nom: 'Intégration compagnon BTP',
    typeProcessus: 'onboarding',
    description: '',
    actif: true,
  };

  it('accepte un modèle et normalise la description vide', () => {
    const r = modeleProcessusSchema.safeParse(valide);
    expect(r.success).toBe(true);
    expect(r.data?.description).toBeNull();
  });

  it('refuse un nom vide ou un type inconnu', () => {
    expect(modeleProcessusSchema.safeParse({ ...valide, nom: '  ' }).success).toBe(false);
    expect(modeleProcessusSchema.safeParse({ ...valide, typeProcessus: 'stage' }).success).toBe(
      false,
    );
  });
});

describe('modeleTacheSchema', () => {
  const valide = {
    modeleId: UUID,
    libelle: 'Effectuer la DPAE',
    description: null,
    responsable: 'rh',
    delaiJours: '-3',
  };

  it('convertit le délai saisi en entier', () => {
    const r = modeleTacheSchema.safeParse(valide);
    expect(r.success).toBe(true);
    expect(r.data?.delaiJours).toBe(-3);
  });

  it('borne le délai entre −365 et +365 (CHECK SQL)', () => {
    expect(modeleTacheSchema.safeParse({ ...valide, delaiJours: 365 }).success).toBe(true);
    expect(modeleTacheSchema.safeParse({ ...valide, delaiJours: -366 }).success).toBe(false);
    expect(modeleTacheSchema.safeParse({ ...valide, delaiJours: '2.5' }).success).toBe(false);
    expect(modeleTacheSchema.safeParse({ ...valide, delaiJours: '' }).success).toBe(false);
  });

  it('refuse un responsable inconnu ou un modèle invalide', () => {
    expect(modeleTacheSchema.safeParse({ ...valide, responsable: 'direction' }).success).toBe(
      false,
    );
    expect(modeleTacheSchema.safeParse({ ...valide, modeleId: 'abc' }).success).toBe(false);
  });

  it('déplacement : sens haut / bas uniquement', () => {
    expect(deplacerModeleTacheSchema.safeParse({ id: UUID, sens: 'haut' }).success).toBe(true);
    expect(deplacerModeleTacheSchema.safeParse({ id: UUID, sens: 'gauche' }).success).toBe(false);
  });
});

describe('lancerProcessusSchema', () => {
  const valide = {
    modeleId: UUID,
    employeId: UUID_2,
    dateReference: '2026-11-02',
    libelle: 'Intégration compagnon BTP — Jean Dupont',
    assignationAuto: true,
  };

  it('accepte un lancement complet', () => {
    expect(lancerProcessusSchema.safeParse(valide).success).toBe(true);
  });

  it('exige un modèle et un collaborateur choisis (messages explicites)', () => {
    const r = lancerProcessusSchema.safeParse({ ...valide, modeleId: '', employeId: null });
    expect(r.success).toBe(false);
    expect(messages(r)).toEqual(
      expect.arrayContaining(['Choisissez un modèle.', 'Choisissez un collaborateur.']),
    );
  });

  it('exige une date de référence ISO et un libellé', () => {
    expect(
      lancerProcessusSchema.safeParse({ ...valide, dateReference: '02/11/2026' }).success,
    ).toBe(false);
    expect(lancerProcessusSchema.safeParse({ ...valide, libelle: '' }).success).toBe(false);
  });

  it('statut de processus', () => {
    expect(statutProcessusSchema.safeParse({ id: UUID, statut: 'termine' }).success).toBe(true);
    expect(statutProcessusSchema.safeParse({ id: UUID, statut: 'clos' }).success).toBe(false);
  });
});

describe('tacheSchema', () => {
  const valide = {
    processusId: '',
    employeId: UUID,
    libelle: 'Commander la carte BTP',
    description: '',
    responsable: 'rh',
    assigneA: 'k9XbQ2user',
    echeance: '2026-10-30',
  };

  it('accepte une tâche autonome ; identifiants vides → null', () => {
    const r = tacheSchema.safeParse(valide);
    expect(r.success).toBe(true);
    expect(r.data).toMatchObject({
      processusId: null,
      employeId: UUID,
      description: null,
      assigneA: 'k9XbQ2user',
      echeance: '2026-10-30',
    });
  });

  it('assigné et échéance optionnels', () => {
    const r = tacheSchema.safeParse({ ...valide, assigneA: '', echeance: '' });
    expect(r.success).toBe(true);
    expect(r.data).toMatchObject({ assigneA: null, echeance: null });
  });

  it('refuse un libellé vide ou une échéance invalide', () => {
    expect(tacheSchema.safeParse({ ...valide, libelle: '' }).success).toBe(false);
    expect(tacheSchema.safeParse({ ...valide, echeance: '30/10/2026' }).success).toBe(false);
    expect(tacheSchema.safeParse({ ...valide, processusId: 'pas-un-uuid' }).success).toBe(false);
  });

  it('avancement : bascule et statut', () => {
    expect(basculerTacheSchema.safeParse({ id: UUID, faite: true }).success).toBe(true);
    expect(basculerTacheSchema.safeParse({ id: UUID, faite: 'oui' }).success).toBe(false);
    expect(statutTacheSchema.safeParse({ id: UUID, statut: 'en_cours' }).success).toBe(true);
    expect(statutTacheSchema.safeParse({ id: UUID, statut: 'terminee' }).success).toBe(false);
  });
});
