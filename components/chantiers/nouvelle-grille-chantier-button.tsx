'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';

import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

type FournisseurOption = { id: string; code: string; nom: string };

type Props = {
  chantierId: string;
  fournisseurs: FournisseurOption[];
};

export function NouvelleGrilleChantierButton({ chantierId, fournisseurs }: Props) {
  const router = useRouter();
  const [fournisseurId, setFournisseurId] = useState<string>('');

  function creer() {
    if (!fournisseurId) return;
    router.push(`/tiers/fournisseurs/${fournisseurId}/grilles/nouveau?chantierId=${chantierId}`);
  }

  if (fournisseurs.length === 0) {
    return (
      <p className="text-xs text-muted-foreground">
        Aucun fournisseur actif. Créez d&apos;abord un fournisseur dans le module Tiers.
      </p>
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Select value={fournisseurId} onValueChange={(v) => setFournisseurId(v ?? '')}>
        <SelectTrigger className="w-72">
          <SelectValue placeholder="Choisir un fournisseur…">
            {(value) => {
              if (!value) return 'Choisir un fournisseur…';
              const f = fournisseurs.find((x) => x.id === value);
              return f ? `${f.code} — ${f.nom}` : String(value);
            }}
          </SelectValue>
        </SelectTrigger>
        <SelectContent>
          {fournisseurs.map((f) => (
            <SelectItem key={f.id} value={f.id}>
              {f.code} — {f.nom}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Button type="button" onClick={creer} disabled={!fournisseurId}>
        + Nouvelle grille pour ce chantier
      </Button>
    </div>
  );
}
