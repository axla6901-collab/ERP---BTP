'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { enregistrerMatriceEngagement } from '@/lib/referencement/matrice-engagement';
import {
  LIBELLES_NATURE_TIERS,
  LIBELLES_TYPE_ENGAGEMENT,
  NATURES_TIERS,
  TYPES_ENGAGEMENT,
  type NatureTiers,
  type TypeEngagement,
} from '@/lib/validation/referencement-tiers';

type Cellule = { natureTiers: NatureTiers; typeEngagement: TypeEngagement; autorise: boolean };

const cle = (n: NatureTiers, t: TypeEngagement) => `${n}|${t}`;

type Props = {
  initial: Cellule[];
  peutEcrire: boolean;
};

export function MatriceEngagementEditor({ initial, peutEcrire }: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [etat, setEtat] = useState<Record<string, boolean>>(() => {
    const e: Record<string, boolean> = {};
    for (const n of NATURES_TIERS)
      for (const t of TYPES_ENGAGEMENT) e[cle(n, t)] = false;
    for (const c of initial) e[cle(c.natureTiers, c.typeEngagement)] = c.autorise;
    return e;
  });

  function toggle(n: NatureTiers, t: TypeEngagement, v: boolean) {
    setEtat((prev) => ({ ...prev, [cle(n, t)]: v }));
  }

  function enregistrer() {
    const cellules: Cellule[] = [];
    for (const n of NATURES_TIERS)
      for (const t of TYPES_ENGAGEMENT)
        cellules.push({ natureTiers: n, typeEngagement: t, autorise: etat[cle(n, t)] ?? false });
    startTransition(async () => {
      const r = await enregistrerMatriceEngagement(cellules);
      if (!r.ok) toast.error(r.error);
      else {
        toast.success('Matrice enregistrée');
        router.refresh();
      }
    });
  }

  return (
    <div className="space-y-4">
      <div className="overflow-x-auto rounded-lg border">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="border-b bg-muted/40">
              <th className="p-3 text-left font-medium">Nature du tiers</th>
              {TYPES_ENGAGEMENT.map((t) => (
                <th key={t} className="p-3 text-center font-medium">
                  {LIBELLES_TYPE_ENGAGEMENT[t]}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {NATURES_TIERS.map((n) => (
              <tr key={n} className="border-b last:border-0">
                <td className="p-3 font-medium">{LIBELLES_NATURE_TIERS[n]}</td>
                {TYPES_ENGAGEMENT.map((t) => (
                  <td key={t} className="p-3 text-center">
                    <Switch
                      checked={etat[cle(n, t)] ?? false}
                      disabled={!peutEcrire}
                      onCheckedChange={(v) => toggle(n, t, v)}
                      aria-label={`${LIBELLES_NATURE_TIERS[n]} autorisé pour ${LIBELLES_TYPE_ENGAGEMENT[t]}`}
                    />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {peutEcrire && (
        <div className="flex justify-end">
          <Button type="button" size="sm" disabled={isPending} onClick={enregistrer}>
            {isPending ? 'Enregistrement…' : 'Enregistrer la matrice'}
          </Button>
        </div>
      )}
    </div>
  );
}
