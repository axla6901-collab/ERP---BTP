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
import type { SyntheseConsommation } from '@/lib/flotte/consommation';
import { formatDateFr, formatEuro, formatNombre } from '@/lib/flotte/format';
import type { PleinInput } from '@/lib/validation/flotte';

type PleinRow = {
  id: string;
  datePlein: string;
  kilometrage: number;
  volumeLitres: string | null;
  energieKwh: string | null;
  prixHt: string;
  pleinComplet: boolean;
  station: string | null;
  carteMasquee: string | null;
  conducteurNom: string | null;
};

type Option = { id: string; label: string };

type ServerActionResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: string; fieldErrors?: Record<string, string[]> };

type Props = {
  vehiculeId: string;
  pleins: PleinRow[];
  synthese: SyntheseConsommation;
  employes: Option[];
  /** `true` pour les véhicules électriques → saisie en kWh plutôt qu'en litres. */
  electrique: boolean;
  peutEcrire: boolean;
  actions: {
    enregistrer: (input: PleinInput) => Promise<ServerActionResult<{ id: string }>>;
    supprimer: (id: string) => Promise<ServerActionResult<void>>;
  };
};

const NONE = '__none__';

function StatConso({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border bg-card px-3 py-2">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="text-base font-semibold tabular-nums">{value}</div>
    </div>
  );
}

