import { describe, expect, it } from 'vitest';

import {
  CHANTIER_TABS,
  chantierTabsVisibles,
  resolveChantierTab,
} from '@/lib/chantiers/tabs';

describe('chantierTabsVisibles', () => {
  it('exclut l’onglet « Compte prorata » quand le module est inactif', () => {
    const tabs = chantierTabsVisibles({ compteProrataActive: false });
    expect(tabs.some((t) => t.key === 'compte-prorata')).toBe(false);
    // Les onglets non optionnels restent présents.
    expect(tabs.some((t) => t.key === 'informations')).toBe(true);
    expect(tabs.some((t) => t.key === 'devis')).toBe(true);
  });

  it('inclut l’onglet « Compte prorata » quand le module est actif', () => {
    const tabs = chantierTabsVisibles({ compteProrataActive: true });
    expect(tabs.some((t) => t.key === 'compte-prorata')).toBe(true);
    expect(tabs.length).toBe(CHANTIER_TABS.length);
  });
});

describe('resolveChantierTab', () => {
  it('retombe sur informations pour une valeur inconnue ou absente', () => {
    expect(resolveChantierTab('bogus')).toBe('informations');
    expect(resolveChantierTab(undefined)).toBe('informations');
    expect(resolveChantierTab(null)).toBe('informations');
  });

  it('résout un onglet standard', () => {
    expect(resolveChantierTab('devis')).toBe('devis');
    expect(resolveChantierTab('factures')).toBe('factures');
  });

  it('autorise « compte-prorata » seulement si le module est actif (anti deep-link)', () => {
    expect(resolveChantierTab('compte-prorata', { compteProrataActive: true })).toBe(
      'compte-prorata',
    );
    expect(resolveChantierTab('compte-prorata', { compteProrataActive: false })).toBe(
      'informations',
    );
    // Sans flags fournis, l'onglet optionnel est rejeté par sécurité.
    expect(resolveChantierTab('compte-prorata')).toBe('informations');
  });
});
