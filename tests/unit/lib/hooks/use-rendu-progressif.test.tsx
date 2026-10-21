import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useRenduProgressif } from '@/lib/hooks/use-rendu-progressif';

/** Fait avancer les tranches planifiées (jsdom n'a pas requestIdleCallback :
 *  le hook se replie sur setTimeout, piloté par les faux timers). */
async function avancer(ms: number) {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
}

describe('useRenduProgressif', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('rend d’abord `initial` éléments puis complète par tranches de `pas`', async () => {
    const { result } = renderHook(() => useRenduProgressif(130, { initial: 50, pas: 40 }));
    expect(result.current).toBe(50);
    await avancer(16);
    expect(result.current).toBe(90);
    await avancer(16);
    expect(result.current).toBe(130);
    await avancer(100);
    expect(result.current).toBe(130);
  });

  it('rend tout d’emblée quand la liste est plus courte que `initial`', async () => {
    const { result } = renderHook(() => useRenduProgressif(12, { initial: 50 }));
    expect(result.current).toBe(12);
    await avancer(16);
    expect(result.current).toBe(12);
  });

  it('suit immédiatement un ajout une fois la liste complète', async () => {
    const { result, rerender } = renderHook(
      ({ total }) => useRenduProgressif(total, { initial: 10, pas: 10 }),
      { initialProps: { total: 15 } },
    );
    await avancer(50);
    expect(result.current).toBe(15);
    rerender({ total: 16 });
    expect(result.current).toBe(16);
  });

  it('repart de `initial` quand la clé change (import en bloc)', async () => {
    const { result, rerender } = renderHook(
      ({ total, cle }) => useRenduProgressif(total, { initial: 20, pas: 20, cle }),
      { initialProps: { total: 30, cle: 0 } },
    );
    await avancer(50);
    expect(result.current).toBe(30);
    rerender({ total: 200, cle: 1 });
    expect(result.current).toBe(20);
    await avancer(16);
    expect(result.current).toBe(40);
  });

  it('utilise requestIdleCallback quand il existe', async () => {
    const ric = vi.fn((cb: IdleRequestCallback) => setTimeout(() => cb({} as IdleDeadline), 5));
    const cic = vi.fn((id: number) => clearTimeout(id));
    vi.stubGlobal('requestIdleCallback', ric);
    vi.stubGlobal('cancelIdleCallback', cic);
    try {
      const { result, unmount } = renderHook(() =>
        useRenduProgressif(30, { initial: 10, pas: 10 }),
      );
      await avancer(5);
      expect(ric).toHaveBeenCalled();
      expect(result.current).toBe(20);
      // Démonter avant de retirer les stubs : le nettoyage annule la tranche en attente.
      unmount();
      expect(cic).toHaveBeenCalled();
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
