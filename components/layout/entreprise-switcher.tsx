'use client';

import { Building2Icon } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

type EntrepriseSwitcherProps = {
  activeSlug: string;
  activeRaisonSociale: string;
  entreprises: Array<{ id: string; slug: string; raisonSociale: string; isDefault: boolean }>;
  currentPathname: string;
};

/**
 * Sélecteur d'entreprise active. Si l'utilisateur n'appartient qu'à une seule
 * entreprise, rend un badge en lecture seule (pas de dropdown). Sinon, propose
 * un Select qui POST le slug à `/api/entreprise/switch` puis navigue vers la
 * même page sous le nouveau slug.
 */
export function EntrepriseSwitcher({
  activeSlug,
  activeRaisonSociale,
  entreprises,
  currentPathname,
}: EntrepriseSwitcherProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [selectedSlug, setSelectedSlug] = useState(activeSlug);

  if (entreprises.length <= 1) {
    return (
      <div className="flex items-center gap-2 rounded-md border bg-muted/40 px-3 py-2 text-sm">
        <Building2Icon className="size-4 shrink-0 text-muted-foreground" />
        <span className="truncate font-medium" title={activeRaisonSociale}>
          {activeRaisonSociale}
        </span>
      </div>
    );
  }

  async function handleChange(newSlug: string) {
    if (newSlug === activeSlug) return;
    setSelectedSlug(newSlug);
    startTransition(async () => {
      const res = await fetch('/api/entreprise/switch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ slug: newSlug }),
      });
      if (!res.ok) {
        setSelectedSlug(activeSlug);
        return;
      }
      // Cas cross-tenant (/admin/..., /select-entreprise, /profile) :
      // ces routes ne contiennent pas de slug à remplacer → on retombe sur le
      // dashboard du nouveau tenant. Sinon, remplacement standard du slug.
      const crossTenant = /^\/(admin|select-entreprise|profile)(\/|$)/.test(currentPathname);
      const newPath = crossTenant
        ? `/${newSlug}/dashboard`
        : currentPathname.replace(/^\/[^/]+/, `/${newSlug}`);
      router.push(newPath);
      router.refresh();
    });
  }

  return (
    <Select
      value={selectedSlug}
      onValueChange={(v) => {
        if (typeof v === 'string') handleChange(v);
      }}
      disabled={isPending}
    >
      <SelectTrigger className="w-full">
        <div className="flex items-center gap-2 min-w-0">
          <Building2Icon className="size-4 shrink-0 text-muted-foreground" />
          <SelectValue placeholder="Choisir une entreprise" />
        </div>
      </SelectTrigger>
      <SelectContent>
        {entreprises.map((e) => (
          <SelectItem key={e.id} value={e.slug}>
            {e.raisonSociale}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
