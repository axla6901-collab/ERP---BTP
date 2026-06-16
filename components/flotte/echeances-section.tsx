'use client';

import { PlusIcon, Trash2Icon } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { toast } from 'sonner';

import { Badge, type BadgeTone } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  joursAvantEcheance,
  LIBELLES_STATUT_ECHEANCE,
  statutEcheance,
} from '@/lib/flotte/echeances';
import { formatDateFr, formatJours } from '@/lib/flotte/format';
import {
  LIBELLES_TYPE_ECHEANCE,
  TYPES_ECHEANCE,
  type EcheanceInput,
  type TypeEcheance,
} from '@/lib/validation/flotte';

type EcheanceRow = {
  id: string;
  typeEcheance: TypeEcheance;
  dateEcheance: string;
  seuilAlerteJours: number;
  reference: string | null;
  prestataire: string | null;
};

type ServerActionResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: string; fieldErrors?: Record<string, string[]> };

type Props = {
  vehiculeId: string;
  echeances: EcheanceRow[];
  today: string;
  peutEcrire: boolean;
  actions: {
    enregistrer: (input: EcheanceInput) => Promise<ServerActionResult<{ id: string }>>;
    supprimer: (id: string) => Promise<ServerActionResult<void>>;
  };
};

const TONE: Record<'expire' | 'a_renouveler' | 'a_jour', BadgeTone> = {
  expire: 'rose',
  a_renouveler: 'amber',
  a_jour: 'emerald',
};

export function EcheancesSection({ vehiculeId, echeances, today, peutEcrire, actions }: Props) {
  const router = useRouter();
  const [showAdd, setShowAdd] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [erreur, setErreur] = useState<string | null>(null);

  const [type, setType] = useState<TypeEcheance>('controle_technique');
  const [dateEcheance, setDateEcheance] = useState('');
  const [seuil, setSeuil] = useState('30');
  const [reference, setReference] = useState('');
  const [prestataire, setPrestataire] = useState('');

  function reset() {
    setType('controle_technique');
    setDateEcheance('');
    setSeuil('30');
    setReference('');
    setPrestataire('');
    setShowAdd(false);
    setErreur(null);
  }

  function handleSave() {
    setErreur(null);
    if (!dateEcheance) {
      setErreur("La date d'échéance est requise.");
      return;
    }
    startTransition(async () => {
      const r = await actions.enregistrer({
        vehiculeId,
        typeEcheance: type,
        dateEcheance,
        seuilAlerteJours: Number(seuil) || 30,
        libelle: null,
        dateDebutValidite: null,
        reference: reference.trim() || null,
        prestataire: prestataire.trim() || null,
        montantHt: null,
        notes: null,
      });
      if (r.ok) {
        toast.success('Échéance enregistrée');
        reset();
        router.refresh();
      } else {
        setErreur(r.error);
      }
    });
  }

  function handleDelete(id: string) {
    startTransition(async () => {
      const r = await actions.supprimer(id);
      if (r.ok) {
        toast.success('Échéance supprimée');
        router.refresh();
      } else {
        toast.error(r.error);
      }
    });
  }

  return (
    <div className="space-y-3">
      {echeances.length === 0 ? (
        <p className="rounded border border-dashed p-4 text-center text-sm text-muted-foreground">
          Aucune échéance enregistrée.
        </p>
      ) : (
        <div className="overflow-hidden rounded-md border">
          <table className="w-full text-sm">
            <thead className="bg-muted/40 text-left text-xs uppercase tracking-widest text-muted-foreground">
              <tr>
                <th className="px-4 py-2 font-medium">Type</th>
                <th className="px-4 py-2 font-medium">Référence / prestataire</th>
                <th className="px-4 py-2 text-right font-medium">Échéance</th>
                <th className="px-4 py-2 font-medium">Statut</th>
                {peutEcrire && <th className="px-4 py-2" />}
              </tr>
            </thead>
            <tbody className="divide-y">
              {echeances.map((e) => {
                const st = statutEcheance(e.dateEcheance, e.seuilAlerteJours, today);
                return (
                  <tr key={e.id}>
                    <td className="px-4 py-2 font-medium">
                      {LIBELLES_TYPE_ECHEANCE[e.typeEcheance]}
                    </td>
                    <td className="px-4 py-2 text-muted-foreground">
                      {[e.reference, e.prestataire].filter(Boolean).join(' · ') || '—'}
                    </td>
                    <td className="px-4 py-2 text-right tabular-nums">
                      {formatDateFr(e.dateEcheance)}
                      <span className="ml-2 text-xs text-muted-foreground">
                        {formatJours(joursAvantEcheance(e.dateEcheance, today))}
                      </span>
                    </td>
                    <td className="px-4 py-2">
                      <Badge tone={TONE[st]}>{LIBELLES_STATUT_ECHEANCE[st]}</Badge>
                    </td>
                    {peutEcrire && (
                      <td className="px-4 py-2 text-right">
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 w-7 p-0 text-destructive hover:text-destructive"
                          disabled={isPending}
                          onClick={() => handleDelete(e.id)}
                          title="Supprimer"
                        >
                          <Trash2Icon className="size-3.5" />
                        </Button>
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {peutEcrire &&
        (!showAdd ? (
          <Button variant="outline" size="sm" onClick={() => setShowAdd(true)}>
            <PlusIcon className="mr-1 size-4" /> Ajouter / renouveler une échéance
          </Button>
        ) : (
          <div className="grid gap-3 rounded-md border p-4">
            {erreur && <p className="text-sm text-destructive">{erreur}</p>}
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <div>
                <Label>Type</Label>
                <Select value={type} onValueChange={(v) => setType(v as TypeEcheance)}>
                  <SelectTrigger>
                    <SelectValue>
                      {(v) => LIBELLES_TYPE_ECHEANCE[v as TypeEcheance] ?? v}
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    {TYPES_ECHEANCE.map((t) => (
                      <SelectItem key={t} value={t}>
                        {LIBELLES_TYPE_ECHEANCE[t]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Date d&apos;échéance</Label>
                <Input
                  type="date"
                  value={dateEcheance}
                  onChange={(e) => setDateEcheance(e.target.value)}
                />
              </div>
              <div>
                <Label>Rappel (jours avant)</Label>
                <Input
                  inputMode="numeric"
                  value={seuil}
                  onChange={(e) => setSeuil(e.target.value)}
                />
              </div>
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <Label>Référence (n° contrat…)</Label>
                <Input
                  value={reference}
                  onChange={(e) => setReference(e.target.value)}
                  maxLength={120}
                />
              </div>
              <div>
                <Label>Prestataire (assureur, centre CT…)</Label>
                <Input
                  value={prestataire}
                  onChange={(e) => setPrestataire(e.target.value)}
                  maxLength={120}
                />
              </div>
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="ghost" size="sm" onClick={reset} disabled={isPending}>
                Annuler
              </Button>
              <Button size="sm" onClick={handleSave} disabled={isPending}>
                {isPending ? 'Enregistrement…' : 'Enregistrer'}
              </Button>
            </div>
          </div>
        ))}
    </div>
  );
}
