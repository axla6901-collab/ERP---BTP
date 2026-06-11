'use client';

import { DownloadIcon } from 'lucide-react';
import { useTransition } from 'react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import type { FiltresExport } from '@/lib/rh/import-export-types';

type Props = {
  filtres: FiltresExport;
  action: (
    filtres: FiltresExport,
  ) => Promise<{ ok: true; filename: string; csv: string } | { ok: false; error: string }>;
};

export function ExportCsvButton({ filtres, action }: Props) {
  const [isPending, startTransition] = useTransition();

  function handle() {
    startTransition(async () => {
      const r = await action(filtres);
      if (!r.ok) {
        toast.error(r.error);
        return;
      }
      const blob = new Blob([r.csv], { type: 'text/csv;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = r.filename;
      a.click();
      URL.revokeObjectURL(url);
      toast.success('Export CSV téléchargé.');
    });
  }

  return (
    <Button variant="outline" size="sm" onClick={handle} disabled={isPending}>
      <DownloadIcon className="mr-1 size-4" />
      {isPending ? 'Génération…' : 'Exporter CSV'}
    </Button>
  );
}
