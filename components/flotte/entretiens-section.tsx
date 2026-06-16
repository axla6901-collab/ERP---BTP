'use client';

import { PlusIcon, Trash2Icon } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { toast } from 'sonner';

import { Badge } from '@/components/ui/badge';
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
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { formatDateFr, formatEuro, formatNombre } from '@/lib/flotte/format';
import {
  LIBELLES_TYPE_ENTRETIEN,
  TYPES_ENTRETIEN,
  type EntretienInput,
  type TypeEntretien,
} from '@/lib/validation/flotte';

type EntretienRow = {
  id: string;
  typeEntretien: TypeEntretien;
  dateEntretien: string;
  kilometrage: number | null;
  description: string;
  prestataire: string | null;
  fournisseurNom: string | null;
  coutHt: string | null;
  garantie: boolean;
};

type Option = { id: string; label: string };

type ServerActionResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: string; fieldErrors?: Record<string, string[]> };

type Props = {
  vehiculeId: string;
  entretiens: EntretienRow[];
  fournisseurs: Option[];
  peutEcrire: boolean;
  actions: {
    enregistrer: (input: EntretienInput) => Promise<ServerActionResult<{ id: string }>>;
    supprimer: (id: string) => Promise<ServerActionResult<void>>;
  };
};

const NONE = '__none__';

