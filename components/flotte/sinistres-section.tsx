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
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { formatDateFr, formatEuro } from '@/lib/flotte/format';
import {
  LIBELLES_RESPONSABILITE_SINISTRE,
  RESPONSABILITES_SINISTRE,
  type ResponsabiliteSinistre,
  type SinistreInput,
} from '@/lib/validation/flotte';

type SinistreRow = {
  id: string;
  dateSinistre: string;
  numeroSinistre: string | null;
  lieu: string | null;
  responsabilite: ResponsabiliteSinistre;
  tiersImplique: boolean;
  montantDommagesHt: string | null;
  franchiseHt: string | null;
  clos: boolean;
  dateCloture: string | null;
  conducteurNom: string | null;
};

type Option = { id: string; label: string };

type ServerActionResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: string; fieldErrors?: Record<string, string[]> };

type Props = {
  vehiculeId: string;
  sinistres: SinistreRow[];
  employes: Option[];
  peutEcrire: boolean;
  actions: {
    enregistrer: (input: SinistreInput) => Promise<ServerActionResult<{ id: string }>>;
    cloturer: (id: string) => Promise<ServerActionResult<void>>;
    supprimer: (id: string) => Promise<ServerActionResult<void>>;
  };
};

const NONE = '__none__';

const RESPONSABILITE_TONE: Record<ResponsabiliteSinistre, BadgeTone> = {
  tort_total: 'rose',
  tort_partiel: 'amber',
  non_responsable: 'emerald',
  indeterminee: 'neutral',
};

