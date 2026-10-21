import { describe, expect, it } from 'vitest';

import {
  equipeSchema,
  membreEquipeSchema,
  posteSchema,
} from '@/lib/validation/test-sirh/organisation';

const UUID = '3f2b8c1e-6d4a-4e7b-9a1c-2b3c4d5e6f70';
const UUID2 = '8a1d2c3b-4e5f-4a6b-8c7d-9e0f1a2b3c4d';

describe('equipeSchema', () => {
  const valide = {
    nom: '  Équipe gros œuvre ',
    description: '',
    responsableId: UUID,
    siteId: '',
    couleur: '#F59E0B',
    actif: true,
  };

  it('accepte une équipe et normalise les champs vides', () => {
    const r = equipeSchema.safeParse(valide);
    expect(r.success).toBe(true);
    expect(r.data).toMatchObject({
      nom: 'Équipe gros œuvre',
      description: null,
      siteId: null,
      responsableId: UUID,
    });
  });

  it('refuse un nom vide, une couleur invalide ou un responsable non UUID', () => {
    expect(equipeSchema.safeParse({ ...valide, nom: ' ' }).success).toBe(false);
    expect(equipeSchema.safeParse({ ...valide, couleur: 'orange' }).success).toBe(false);
    expect(equipeSchema.safeParse({ ...valide, couleur: '#fff' }).success).toBe(false);
    expect(equipeSchema.safeParse({ ...valide, responsableId: 'x' }).success).toBe(false);
  });
});

describe('membreEquipeSchema', () => {
  const valide = {
    equipeId: UUID,
    employeId: UUID2,
    estResponsable: false,
    dateDebut: '2026-01-01',
    dateFin: null,
  };

  it('accepte un membre sans date de fin', () => {
    expect(membreEquipeSchema.safeParse(valide).success).toBe(true);
    expect(membreEquipeSchema.safeParse({ ...valide, dateDebut: '' }).data?.dateDebut).toBeNull();
  });

  it('refuse une fin antérieure au début ou un collaborateur absent', () => {
    const r = membreEquipeSchema.safeParse({ ...valide, dateFin: '2025-12-31' });
    expect(r.success).toBe(false);
    expect(r.error?.issues[0]?.path).toEqual(['dateFin']);
    expect(membreEquipeSchema.safeParse({ ...valide, employeId: '' }).success).toBe(false);
  });
});

describe('posteSchema', () => {
  const valide = {
    code: 'MAC-N2',
    intitule: 'Maçon',
    famille: 'Gros œuvre',
    categorie: 'ouvrier',
    niveau: 'N2',
    coefficient: '185',
    description: null,
    actif: true,
  };

  it('accepte un poste complet ou sans catégorie', () => {
    expect(posteSchema.safeParse(valide).success).toBe(true);
    expect(posteSchema.safeParse({ ...valide, categorie: null }).success).toBe(true);
  });

  it('refuse un intitulé vide ou une catégorie inconnue', () => {
    expect(posteSchema.safeParse({ ...valide, intitule: '' }).success).toBe(false);
    expect(posteSchema.safeParse({ ...valide, categorie: 'manager' }).success).toBe(false);
    expect(posteSchema.safeParse({ ...valide, code: 'X'.repeat(21) }).success).toBe(false);
  });
});
