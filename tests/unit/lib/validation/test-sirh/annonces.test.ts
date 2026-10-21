import { describe, expect, it } from 'vitest';

import { annonceSchema, epingleAnnonceSchema } from '@/lib/validation/test-sirh/annonces';

const UUID = '3f2b8c1e-6d4a-4e7b-9a1c-2b3c4d5e6f70';

describe('annonceSchema', () => {
  const valide = {
    titre: 'Fermeture estivale du dépôt',
    contenu: 'Le dépôt sera fermé du 3 au 21 août.\nMerci d’anticiper vos retraits.',
    categorie: 'information',
    epinglee: false,
    publiee: true,
    datePublication: '2026-10-19',
    dateExpiration: '',
    siteId: '',
    equipeId: UUID,
  };

  it('accepte une annonce ; vides → null, retours à la ligne conservés', () => {
    const r = annonceSchema.safeParse(valide);
    expect(r.success).toBe(true);
    expect(r.data).toMatchObject({ dateExpiration: null, siteId: null, equipeId: UUID });
    expect(r.data?.contenu).toContain('\n');
  });

  it('refuse un titre ou un contenu vide, une catégorie inconnue', () => {
    expect(annonceSchema.safeParse({ ...valide, titre: ' ' }).success).toBe(false);
    expect(annonceSchema.safeParse({ ...valide, contenu: '' }).success).toBe(false);
    expect(annonceSchema.safeParse({ ...valide, categorie: 'promo' }).success).toBe(false);
  });

  it('borne le contenu à 10 000 caractères', () => {
    expect(annonceSchema.safeParse({ ...valide, contenu: 'a'.repeat(10_000) }).success).toBe(true);
    expect(annonceSchema.safeParse({ ...valide, contenu: 'a'.repeat(10_001) }).success).toBe(false);
  });

  it('exige une expiration postérieure ou égale à la publication (CHECK SQL)', () => {
    expect(annonceSchema.safeParse({ ...valide, dateExpiration: '2026-10-19' }).success).toBe(true);
    const r = annonceSchema.safeParse({ ...valide, dateExpiration: '2026-10-18' });
    expect(r.success).toBe(false);
    expect(r.error?.issues[0]?.path).toEqual(['dateExpiration']);
  });

  it('exige une date de publication valide et une audience UUID', () => {
    expect(annonceSchema.safeParse({ ...valide, datePublication: '' }).success).toBe(false);
    expect(annonceSchema.safeParse({ ...valide, siteId: 'lyon' }).success).toBe(false);
  });
});

describe('epingleAnnonceSchema', () => {
  it('valide l’épinglage', () => {
    expect(epingleAnnonceSchema.safeParse({ id: UUID, epinglee: true }).success).toBe(true);
    expect(epingleAnnonceSchema.safeParse({ id: 'x', epinglee: true }).success).toBe(false);
  });
});
