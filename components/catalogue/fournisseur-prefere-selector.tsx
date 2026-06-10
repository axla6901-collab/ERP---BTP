'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

type FournisseurOption = { id: string; code: string; nom: string };

type Props = {
  articleId: string;
  fournisseurPrefereId: string | null;
  fournisseursDisponibles: FournisseurOption[];
  action: (
    articleId: string,
    fournisseurId: string | null,
  ) => Promise<{ ok: boolean; error?: string }>;
};

export function FournisseurPrefereSelector({
  articleId,
  fournisseurPrefereId,
  fournisseursDisponibles,
  action,
}: Props) {
  const router = useRouter();
  const [value, setValue] = useState<string>(fournisseurPrefereId ?? '__none__');
  const [isPending, startTransition] = useTransition();

  function handleChange(next: string | null) {
    const v = next ?? '__none__';
    setValue(v);
    startTransition(async () => {
      const r = await action(articleId, v === '__none__' ? null : v);
      if (r.ok) {
        toast.success('Fournisseur préféré mis à jour');
        router.refresh();
      } else {
        toast.error(r.error ?? 'Erreur');
        setValue(fournisseurPrefereId ?? '__none__');
      }
    });
  }

  return (
    <div className="grid max-w-md gap-2">
      <label className="text-sm font-medium">Fournisseur préféré (utilisé en priorité)</label>
      <Select value={value} onValueChange={handleChange} disabled={isPending}>
        <SelectTrigger>
          <SelectValue placeholder="Aucun (utiliser la référence)">
            {(v) => {
              if (!v || v === '__none__') return 'Aucun (utiliser la référence générique)';
              const f = fournisseursDisponibles.find((x) => x.id === v);
              return f ? `${f.code} — ${f.nom}` : String(v);
            }}
          </SelectValue>
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="__none__">Aucun (utiliser la référence générique)</SelectItem>
          {fournisseursDisponibles.map((f) => (
            <SelectItem key={f.id} value={f.id}>
              {f.code} — {f.nom}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <p className="text-xs text-muted-foreground">
        Le calcul de prix de revient utilisera ce fournisseur en priorité, puis la référence générique, puis le moins cher.
      </p>
    </div>
  );
}
