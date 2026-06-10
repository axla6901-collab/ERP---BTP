'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

type UniteOption = { id: string; code: string; symbole: string };

type Props = {
  defaultPrix: string | null;
  defaultUniteId: string | null;
  /** Si défini : date à laquelle le prix de référence courant est valide (info). */
  defaultValidFrom: string | null;
  unites: UniteOption[];
  action: (input: {
    prixUnitaireHt: string;
    uniteId: string;
  }) => Promise<{ ok: true; data: { id: string } } | { ok: false; error: string; fieldErrors?: Record<string, string[]> }>;
};

export function PrixReferenceQuickForm({
  defaultPrix,
  defaultUniteId,
  defaultValidFrom,
  unites,
  action,
}: Props) {
  const router = useRouter();
  const [prix, setPrix] = useState<string>(defaultPrix ?? '');
  const [uniteId, setUniteId] = useState<string>(defaultUniteId ?? '');
  const [erreur, setErreur] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  // Re-synchronise les champs quand le serveur renvoie de nouvelles valeurs
  // (après `router.refresh()` consécutif à un enregistrement). `useState` ne
  // relit pas ses props après le montage : sans ce garde, le prix affiché et
  // l'état « dirty » restent figés sur l'ancien tarif et la fiche donne
  // l'impression de ne pas s'être mise à jour.
  const [serverSnapshot, setServerSnapshot] = useState({ defaultPrix, defaultUniteId });
  if (
    serverSnapshot.defaultPrix !== defaultPrix ||
    serverSnapshot.defaultUniteId !== defaultUniteId
  ) {
    setServerSnapshot({ defaultPrix, defaultUniteId });
    setPrix(defaultPrix ?? '');
    setUniteId(defaultUniteId ?? '');
  }

  const dirty = prix !== (defaultPrix ?? '') || uniteId !== (defaultUniteId ?? '');

  function handleSubmit() {
    setErreur(null);
    if (!prix.trim()) {
      setErreur('Saisis un prix.');
      return;
    }
    if (!uniteId) {
      setErreur('Choisis une unité.');
      return;
    }
    startTransition(async () => {
      const result = await action({ prixUnitaireHt: prix.replace(',', '.'), uniteId });
      if (!result.ok) {
        setErreur(result.error);
        return;
      }
      toast.success('Prix de référence enregistré');
      router.refresh();
    });
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-end gap-2">
        <div className="grid gap-1">
          <label htmlFor="prix-reference" className="text-xs font-medium text-muted-foreground">
            Prix HT
          </label>
          <Input
            id="prix-reference"
            inputMode="decimal"
            placeholder="0.00"
            value={prix}
            onChange={(e) => setPrix(e.target.value)}
            className="w-32 tabular-nums"
          />
        </div>
        <div className="grid gap-1">
          <label htmlFor="prix-reference-unite" className="text-xs font-medium text-muted-foreground">
            Unité
          </label>
          <Select value={uniteId} onValueChange={(v) => setUniteId(v ?? '')}>
            <SelectTrigger id="prix-reference-unite" className="w-40">
              <SelectValue placeholder="Choisir…">
                {(value) => {
                  if (!value) return 'Choisir…';
                  const u = unites.find((x) => x.id === value);
                  return u ? `${u.code} (${u.symbole})` : String(value);
                }}
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              {unites.map((u) => (
                <SelectItem key={u.id} value={u.id}>
                  {u.code} ({u.symbole})
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <Button type="button" onClick={handleSubmit} disabled={isPending || !dirty}>
          {isPending ? 'Enregistrement…' : 'Enregistrer'}
        </Button>
      </div>
      {defaultValidFrom && (
        <p className="text-xs text-muted-foreground">
          Prix de référence en vigueur depuis le {defaultValidFrom}.
        </p>
      )}
      {erreur && <p className="text-xs text-destructive">{erreur}</p>}
    </div>
  );
}
