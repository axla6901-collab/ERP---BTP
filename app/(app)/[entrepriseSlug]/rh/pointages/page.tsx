import Link from 'next/link';
import { SmartphoneIcon } from 'lucide-react';

import { PageToolbar } from '@/components/layout/page-toolbar';
import { ExportCsvButton } from '@/components/rh/export-csv-button';
import { buttonVariants } from '@/components/ui/button';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { cn } from '@/lib/utils';
import { requireAuthWithMfa } from '@/lib/auth/guards';
import { exporterPointagesCSV } from '@/lib/rh/import-export';
import { listerPointagesMois } from '@/lib/rh/pointages';
import {
  LIBELLES_MOTIF_ABSENCE,
  LIBELLES_TYPE_POINTAGE,
  type MotifAbsence,
  type TypePointage,
} from '@/lib/validation/rh';

export default async function PointagesPage({
  params,
  searchParams,
}: {
  params: Promise<{ entrepriseSlug: string }>;
  searchParams: Promise<{ annee?: string; mois?: string }>;
}) {
  await requireAuthWithMfa();
  const { entrepriseSlug } = await params;
  const sp = await searchParams;
  const now = new Date();
  const annee = sp.annee ? Number(sp.annee) : now.getFullYear();
  const mois = sp.mois ? Number(sp.mois) : now.getMonth() + 1;
  const items = await listerPointagesMois(annee, mois);

  const totalHeures = items
    .filter((p) => p.type === 'heures')
    .reduce((s, p) => s + Number(p.quantite), 0);

  const dateMin = `${annee}-${String(mois).padStart(2, '0')}-01`;
  const lastDay = new Date(annee, mois, 0).getDate();
  const dateMax = `${annee}-${String(mois).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;

  return (
    <div className="space-y-6">
      <PageToolbar
        title={`Pointages — ${String(mois).padStart(2, '0')}/${annee}`}
        subtitle={`${items.length} pointage(s) · Total ${totalHeures.toLocaleString('fr-FR', { maximumFractionDigits: 1 })} h`}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Link
              href={`/${entrepriseSlug}/rh/pointages/terrain`}
              className={cn(buttonVariants({ variant: 'outline', size: 'sm' }), 'gap-1.5')}
            >
              <SmartphoneIcon className="size-4" />
              Pointage terrain
            </Link>
            <ExportCsvButton
              filtres={{ dateMin, dateMax }}
              action={async (filtres) => {
                'use server';
                return exporterPointagesCSV(filtres);
              }}
            />
          </div>
        }
      />

      <form method="get" className="flex flex-wrap items-end gap-3 rounded-xl border bg-card p-3">
        <label className="flex flex-col gap-1 text-xs">
          <span className="text-muted-foreground">Mois</span>
          <select
            name="mois"
            defaultValue={mois}
            className="rounded border bg-background px-2 py-1.5 text-sm"
          >
            {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => (
              <option key={m} value={m}>
                {String(m).padStart(2, '0')}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-xs">
          <span className="text-muted-foreground">Année</span>
          <select
            name="annee"
            defaultValue={annee}
            className="rounded border bg-background px-2 py-1.5 text-sm"
          >
            {[annee - 2, annee - 1, annee, annee + 1, annee + 2].map((y) => (
              <option key={y} value={y}>
                {y}
              </option>
            ))}
          </select>
        </label>
        <button
          className="rounded border bg-muted px-3 py-1.5 text-sm hover:bg-muted/80"
          type="submit"
        >
          Filtrer
        </button>
      </form>

      {items.length === 0 ? (
        <div className="rounded-xl border border-dashed bg-card p-8 text-center text-sm text-muted-foreground">
          Aucun pointage pour cette période.
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border bg-card shadow-sm">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Date</TableHead>
                <TableHead>Employé</TableHead>
                <TableHead>Chantier</TableHead>
                <TableHead>Type</TableHead>
                <TableHead className="text-right">Quantité</TableHead>
                <TableHead>Motif / Notes</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.map((p) => (
                <TableRow key={p.id}>
                  <TableCell className="font-mono text-xs">{p.datePointage}</TableCell>
                  <TableCell>
                    {p.employeNom} {p.employePrenom}
                  </TableCell>
                  <TableCell className="text-xs">
                    {p.chantierNumero ? (
                      <>
                        <span className="font-mono text-muted-foreground">{p.chantierNumero}</span>{' '}
                        {p.chantierLibelle}
                      </>
                    ) : (
                      <span className="italic text-muted-foreground">—</span>
                    )}
                  </TableCell>
                  <TableCell className="text-xs">
                    {LIBELLES_TYPE_POINTAGE[p.type as TypePointage]}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">{p.quantite}</TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {p.motifAbsence
                      ? LIBELLES_MOTIF_ABSENCE[p.motifAbsence as MotifAbsence]
                      : (p.notes ?? '')}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
