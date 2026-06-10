'use client';

import { MapPinIcon, XIcon } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useTransition } from 'react';

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

type ChantierOption = { id: string; numero: string; libelle: string };

/**
 * Contrôle du « fil rouge » contexte chantier (maquette catalogue) :
 *  - chantier actif → bandeau ambre « Articles priorisés pour … » + bouton Retirer ;
 *  - sinon → sélecteur discret pour activer un contexte.
 *
 * Pose / efface le cookie via `POST /api/chantier/switch`, puis `router.refresh()`
 * (le cookie est httpOnly : l'état actif est rendu côté serveur).
 */
export function ChantierContexte({
  actif,
  chantiers,
}: {
  actif: ChantierOption | null;
  chantiers: ChantierOption[];
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  function setChantier(chantierId: string | null) {
    startTransition(async () => {
      const res = await fetch('/api/chantier/switch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chantierId }),
      });
      if (res.ok) router.refresh();
    });
  }

  if (actif) {
    return (
      <div className="flex flex-wrap items-center gap-3 rounded-lg border border-amber-200 bg-amber-50/60 px-4 py-2.5 text-sm dark:border-amber-900/50 dark:bg-amber-950/20">
        <span className="inline-flex items-center gap-1 rounded bg-amber-500/10 px-2 py-0.5 text-xs font-medium text-amber-800 dark:text-amber-300">
          <MapPinIcon className="size-3.5" aria-hidden="true" />
          Contexte chantier
        </span>
        <span className="text-neutral-700 dark:text-neutral-300">
          Articles filtrés en priorité pour{' '}
          <span className="font-semibold text-amber-800 dark:text-amber-300">
            {actif.numero} — {actif.libelle}
          </span>
        </span>
        <span className="hidden text-xs text-muted-foreground md:inline">
          · basé sur les devis liés et l&apos;historique des bons de commande
        </span>
        <button
          type="button"
          onClick={() => setChantier(null)}
          disabled={isPending}
          className="ml-auto inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground disabled:opacity-50"
        >
          <XIcon className="size-3.5" aria-hidden="true" /> Retirer
        </button>
      </div>
    );
  }

  if (chantiers.length === 0) return null;

  return (
    <Select
      onValueChange={(v) => {
        if (typeof v === 'string' && v) setChantier(v);
      }}
      disabled={isPending}
    >
      <SelectTrigger className="h-9 w-auto gap-2 text-xs text-muted-foreground" aria-label="Activer un contexte chantier">
        <MapPinIcon className="size-3.5" aria-hidden="true" />
        <SelectValue placeholder="Contexte chantier…" />
      </SelectTrigger>
      <SelectContent>
        {chantiers.map((c) => (
          <SelectItem key={c.id} value={c.id}>
            {c.numero} — {c.libelle}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
