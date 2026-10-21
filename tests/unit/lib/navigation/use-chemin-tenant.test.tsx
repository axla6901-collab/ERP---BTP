import { renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

let mockParams: Record<string, string> | null = {};

vi.mock('next/navigation', () => ({
  useParams: () => mockParams,
}));

import { useCheminTenant } from '@/lib/navigation/use-chemin-tenant';

describe('useCheminTenant', () => {
  beforeEach(() => {
    mockParams = {};
  });

  it('préfixe avec le slug de l’URL courante', () => {
    mockParams = { entrepriseSlug: 'acme', id: '42' };
    const { result } = renderHook(() => useCheminTenant());
    expect(result.current('/catalogue/articles/42')).toBe('/acme/catalogue/articles/42');
    expect(result.current('/acme/tiers')).toBe('/acme/tiers');
  });

  it('rend les chemins tels quels hors tenant', () => {
    mockParams = {};
    const { result } = renderHook(() => useCheminTenant());
    expect(result.current('/catalogue/articles')).toBe('/catalogue/articles');
  });

  it('supporte des params null (rendu hors App Router)', () => {
    mockParams = null;
    const { result } = renderHook(() => useCheminTenant());
    expect(result.current('/rh')).toBe('/rh');
  });

  it('garde une fonction stable tant que le slug ne change pas', () => {
    mockParams = { entrepriseSlug: 'acme' };
    const { result, rerender } = renderHook(() => useCheminTenant());
    const premiere = result.current;
    rerender();
    expect(result.current).toBe(premiere);
  });
});
