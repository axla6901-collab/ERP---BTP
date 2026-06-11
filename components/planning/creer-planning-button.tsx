'use client';

import { PlusIcon, SearchIcon } from 'lucide-react';
import Link from 'next/link';
import { useMemo, useState } from 'react';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import type { PlanningChantierSommaire } from '@/lib/planning/planning';

const LIBELLES_STATUT: Record<PlanningChantierSommaire['statut'], string> = {
  prospect: 'Prospect',
  en_cours: 'En cours',
  suspendu: 'Suspendu',
  termine: 'Terminé',
  annule: 'Annulé',
};

function normaliser(s: string): string {
  return s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
}

type Props = {
  /** Chantiers du tenant n'ayant aucune tâche planning (= pas encore de planning). */
  chantiersSansPlanning: PlanningChantierSommaire[];
  entrepriseSlug: string;
};

/**
 * Bouton « Créer un planning » : ouvre une modale qui liste les chantiers sans
 * planning et permet de naviguer vers leur diagramme de Gantt pour démarrer la
 * première tâche.
 *
 * - Désactivé si aucun chantier n'est éligible (déjà tous planifiés, ou aucun
 *   chantier dans l'entreprise).
 * - La création effective des tâches se fait depuis la page Gantt du chantier
 *   (la lib planning ne sait pas créer de planning « vide »).
 */
export function CreerPlanningButton({ chantiersSansPlanning, entrepriseSlug }: Props) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');

  const filtres = useMemo(() => {
    const q = normaliser(query.trim());
    if (q.length === 0) return chantiersSansPlanning;
    return chantiersSansPlanning.filter((c) => normaliser(`${c.numero} ${c.libelle}`).includes(q));
  }, [chantiersSansPlanning, query]);

  const disabled = chantiersSansPlanning.length === 0;
  const titre = disabled
    ? 'Tous les chantiers ont déjà un planning'
    : 'Créer un planning pour un chantier';

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={
          <Button type="button" disabled={disabled} title={titre} className="gap-2">
            <PlusIcon className="size-4" aria-hidden="true" />
            Créer un planning
          </Button>
        }
      />
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Créer un planning</DialogTitle>
          <DialogDescription>
            Choisis un chantier sans planning pour démarrer son diagramme de Gantt. La première
            tâche se crée depuis la page du chantier.
          </DialogDescription>
        </DialogHeader>

        <div className="relative">
          <SearchIcon
            className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
            aria-hidden="true"
          />
          <Input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Rechercher un chantier…"
            className="pl-8"
            aria-label="Rechercher un chantier"
          />
        </div>

        <ul
          className="max-h-72 divide-y overflow-y-auto rounded-md border"
          aria-label="Chantiers sans planning"
        >
          {filtres.length === 0 ? (
            <li className="p-4 text-center text-sm text-muted-foreground">
              {query ? `Aucun résultat pour « ${query} ».` : 'Aucun chantier disponible.'}
            </li>
          ) : (
            filtres.map((c) => (
              <li key={c.id}>
                <Link
                  href={`/${entrepriseSlug}/chantiers/${c.id}/planning`}
                  className="flex items-center justify-between gap-3 px-3 py-2 text-sm transition-colors hover:bg-muted/50 focus:bg-muted/50 focus:outline-none"
                  onClick={() => setOpen(false)}
                >
                  <span className="flex items-baseline gap-2 truncate">
                    <span className="font-mono text-xs text-muted-foreground">{c.numero}</span>
                    <span className="truncate font-medium">{c.libelle}</span>
                  </span>
                  <span className="shrink-0 rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
                    {LIBELLES_STATUT[c.statut]}
                  </span>
                </Link>
              </li>
            ))
          )}
        </ul>
      </DialogContent>
    </Dialog>
  );
}
