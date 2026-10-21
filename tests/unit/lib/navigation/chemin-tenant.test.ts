import { readdirSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { cheminTenant, MODULES_TENANT } from '@/lib/navigation/chemin-tenant';

describe('cheminTenant', () => {
  it('préfixe un chemin de module métier par le slug', () => {
    expect(cheminTenant('acme', '/catalogue/articles')).toBe('/acme/catalogue/articles');
    expect(cheminTenant('acme', '/tiers')).toBe('/acme/tiers');
    expect(cheminTenant('acme', '/test-sirh/absences/calendrier')).toBe(
      '/acme/test-sirh/absences/calendrier',
    );
  });

  it('conserve la query string et le fragment', () => {
    expect(cheminTenant('acme', '/rh/pointages/saisie?annee=2026&mois=10')).toBe(
      '/acme/rh/pointages/saisie?annee=2026&mois=10',
    );
    expect(cheminTenant('acme', '/chantiers?x=1#haut')).toBe('/acme/chantiers?x=1#haut');
  });

  it('est idempotent sur un chemin déjà préfixé', () => {
    const once = cheminTenant('acme', '/commercial/devis/42');
    expect(cheminTenant('acme', once)).toBe('/acme/commercial/devis/42');
  });

  it('laisse intactes les routes hors tenant', () => {
    expect(cheminTenant('acme', '/profile')).toBe('/profile');
    expect(cheminTenant('acme', '/admin/entreprises')).toBe('/admin/entreprises');
    expect(cheminTenant('acme', '/select-entreprise')).toBe('/select-entreprise');
    expect(cheminTenant('acme', '/')).toBe('/');
  });

  it('ne touche pas aux URL absolues, protocolaires ou relatives', () => {
    expect(cheminTenant('acme', 'https://exemple.fr/catalogue')).toBe(
      'https://exemple.fr/catalogue',
    );
    expect(cheminTenant('acme', '//cdn.exemple.fr/catalogue')).toBe('//cdn.exemple.fr/catalogue');
    expect(cheminTenant('acme', 'catalogue/articles')).toBe('catalogue/articles');
  });

  it('renvoie le chemin tel quel sans slug', () => {
    expect(cheminTenant('', '/catalogue/articles')).toBe('/catalogue/articles');
  });

  it('gère un slug homonyme d’un module', () => {
    // Slug « rh » : `/rh/catalogue` est déjà préfixé, `/rh/employes` est un chemin legacy.
    expect(cheminTenant('rh', '/rh/catalogue/articles')).toBe('/rh/catalogue/articles');
    expect(cheminTenant('rh', '/rh/employes')).toBe('/rh/rh/employes');
  });
});

describe('MODULES_TENANT', () => {
  it('liste exactement les dossiers de module de app/(app)/[entrepriseSlug]', () => {
    // Garde-fou : un nouveau module sans entrée ici garderait des liens legacy
    // (cheminTenant ne le préfixerait pas).
    const racine = join(process.cwd(), 'app', '(app)', '[entrepriseSlug]');
    const dossiers = readdirSync(racine, { withFileTypes: true })
      .filter((d) => d.isDirectory())
      .map((d) => d.name)
      .sort();
    expect([...MODULES_TENANT].sort()).toEqual(dossiers);
  });
});
