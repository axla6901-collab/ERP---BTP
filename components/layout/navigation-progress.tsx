'use client';

import { usePathname } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';

/**
 * Barre de progression fine en haut de l'écran, déclenchée à chaque
 * navigation interne (clic sur un `<a>` / `<Link>` same-origin) et
 * complétée quand le `pathname` Next.js a changé.
 *
 * Sans dépendance externe, ~3 ko gzippé. À placer dans le `RootLayout`.
 *
 * Limites assumées :
 *   - Ne se déclenche pas pour les navigations purement query-string
 *     (un changement de `?param=` n'est pas perçu comme un page-load).
 *   - Si la navigation est annulée (modifier la même URL), la barre se
 *     terminera tout de même à la prochaine `pathname` change ; sinon
 *     elle reste à 90 % puis disparaîtra au prochain clic — acceptable.
 */
type Etat = 'idle' | 'chargement' | 'fini';

export function NavigationProgress() {
  const pathname = usePathname();
  const [etat, setEtat] = useState<Etat>('idle');
  const [largeur, setLargeur] = useState(0);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pathnameInitial = useRef(pathname);

  // Démarre la barre dès le clic sur un lien interne (avant que Next ne
  // déclenche la navigation), pour combler la fenêtre de latence visuelle.
  useEffect(() => {
    function onClick(event: MouseEvent) {
      // Clic modifié (cmd/ctrl/shift/alt) ou bouton ≠ gauche : nouvelle fenêtre / pas de nav
      if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button !== 0) {
        return;
      }
      const cible = event.target as Element | null;
      const ancre = cible?.closest('a');
      if (!ancre) return;
      const href = ancre.getAttribute('href');
      if (!href || href.startsWith('#') || ancre.target === '_blank') return;
      // Lien `download`, `mailto:`, `tel:` etc. : pas une nav d'app
      if (ancre.hasAttribute('download')) return;
      try {
        const url = new URL(href, window.location.href);
        if (url.origin !== window.location.origin) return;
        // Même chemin & même query : pas de navigation perçue
        if (url.pathname === window.location.pathname && url.search === window.location.search) return;
      } catch {
        return;
      }
      demarrer();
    }
    document.addEventListener('click', onClick, { capture: true });
    return () => document.removeEventListener('click', onClick, { capture: true });
  }, []);

  // Quand `pathname` change après un démarrage : on complète à 100 % puis fade out.
  useEffect(() => {
    if (pathname === pathnameInitial.current) return;
    pathnameInitial.current = pathname;
    if (etat === 'chargement') terminer();
  }, [pathname, etat]);

  function demarrer() {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    setEtat('chargement');
    setLargeur(0);
    // Lance l'animation au prochain frame pour que la transition CSS soit appliquée.
    requestAnimationFrame(() => setLargeur(70));
    // Plateau à 90 % en attendant la fin de navigation (sentiment de quasi-fini).
    timeoutRef.current = setTimeout(() => setLargeur(90), 600);
  }

  function terminer() {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    setLargeur(100);
    setEtat('fini');
    timeoutRef.current = setTimeout(() => {
      setEtat('idle');
      setLargeur(0);
    }, 250);
  }

  if (etat === 'idle') return null;

  return (
    <div aria-hidden="true" className="pointer-events-none fixed inset-x-0 top-0 z-[100] h-0.5">
      <div
        className="h-full bg-primary"
        style={{
          width: `${largeur}%`,
          opacity: etat === 'fini' ? 0 : 1,
          transition:
            etat === 'fini'
              ? 'width 180ms ease-out, opacity 200ms ease-out'
              : 'width 400ms ease-out',
          boxShadow: '0 0 8px currentColor',
        }}
      />
    </div>
  );
}
