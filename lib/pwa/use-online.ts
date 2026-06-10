'use client';

import { useEffect, useState } from 'react';

/**
 * État de connectivité réseau (navigator.onLine + événements online/offline).
 * Initialisé optimiste à `true` pour éviter un flash « hors-ligne » au premier
 * rendu (SSR + hydratation), puis corrigé au montage.
 */
export function useOnline(): boolean {
  const [online, setOnline] = useState(true);

  useEffect(() => {
    setOnline(navigator.onLine);
    const goOnline = () => setOnline(true);
    const goOffline = () => setOnline(false);
    window.addEventListener('online', goOnline);
    window.addEventListener('offline', goOffline);
    return () => {
      window.removeEventListener('online', goOnline);
      window.removeEventListener('offline', goOffline);
    };
  }, []);

  return online;
}
