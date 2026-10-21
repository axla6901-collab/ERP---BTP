'use client';

import Link from 'next/link';
import type { ComponentProps } from 'react';

import { useCheminTenant } from '@/lib/navigation/use-chemin-tenant';

/**
 * `next/link` qui préfixe un `href` de module métier par le slug d'entreprise
 * courant (`/catalogue/articles` → `/acme/catalogue/articles`), et laisse tout
 * autre `href` intact. Utilisable depuis un Server Component : il suffit de
 * remplacer `Link` par `LienTenant`, sans avoir à récupérer le slug.
 */
export function LienTenant({ href, ...props }: ComponentProps<typeof Link>) {
  const versTenant = useCheminTenant();
  return <Link href={typeof href === 'string' ? versTenant(href) : href} {...props} />;
}
