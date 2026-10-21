import '@testing-library/jest-dom/vitest';

import { cleanup, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { DEV_SW_CLEAN_KEY, DevServiceWorkerKiller, devSwCleanup } from '@/lib/pwa/dev-sw-killer';

/** Laisse se résoudre les microtâches/macrotâches en attente. */
const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

let reloadMock: ReturnType<typeof vi.fn>;
let originalServiceWorker: PropertyDescriptor | undefined;

function makeRegistration(): ServiceWorkerRegistration {
  return { unregister: vi.fn().mockResolvedValue(true) } as unknown as ServiceWorkerRegistration;
}

/** Pose un faux `navigator.serviceWorker` renvoyant `regs`. */
function setRegistrations(regs: ServiceWorkerRegistration[]): void {
  Object.defineProperty(navigator, 'serviceWorker', {
    configurable: true,
    value: { getRegistrations: vi.fn().mockResolvedValue(regs) },
  });
}

beforeEach(() => {
  sessionStorage.clear();
  reloadMock = vi.fn();
  // `location` est un global ; on le remplace pour intercepter reload().
  vi.stubGlobal('location', { reload: reloadMock });
  originalServiceWorker = Object.getOwnPropertyDescriptor(navigator, 'serviceWorker');
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  if (originalServiceWorker) {
    Object.defineProperty(navigator, 'serviceWorker', originalServiceWorker);
  } else {
    delete (navigator as { serviceWorker?: unknown }).serviceWorker;
  }
});

describe('devSwCleanup', () => {
  it('ne fait rien si serviceWorker est absent du navigateur', async () => {
    // jsdom ne définit pas navigator.serviceWorker par défaut.
    delete (navigator as { serviceWorker?: unknown }).serviceWorker;
    expect(() => devSwCleanup()).not.toThrow();
    await flush();
    expect(reloadMock).not.toHaveBeenCalled();
  });

  it('ne recharge pas quand aucun SW résiduel n’est enregistré', async () => {
    setRegistrations([]);
    devSwCleanup();
    await flush();
    expect(reloadMock).not.toHaveBeenCalled();
    expect(sessionStorage.getItem(DEV_SW_CLEAN_KEY)).toBeNull();
  });

  it('désinscrit le SW, purge TOUS les caches, incrémente le compteur et recharge une fois', async () => {
    const reg = makeRegistration();
    setRegistrations([reg]);
    const cacheDelete = vi.fn().mockResolvedValue(true);
    vi.stubGlobal('caches', {
      keys: vi.fn().mockResolvedValue(['erp-btp-v1-static', 'erp-btp-v1-shell', 'autre-app-cache']),
      delete: cacheDelete,
    });

    devSwCleanup();
    await flush();
    await flush();

    expect(reg.unregister).toHaveBeenCalledTimes(1);
    // Purge complète (robuste si le SW vient d'une autre app du même origin).
    expect(cacheDelete).toHaveBeenCalledWith('erp-btp-v1-static');
    expect(cacheDelete).toHaveBeenCalledWith('erp-btp-v1-shell');
    expect(cacheDelete).toHaveBeenCalledWith('autre-app-cache');
    expect(sessionStorage.getItem(DEV_SW_CLEAN_KEY)).toBe('1');
    expect(reloadMock).toHaveBeenCalledTimes(1);
  });

  it('attend la purge des caches AVANT de recharger (pas de course)', async () => {
    const reg = makeRegistration();
    setRegistrations([reg]);
    let cachesCleared = false;
    vi.stubGlobal('caches', {
      keys: vi.fn().mockResolvedValue(['erp-btp-v1-static']),
      delete: vi.fn(
        () =>
          new Promise<boolean>((resolve) =>
            setTimeout(() => {
              cachesCleared = true;
              resolve(true);
            }, 10),
          ),
      ),
    });
    // reload ne doit être appelé qu'une fois la purge (lente) terminée.
    reloadMock.mockImplementation(() => {
      expect(cachesCleared).toBe(true);
    });

    devSwCleanup();
    await new Promise((resolve) => setTimeout(resolve, 30));

    expect(reloadMock).toHaveBeenCalledTimes(1);
    expect(cachesCleared).toBe(true);
  });

  it('retente une 2e fois si un SW persiste mais abandonne au-delà du maximum', async () => {
    const getRegistrations = vi.fn().mockResolvedValue([makeRegistration()]);
    Object.defineProperty(navigator, 'serviceWorker', {
      configurable: true,
      value: { getRegistrations },
    });

    // 1re tentative (compteur déjà à 1) → autorisée, recharge.
    sessionStorage.setItem(DEV_SW_CLEAN_KEY, '1');
    devSwCleanup();
    await flush();
    await flush();
    expect(getRegistrations).toHaveBeenCalledTimes(1);
    expect(reloadMock).toHaveBeenCalledTimes(1);
    expect(sessionStorage.getItem(DEV_SW_CLEAN_KEY)).toBe('2');

    // Compteur au maximum → abandon : ni getRegistrations ni reload.
    devSwCleanup();
    await flush();
    expect(getRegistrations).toHaveBeenCalledTimes(1);
    expect(reloadMock).toHaveBeenCalledTimes(1);
  });

  it('réarme le compteur quand l’état redevient propre (aucun SW)', async () => {
    sessionStorage.setItem(DEV_SW_CLEAN_KEY, '1');
    setRegistrations([]);

    devSwCleanup();
    await flush();

    expect(reloadMock).not.toHaveBeenCalled();
    expect(sessionStorage.getItem(DEV_SW_CLEAN_KEY)).toBeNull();
  });

  it('avale les erreurs de getRegistrations sans planter ni recharger', async () => {
    Object.defineProperty(navigator, 'serviceWorker', {
      configurable: true,
      value: { getRegistrations: vi.fn().mockRejectedValue(new Error('boom')) },
    });

    expect(() => devSwCleanup()).not.toThrow();
    await flush();
    expect(reloadMock).not.toHaveBeenCalled();
  });

  it('continue vers getRegistrations même si sessionStorage throw (mode privé strict)', async () => {
    const reg = makeRegistration();
    const getRegistrations = vi.fn().mockResolvedValue([reg]);
    Object.defineProperty(navigator, 'serviceWorker', {
      configurable: true,
      value: { getRegistrations },
    });
    // En mode privé strict, getItem ET setItem lèvent : le compteur est perdu,
    // mais la purge + désinscription suffisent (au tour suivant, plus de SW).
    vi.stubGlobal('sessionStorage', {
      getItem: vi.fn(() => {
        throw new Error('private mode');
      }),
      setItem: vi.fn(() => {
        throw new Error('private mode');
      }),
    });

    expect(() => devSwCleanup()).not.toThrow();
    await flush();
    await flush();

    expect(getRegistrations).toHaveBeenCalledTimes(1);
    expect(reg.unregister).toHaveBeenCalledTimes(1);
    expect(reloadMock).toHaveBeenCalledTimes(1);
  });

  it('garde le littéral interne synchronisé avec DEV_SW_CLEAN_KEY (anti-dérive)', () => {
    // devSwCleanup ne peut pas référencer la const (sérialisée via .toString()) :
    // ce test échoue si le littéral hardcodé diverge de la const exportée.
    expect(devSwCleanup.toString()).toContain(DEV_SW_CLEAN_KEY);
  });
});

describe('DevServiceWorkerKiller', () => {
  it('rend un <script> inline contenant la logique en dev', () => {
    const { container } = render(<DevServiceWorkerKiller />);
    const script = container.querySelector('script');
    expect(script).not.toBeNull();
    expect(script?.innerHTML).toContain('getRegistrations');
    expect(script?.innerHTML).toContain(DEV_SW_CLEAN_KEY);
    // Le script est bien une IIFE auto-invoquée.
    expect(script?.innerHTML.trim().endsWith(')();')).toBe(true);
  });

  it('ne rend rien en production', () => {
    vi.stubEnv('NODE_ENV', 'production');
    const { container } = render(<DevServiceWorkerKiller />);
    expect(container.querySelector('script')).toBeNull();
  });
});
