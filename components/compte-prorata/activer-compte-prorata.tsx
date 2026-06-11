'use client';

import { CalculatorIcon } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

type ServerActionResult = { ok: boolean; error?: string };

type Props = {
  peutEcrire: boolean;
  /** Ouvre le compte prorata du chantier. `fraisGestionPct` en %, ou null. */
  onOuvrir: (fraisGestionPct: number | null) => Promise<ServerActionResult>;
};

export function ActiverCompteProrata({ peutEcrire, onOuvrir }: Props) {
  const router = useRouter();
  const [frais, setFrais] = useState('');
  const [isPending, startTransition] = useTransition();

  function handle() {
    const pct = frais.trim() === '' ? null : Number(frais.replace(',', '.'));
    if (pct != null && (!Number.isFinite(pct) || pct < 0 || pct > 100)) {
      toast.error('Frais de gestion : pourcentage entre 0 et 100.');
      return;
    }
    startTransition(async () => {
      const r = await onOuvrir(pct);
      if (r.ok) {
        toast.success('Compte prorata ouvert');
        router.refresh();
      } else {
        toast.error(r.error ?? 'Erreur');
      }
    });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <CalculatorIcon className="size-5 text-amber-600" />
          Compte prorata
        </CardTitle>
        <CardDescription>
          Mutualisez les dépenses communes de ce chantier (nettoyage, gardiennage, énergie, bennes,
          base-vie…) et répartissez-les entre les intervenants au prorata de leur marché. Le compte
          gestionnaire (votre société) est créé automatiquement.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {peutEcrire ? (
          <div className="flex flex-wrap items-end gap-3">
            <div className="space-y-1">
              <Label htmlFor="frais-gestion" className="text-xs">
                Frais de gestion (%) — optionnel
              </Label>
              <Input
                id="frais-gestion"
                type="number"
                min={0}
                max={100}
                step="0.01"
                inputMode="decimal"
                placeholder="ex. 8"
                value={frais}
                onChange={(e) => setFrais(e.target.value)}
                className="w-40"
              />
            </div>
            <Button onClick={handle} disabled={isPending}>
              Ouvrir le compte prorata
            </Button>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">
            Aucun compte prorata n&apos;est encore ouvert pour ce chantier.
          </p>
        )}
      </CardContent>
    </Card>
  );
}
