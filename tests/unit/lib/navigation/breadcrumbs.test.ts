import { describe, expect, it } from 'vitest';

import { buildCrumbs, isIdSegment, libelleSegment } from '@/lib/navigation/breadcrumbs';

describe('buildCrumbs', () => {
  it('skippe le slug d’entreprise (1er segment)', () => {
    const crumbs = buildCrumbs('/acme/facturation/factures', 'acme');
    expect(crumbs.map((c) => c.label)).toEqual(['Facturation', 'Factures']);
  });

  it('le dernier crumb est non cliquable (href null)', () => {
    const crumbs = buildCrumbs('/acme/facturation/factures', 'acme');
    expect(crumbs.at(-1)?.href).toBeNull();
    expect(crumbs[0]?.href).toBe('/acme/facturation');
  });

  it('ignore les segments d’identifiant (UUID, entier)', () => {
    const uuid = '11111111-2222-3333-4444-555555555555';
    const crumbs = buildCrumbs(`/acme/commercial/devis/${uuid}`, 'acme');
    expect(crumbs.map((c) => c.label)).toEqual(['Commercial', 'Devis']);
  });

  it('retourne [] si le 1er segment n’est pas le slug', () => {
    expect(buildCrumbs('/admin/entreprises', 'acme')).toEqual([]);
  });

  it('retourne [] sur la racine du tenant', () => {
    expect(buildCrumbs('/acme', 'acme')).toEqual([]);
  });
});

describe('isIdSegment', () => {
  it('détecte UUID et entiers', () => {
    expect(isIdSegment('11111111-2222-3333-4444-555555555555')).toBe(true);
    expect(isIdSegment('42')).toBe(true);
    expect(isIdSegment('factures')).toBe(false);
  });
});

describe('libelleSegment', () => {
  it('mappe les libellés FR connus, titlecase sinon', () => {
    expect(libelleSegment('facturation')).toBe('Facturation');
    expect(libelleSegment('inconnu')).toBe('Inconnu');
  });
});
