import { ChevronRightIcon } from 'lucide-react';
import Link from 'next/link';

import { Card } from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import type { PlanningChantierSommaire } from '@/lib/planning/planning';
import { COULEURS_STATUT, LIBELLES_STATUT, formaterPeriode } from '@/lib/planning/statut-labels';

/**
 * Tableau « Liste » du planning : une ligne par chantier ayant un planning.
 * Chaque ligne renvoie au diagramme de Gantt complet (éditable) du chantier.
 */
export function PlanningListeTable({
  chantiers,
  entrepriseSlug,
}: {
  chantiers: PlanningChantierSommaire[];
  entrepriseSlug: string;
}) {
  return (
    <Card className="overflow-hidden">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-[140px]">N°</TableHead>
            <TableHead>Libellé</TableHead>
            <TableHead className="w-[120px]">Statut</TableHead>
            <TableHead className="w-[220px]">Période prévue</TableHead>
            <TableHead className="w-[160px]">Avancement</TableHead>
            <TableHead className="w-[40px]" />
          </TableRow>
        </TableHeader>
        <TableBody>
          {chantiers.map((c) => (
            <TableRow key={c.id} className="group cursor-pointer hover:bg-muted/40">
              <TableCell className="font-mono text-xs">
                <Link href={`/${entrepriseSlug}/chantiers/${c.id}/planning`} className="block py-1">
                  {c.numero}
                </Link>
              </TableCell>
              <TableCell>
                <Link
                  href={`/${entrepriseSlug}/chantiers/${c.id}/planning`}
                  className="block py-1 font-medium hover:text-primary"
                >
                  {c.libelle}
                </Link>
              </TableCell>
              <TableCell>
                <span className={`rounded-full px-2 py-0.5 text-xs ${COULEURS_STATUT[c.statut]}`}>
                  {LIBELLES_STATUT[c.statut]}
                </span>
              </TableCell>
              <TableCell className="text-sm tabular-nums text-muted-foreground">
                {formaterPeriode(c.dateDebutPrevue, c.dateFinPrevue)}
              </TableCell>
              <TableCell>
                {c.avancementPourcent === null ? (
                  <span className="text-xs text-muted-foreground">—</span>
                ) : (
                  <div className="flex items-center gap-2">
                    <div
                      className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted"
                      role="progressbar"
                      aria-valuenow={c.avancementPourcent}
                      aria-valuemin={0}
                      aria-valuemax={100}
                      aria-label={`Avancement ${c.avancementPourcent}%`}
                    >
                      <div
                        className="h-full bg-primary transition-all"
                        style={{ width: `${c.avancementPourcent}%` }}
                      />
                    </div>
                    <span className="w-9 shrink-0 text-right text-xs tabular-nums text-muted-foreground">
                      {c.avancementPourcent}%
                    </span>
                  </div>
                )}
              </TableCell>
              <TableCell>
                <Link
                  href={`/${entrepriseSlug}/chantiers/${c.id}/planning`}
                  className="block py-1 text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:text-foreground"
                  aria-label={`Ouvrir le planning de ${c.libelle}`}
                >
                  <ChevronRightIcon className="size-4" />
                </Link>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </Card>
  );
}