export function SinistresSection({ vehiculeId, sinistres, employes, peutEcrire, actions }: Props) {
  const router = useRouter();
  const [showAdd, setShowAdd] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [erreur, setErreur] = useState<string | null>(null);

  const [date, setDate] = useState('');
  const [numero, setNumero] = useState('');
  const [lieu, setLieu] = useState('');
  const [employeId, setEmployeId] = useState<string>(NONE);
  const [responsabilite, setResponsabilite] = useState<ResponsabiliteSinistre>('indeterminee');
  const [tiersImplique, setTiersImplique] = useState(false);
  const [montantDommages, setMontantDommages] = useState('');
  const [franchise, setFranchise] = useState('');
  const [description, setDescription] = useState('');

  function reset() {
    setDate('');
    setNumero('');
    setLieu('');
    setEmployeId(NONE);
    setResponsabilite('indeterminee');
    setTiersImplique(false);
    setMontantDommages('');
    setFranchise('');
    setDescription('');
    setShowAdd(false);
    setErreur(null);
  }

  function handleSave() {
    setErreur(null);
    if (!date) {
      setErreur('La date du sinistre est requise.');
      return;
    }
    startTransition(async () => {
      const r = await actions.enregistrer({
        vehiculeId,
        employeId: employeId === NONE ? null : employeId,
        numeroSinistre: numero.trim() || null,
        dateSinistre: date,
        lieu: lieu.trim() || null,
        description: description.trim() || null,
        responsabilite,
        tiersImplique,
        montantDommagesHt: montantDommages.trim() || null,
        franchiseHt: franchise.trim() || null,
        indemnisationHt: null,
        clos: false,
        dateCloture: null,
        notes: null,
      });
      if (r.ok) {
        toast.success('Sinistre enregistré');
        reset();
        router.refresh();
      } else {
        setErreur(r.error);
      }
    });
  }

  function handleCloturer(id: string) {
    startTransition(async () => {
      const r = await actions.cloturer(id);
      if (r.ok) {
        toast.success('Sinistre clôturé');
        router.refresh();
      } else {
        toast.error(r.error);
      }
    });
  }

  function handleDelete(id: string) {
    startTransition(async () => {
      const r = await actions.supprimer(id);
      if (r.ok) {
        toast.success('Sinistre supprimé');
        router.refresh();
      } else {
        toast.error(r.error);
      }
    });
  }

  return (
    <div className="space-y-3">
      {sinistres.length === 0 ? (
        <p className="rounded border border-dashed p-4 text-center text-sm text-muted-foreground">
          Aucun sinistre déclaré.
        </p>
      ) : (
        <div className="overflow-hidden rounded-md border">
          <table className="w-full text-sm">
            <thead className="bg-muted/40 text-left text-xs uppercase tracking-widest text-muted-foreground">
              <tr>
                <th className="px-4 py-2 font-medium">Date</th>
                <th className="px-4 py-2 font-medium">Lieu / conducteur</th>
                <th className="px-4 py-2 font-medium">Responsabilité</th>
                <th className="px-4 py-2 text-right font-medium">Dommages / franchise</th>
                <th className="px-4 py-2 font-medium">Statut</th>
                {peutEcrire && <th className="px-4 py-2" />}
              </tr>
            </thead>
            <tbody className="divide-y">
              {sinistres.map((s) => (
                <tr key={s.id}>
                  <td className="whitespace-nowrap px-4 py-2 tabular-nums">
                    {formatDateFr(s.dateSinistre)}
                    {s.numeroSinistre && (
                      <span className="block text-xs text-muted-foreground">
                        N° {s.numeroSinistre}
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-2 text-muted-foreground">
                    {s.lieu ?? '—'}
                    {s.conducteurNom && <span className="block text-xs">{s.conducteurNom}</span>}
                  </td>
                  <td className="px-4 py-2">
                    <Badge tone={RESPONSABILITE_TONE[s.responsabilite]}>
                      {LIBELLES_RESPONSABILITE_SINISTRE[s.responsabilite]}
                    </Badge>
                    {s.tiersImplique && (
                      <span className="block text-xs text-muted-foreground">Tiers impliqué</span>
                    )}
                  </td>
                  <td className="px-4 py-2 text-right tabular-nums">
                    {formatEuro(s.montantDommagesHt)}
                    <span className="block text-xs text-muted-foreground">
                      Franchise {formatEuro(s.franchiseHt)}
                    </span>
                  </td>
                  <td className="px-4 py-2">
                    {s.clos ? (
                      <Badge tone="neutral">Clos · {formatDateFr(s.dateCloture)}</Badge>
                    ) : (
                      <Badge tone="amber">En cours</Badge>
                    )}
                  </td>
                  {peutEcrire && (
                    <td className="whitespace-nowrap px-4 py-2 text-right">
                      {!s.clos && (
                        <Button
                          variant="ghost"
                          size="sm"
                          disabled={isPending}
                          onClick={() => handleCloturer(s.id)}
                        >
                          Clôturer
                        </Button>
                      )}
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 w-7 p-0 text-destructive hover:text-destructive"
                        disabled={isPending}
                        onClick={() => handleDelete(s.id)}
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
            <PlusIcon className="mr-1 size-4" /> Déclarer un sinistre
          </Button>
        ) : (
          <div className="grid gap-3 rounded-md border p-4">
            {erreur && <p className="text-sm text-destructive">{erreur}</p>}
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <div>
                <Label>Date</Label>
                <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
              </div>
              <div>
                <Label>N° de sinistre (assureur)</Label>
                <Input value={numero} onChange={(e) => setNumero(e.target.value)} maxLength={60} />
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
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <div>
                <Label>Lieu</Label>
                <Input value={lieu} onChange={(e) => setLieu(e.target.value)} maxLength={200} />
              </div>
              <div>
                <Label>Responsabilité</Label>
                <Select
                  value={responsabilite}
                  onValueChange={(v) => setResponsabilite(v as ResponsabiliteSinistre)}
                >
                  <SelectTrigger>
                    <SelectValue>
                      {(v) => LIBELLES_RESPONSABILITE_SINISTRE[v as ResponsabiliteSinistre] ?? v}
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    {RESPONSABILITES_SINISTRE.map((r) => (
                      <SelectItem key={r} value={r}>
                        {LIBELLES_RESPONSABILITE_SINISTRE[r]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <label className="flex items-center gap-2 self-end pb-2 text-sm">
                <Switch checked={tiersImplique} onCheckedChange={setTiersImplique} />
                Tiers impliqué
              </label>
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <Label>Montant des dommages HT (€)</Label>
                <Input
                  inputMode="decimal"
                  value={montantDommages}
                  onChange={(e) => setMontantDommages(e.target.value)}
                />
              </div>
              <div>
                <Label>Franchise HT (€)</Label>
                <Input
                  inputMode="decimal"
                  value={franchise}
                  onChange={(e) => setFranchise(e.target.value)}
                />
              </div>
            </div>
            <div>
              <Label>Description / circonstances</Label>
              <Textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                maxLength={1000}
                rows={2}
              />
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