export function EntretiensSection({
  vehiculeId,
  entretiens,
  fournisseurs,
  peutEcrire,
  actions,
}: Props) {
  const router = useRouter();
  const [showAdd, setShowAdd] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [erreur, setErreur] = useState<string | null>(null);

  const [type, setType] = useState<TypeEntretien>('revision');
  const [date, setDate] = useState('');
  const [km, setKm] = useState('');
  const [description, setDescription] = useState('');
  const [prestataire, setPrestataire] = useState('');
  const [fournisseurId, setFournisseurId] = useState<string>(NONE);
  const [coutHt, setCoutHt] = useState('');
  const [garantie, setGarantie] = useState(false);

  const coutTotal = entretiens.reduce((acc, e) => acc + (e.coutHt ? Number(e.coutHt) : 0), 0);

  function reset() {
    setType('revision');
    setDate('');
    setKm('');
    setDescription('');
    setPrestataire('');
    setFournisseurId(NONE);
    setCoutHt('');
    setGarantie(false);
    setShowAdd(false);
    setErreur(null);
  }

  function handleSave() {
    setErreur(null);
    if (!date) {
      setErreur("La date de l'entretien est requise.");
      return;
    }
    if (!description.trim()) {
      setErreur('La description est requise.');
      return;
    }
    startTransition(async () => {
      const r = await actions.enregistrer({
        vehiculeId,
        typeEntretien: type,
        dateEntretien: date,
        kilometrage: km.trim() ? Number(km.replace(/\s/g, '')) : null,
        description: description.trim(),
        prestataire: prestataire.trim() || null,
        fournisseurId: fournisseurId === NONE ? null : fournisseurId,
        coutHt: coutHt.trim() || null,
        coutTva: null,
        coutTtc: null,
        prochaineEcheanceKm: null,
        prochaineEcheanceDate: null,
        garantie,
        notes: null,
      });
      if (r.ok) {
        toast.success('Entretien enregistré');
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
        toast.success('Entretien supprimé');
        router.refresh();
      } else {
        toast.error(r.error);
      }
    });
  }

  return (
    <div className="space-y-3">
      {entretiens.length === 0 ? (
        <p className="rounded border border-dashed p-4 text-center text-sm text-muted-foreground">
          Aucun entretien enregistré.
        </p>
      ) : (
        <div className="overflow-hidden rounded-md border">
          <table className="w-full text-sm">
            <thead className="bg-muted/40 text-left text-xs uppercase tracking-widest text-muted-foreground">
              <tr>
                <th className="px-4 py-2 font-medium">Date</th>
                <th className="px-4 py-2 font-medium">Type / description</th>
                <th className="px-4 py-2 font-medium">Prestataire</th>
                <th className="px-4 py-2 text-right font-medium">Km</th>
                <th className="px-4 py-2 text-right font-medium">Coût HT</th>
                {peutEcrire && <th className="px-4 py-2" />}
              </tr>
            </thead>
            <tbody className="divide-y">
              {entretiens.map((e) => (
                <tr key={e.id}>
                  <td className="whitespace-nowrap px-4 py-2 tabular-nums">
                    {formatDateFr(e.dateEntretien)}
                  </td>
                  <td className="px-4 py-2">
                    <span className="font-medium">{LIBELLES_TYPE_ENTRETIEN[e.typeEntretien]}</span>
                    {e.garantie && (
                      <Badge tone="emerald" className="ml-2 align-middle">
                        Garantie
                      </Badge>
                    )}
                    <span className="block text-xs text-muted-foreground">{e.description}</span>
                  </td>
                  <td className="px-4 py-2 text-muted-foreground">
                    {e.fournisseurNom ?? e.prestataire ?? '—'}
                  </td>
                  <td className="px-4 py-2 text-right tabular-nums text-muted-foreground">
                    {e.kilometrage !== null ? `${formatNombre(e.kilometrage)} km` : '—'}
                  </td>
                  <td className="px-4 py-2 text-right tabular-nums">{formatEuro(e.coutHt)}</td>
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
              ))}
            </tbody>
            <tfoot className="border-t bg-muted/20 text-sm">
              <tr>
                <td className="px-4 py-2 font-medium text-muted-foreground" colSpan={4}>
                  Total entretiens
                </td>
                <td className="px-4 py-2 text-right font-semibold tabular-nums">
                  {formatEuro(coutTotal)}
                </td>
                {peutEcrire && <td />}
              </tr>
            </tfoot>
          </table>
        </div>
      )}

      {peutEcrire &&
        (!showAdd ? (
          <Button variant="outline" size="sm" onClick={() => setShowAdd(true)}>
            <PlusIcon className="mr-1 size-4" /> Ajouter un entretien
          </Button>
        ) : (
          <div className="grid gap-3 rounded-md border p-4">
            {erreur && <p className="text-sm text-destructive">{erreur}</p>}
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <div>
                <Label>Type</Label>
                <Select value={type} onValueChange={(v) => setType(v as TypeEntretien)}>
                  <SelectTrigger>
                    <SelectValue>
                      {(v) => LIBELLES_TYPE_ENTRETIEN[v as TypeEntretien] ?? v}
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    {TYPES_ENTRETIEN.map((t) => (
                      <SelectItem key={t} value={t}>
                        {LIBELLES_TYPE_ENTRETIEN[t]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Date</Label>
                <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
              </div>
              <div>
                <Label>Kilométrage</Label>
                <Input inputMode="numeric" value={km} onChange={(e) => setKm(e.target.value)} />
              </div>
            </div>
            <div>
              <Label>Description</Label>
              <Textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                maxLength={500}
                rows={2}
              />
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <div>
                <Label>Garage (fournisseur)</Label>
                <Select value={fournisseurId} onValueChange={(v) => setFournisseurId(v ?? NONE)}>
                  <SelectTrigger>
                    <SelectValue>
                      {(v) =>
                        v && v !== NONE ? (fournisseurs.find((f) => f.id === v)?.label ?? '—') : '—'
                      }
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NONE}>—</SelectItem>
                    {fournisseurs.map((f) => (
                      <SelectItem key={f.id} value={f.id}>
                        {f.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Ou prestataire (texte libre)</Label>
                <Input
                  value={prestataire}
                  onChange={(e) => setPrestataire(e.target.value)}
                  maxLength={120}
                />
              </div>
              <div>
                <Label>Coût HT (€)</Label>
                <Input
                  inputMode="decimal"
                  value={coutHt}
                  onChange={(e) => setCoutHt(e.target.value)}
                />
              </div>
            </div>
            <label className="flex items-center gap-2 text-sm">
              <Switch checked={garantie} onCheckedChange={setGarantie} />
              Pris en charge sous garantie
            </label>
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
