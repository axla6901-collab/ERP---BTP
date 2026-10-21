'use client';

import { useParams } from 'next/navigation';
import { useCallback } from 'react';

import { cheminTenant } from './chemin-tenant';

/**
 * Variante client de `cheminTenant` : le slug est lu dans l'URL courante
 * (`/[entrepriseSlug]/…`). Hors tenant (console super-admin, profil), il n'y a
 * pas de slug et les chemins sont rendus tels quels.
 *
 * @example
 *   const versTenant = useCheminTenant();
 *   router.push(versTenant(successRedirect));
 */
export function useCheminTenant(): (chemin: string) => string {
  const params = useParams<{ entrepriseSlug?: string }>();
  const slug = typeof params?.entrepriseSlug === 'string' ? params.entrepriseSlug : '';
  return useCallback((chemin: string) => cheminTenant(slug, chemin), [slug]);
}