export function PleinsSection({
  vehiculeId,
  pleins,
  synthese,
  employes,
  electrique,
  peutEcrire,
  actions,
}: Props) {
  const router = useRouter();
  const [showAdd, setShowAdd] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [erreur, setErreur] = useState<string | null>(null);

  const [date, setDate] = useState('');
  const [km, setKm] = useState('');
  const [quantite, setQuantite] = useState('');
  const [prixHt, setPrixHt] = useState('');
  const [pleinComplet, setPleinComplet] = useState(true);
  const [station, setStation] = useState('');
  const [carte, setCarte] = useState('');
  const [employeId, setEmployeId] = useState<string>(NONE);

  function reset() {
    setDate('');
    setKm('');
    setQuantite('');
    setPrixHt('');
    setPleinComplet(true);
    setStation('');
    setCarte('');
    setEmployeId(NONE);
    setShowAdd(false);
    setErreur(null);
  }

  function handleSave() {
    setErreur(null);
    if (!date) {
      setErreur('La date du plein est requise.');
      return;
    }
    if (!km.trim()) {
      setErreur('Le kilométrage est requis (il sert au calcul de consommation).');
      return;
    }
    if (!quantite.trim()) {
      setErreur(electrique ? "L'énergie (kWh) est requise." : 'Le volume (litres) est requis.');
      return;
    }
    startTransition(async () => {
      const r = await actions.enregistrer({
        vehiculeId,
        employeId: employeId === NONE ? null : employeId,
        datePlein: date,
        kilometrage: Number(km.replace(/\s/g, '')),
        volumeLitres: electrique ? null : quantite.trim(),
        energieKwh: electrique ? quantite.trim() : null,
        prixHt: prixHt.trim() || null,
        prixTtc: null,
        pleinComplet,
        station: station.trim() || null,
        numeroCarteCarburant: carte.trim() || null,
        notes: null,
      });
      if (r.ok) {
        toast.success('Plein enregistré');
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
        toast.success('Plein supprimé');
        router.refresh();
      } else {
        toast.error(r.error);
      }
    });
  }

  const consoMoyenne = electrique
    ? synthese.consoMoyenneKwh100 !== null
      ? `${synthese.consoMoyenneKwh100} kWh/100 km`
      : '—'
    : synthese.consoMoyenneLitres100 !== null
      ? `${synthese.consoMoyenneLitres100} L/100 km`
      : '—';

  return (
    <div className="space-y-3">
      {synthese.nbPleins > 0 && (
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <StatConso label="Conso. moyenne" value={consoMoyenne} />
          <StatConso
            label="Coût au km"
            value={
              synthese.coutMoyenKm !== null
                ? `${synthese.coutMoyenKm.toFixed(2).replace('.', ',')} €/km`
                : '—'
            }
          />
          <StatConso label="Dépense totale HT" value={formatEuro(synthese.coutTotalHt)} />
          <StatConso label="Distance analysée" value={`${formatNombre(synthese.distanceKm)} km`} />
        </div>
      )}

      {pleins.length === 0 ? (
        <p className="rounded border border-dashed p-4 text-center text-sm text-muted-foreground">
          Aucun plein enregistré.
        </p>
      ) : (
        <div className="overflow-hidden rounded-md border">
          <table className="w-full text-sm">
            <thead className="bg-muted/40 text-left text-xs uppercase tracking-widest text-muted-foreground">
              <tr>
                <th className="px-4 py-2 font-medium">Date</th>
                <th className="px-4 py-2 text-right font-medium">Km</th>
                <th className="px-4 py-2 text-right font-medium">
                  {electrique ? 'kWh' : 'Litres'}
                </th>
                <th className="px-4 py-2 text-right font-medium">Prix HT</th>
                <th className="px-4 py-2 font-medium">Station / carte</th>
                {peutEcrire && <th className="px-4 py-2" />}
              </tr>
            </thead>
            <tbody className="divide-y">
              {pleins.map((p) => (
                <tr key={p.id}>
                  <td className="whitespace-nowrap px-4 py-2 tabular-nums">
                    {formatDateFr(p.datePlein)}
                    {p.conducteurNom && (
                      <span className="block text-xs text-muted-foreground">{p.conducteurNom}</span>
                    )}
                  </td>
                  <td className="px-4 py-2 text-right tabular-nums">
                    {formatNombre(p.kilometrage)}
                  </td>
                  <td className="px-4 py-2 text-right tabular-nums">
                    {electrique ? (p.energieKwh ?? '—') : (p.volumeLitres ?? '—')}
                    {!p.pleinComplet && (
                      <Badge tone="slate" className="ml-2 align-middle">
                        Partiel
                      </Badge>
                    )}
                  </td>
                  <td className="px-4 py-2 text-right tabular-nums">{formatEuro(p.prixHt)}</td>
                  <td className="px-4 py-2 text-muted-foreground">
                    {p.station ?? '—'}
                    {p.carteMasquee && (
                      <span className="block text-xs tabular-nums">{p.carteMasquee}</span>
                    )}
                  </td>
                  {peutEcrire && (
                    <td className="px-4 py-2 text-right">
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 w-7 p-0 text-destructive hover:text-destructive"
                        disabled={isPending}
                        onClick={() => handleDelete(p.id)}
                        title="Supprimer"
                      >
                        <Trash2Icon className="size-3.5" />
                      </Button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {peutEcrire &&
        (!showAdd ? (
          <Button variant="outline" size="sm" onClick={() => setShowAdd(true)}>
            <PlusIcon className="mr-1 size-4" />{' '}
            {electrique ? 'Ajouter une recharge' : 'Ajouter un plein'}
          </Button>
        ) : (
          <div className="grid gap-3 rounded-md border p-4">
            {erreur && <p className="text-sm text-destructive">{erreur}</p>}
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-4">
              <div>
                <Label>Date</Label>
                <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
              </div>
              <div>
                <Label>Kilométrage</Label>
                <Input inputMode="numeric" value={km} onChange={(e) => setKm(e.target.value)} />
              </div>
              <div>
                <Label>{electrique ? 'Énergie (kWh)' : 'Volume (L)'}</Label>
                <Input
                  inputMode="decimal"
                  value={quantite}
                  onChange={(e) => setQuantite(e.target.value)}
                />
              </div>
              <div>
                <Label>Prix HT (€)</Label>
                <Input
                  inputMode="decimal"
                  value={prixHt}
                  onChange={(e) => setPrixHt(e.target.value)}
                />
              </div>
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <div>
                <Label>Station</Label>
                <Input
                  value={station}
                  onChange={(e) => setStation(e.target.value)}
                  maxLength={120}
                />
              </div>
              <div>
                <Label>N° de carte carburant</Label>
                <Input
                  value={carte}
                  onChange={(e) => setCarte(e.target.value)}
                  maxLength={40}
                  autoComplete="off"
                />
              </div>
              <div>
                <Label>Conducteur</Label>
                <Select value={employeId} onValueChange={(v) => setEmployeId(v ?? NONE)}>
                  <SelectTrigger>
                    <SelectValue>
                      {(v) =>
                        v && v !== NONE ? (employes.find((e) => e.id === v)?.label ?? '—') : '—'
                      }
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NONE}>—</SelectItem>
                    {employes.map((e) => (
                      <SelectItem key={e.id} value={e.id}>
                        {e.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <label className="flex items-center gap-2 text-sm">
              <Switch checked={pleinComplet} onCheckedChange={setPleinComplet} />
              Plein complet (réservoir « à ras » — requis pour le calcul de consommation)
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
