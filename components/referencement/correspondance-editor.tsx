'use client';

import { useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { enregistrerCorrespondance } from '@/lib/referencement/correspondance';
import {
  LIBELLES_NATURE_TIERS,
  NATURES_TIERS,
  type NatureTiers,
} from '@/lib/validation/referencement-tiers';

type CorpsEtatLite = { id: string; code: string; libelle: string };
type NatureLite = { id: string; code: string; libelle: string };
type LigneLite = { natureDocumentId: string; natureTiers: NatureTiers; estBloquant: boolean };

type CelluleState = { requis: boolean; estBloquant: boolean };
type GrilleState = Record<string, CelluleState>; // clé: `${natureDocumentId}|${natureTiers}`

const cle = (docId: string, nature: NatureTiers) => `${docId}|${nature}`;

function construireEtat(lignes: LigneLite[]): GrilleState {
  const etat: GrilleState = {};
  for (const l of lignes) {
    etat[cle(l.natureDocumentId, l.natureTiers)] = { requis: true, estBloquant: l.estBloquant };
  }
  return etat;
}

type Props = {
  corpsEtatList: CorpsEtatLite[];
  naturesDocument: NatureLite[];
  lignesByCorpsEtat: Record<string, LigneLite[]>;
  peutEcrire: boolean;
};

export function CorrespondanceEditor({
  corpsEtatList,
  naturesDocument,
  lignesByCorpsEtat,
  peutEcrire,
}: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [selectedId, setSelectedId] = useState<string>(corpsEtatList[0]?.id ?? '');
  const [etat, setEtat] = useState<GrilleState>(() =>
    construireEtat(lignesByCorpsEtat[corpsEtatList[0]?.id ?? ''] ?? []),
  );

  const selected = useMemo(
    () => corpsEtatList.find((c) => c.id === selectedId) ?? null,
    [corpsEtatList, selectedId],
  );

  function changerCorpsEtat(id: string) {
    setSelectedId(id);
    setEtat(construireEtat(lignesByCorpsEtat[id] ?? []));
  }

  function toggleRequis(docId: string, nature: NatureTiers, requis: boolean) {
    setEtat((prev) => ({
      ...prev,
      [cle(docId, nature)]: { requis, estBloquant: prev[cle(docId, nature)]?.estBloquant ?? true },
    }));
  }

  function toggleBloquant(docId: string, nature: NatureTiers, estBloquant: boolean) {
    setEtat((prev) => ({
      ...prev,
      [cle(docId, nature)]: { requis: prev[cle(docId, nature)]?.requis ?? true, estBloquant },
    }));
  }

  function enregistrer() {
    if (!selectedId) return;
    const lignes: LigneLite[] = [];
    for (const doc of naturesDocument) {
      for (const nature of NATURES_TIERS) {
        const c = etat[cle(doc.id, nature)];
        if (c?.requis) {
          lignes.push({ natureDocumentId: doc.id, natureTiers: nature, estBloquant: c.estBloquant });
        }
      }
    }
    startTransition(async () => {
      const r = await enregistrerCorrespondance({ corpsEtatId: selectedId, lignes });
      if (!r.ok) toast.error(r.error);
      else {
        toast.success('Correspondance enregistrée');
        router.refresh();
      }
    });
  }

  if (corpsEtatList.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        Créez d’abord au moins un corps d’état pour définir les documents requis.
      </p>
    );
  }
  if (naturesDocument.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        Créez d’abord au moins une nature de document.
      </p>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <span className="text-sm font-medium">Corps d’état :</span>
        <Select value={selectedId} onValueChange={(v) => v && changerCorpsEtat(v)}>
          <SelectTrigger className="w-72">
            <SelectValue>{() => selected?.libelle ?? 'Choisir'}</SelectValue>
          </SelectTrigger>
          <SelectContent>
            {corpsEtatList.map((c) => (
              <SelectItem key={c.id} value={c.id}>
                {c.libelle}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {peutEcrire && (
          <Button type="button" size="sm" className="ml-auto" disabled={isPending} onClick={enregistrer}>
            {isPending ? 'Enregistrement…' : 'Enregistrer la correspondance'}
          </Button>
        )}
      </div>

      <div className="overflow-x-auto rounded-lg border">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="border-b bg-muted/40">
              <th className="p-2 text-left font-medium">Document</th>
              {NATURES_TIERS.map((n) => (
                <th key={n} className="p-2 text-center font-medium">
                  {LIBELLES_NATURE_TIERS[n]}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {naturesDocument.map((doc) => (
              <tr key={doc.id} className="border-b last:border-0">
                <td className="p-2">
                  <div className="font-medium">{doc.libelle}</div>
                  <div className="font-mono text-xs text-muted-foreground">{doc.code}</div>
                </td>
                {NATURES_TIERS.map((nature) => {
                  const c = etat[cle(doc.id, nature)];
                  const requis = c?.requis ?? false;
                  return (
                    <td key={nature} className="p-2 text-center align-middle">
                      <div className="flex flex-col items-center gap-1">
                        <input
                          type="checkbox"
                          className="size-4 accent-amber-500"
                          checked={requis}
                          disabled={!peutEcrire}
                          onChange={(e) => toggleRequis(doc.id, nature, e.target.checked)}
                          aria-label={`Requis ${doc.code} pour ${LIBELLES_NATURE_TIERS[nature]}`}
                        />
                        {requis && (
                          <label className="flex items-center gap-1 text-[10px] text-muted-foreground">
                            <Switch
                              checked={c?.estBloquant ?? true}
                              disabled={!peutEcrire}
                              onCheckedChange={(v) => toggleBloquant(doc.id, nature, v)}
                            />
                            bloquant
                          </label>
                        )}
                      </div>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-muted-foreground">
        Cochez les documents requis pour ce corps d’état selon la nature du tiers. « Bloquant » : l’agrément
        ne peut être validé sans ce document valide.
      </p>
    </div>
  );
}
