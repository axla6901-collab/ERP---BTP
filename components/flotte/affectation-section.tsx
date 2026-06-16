'use client';

import { PlusIcon } from 'lucide-react';
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
import { formatDateFr } from '@/lib/flotte/format';
import {
  LIBELLES_STATUT_AFFECTATION,
  type AffectationInput,
  type StatutAffectation,
} from '@/lib/validation/flotte';

type AffectationRow = {
  id: string;
  statut: StatutAffectation;
  dateDebut: string;
  dateFin: string | null;
  employe: string | null;
  chantier: string | null;
  motif: string | null;
};

type Option = { id: string; label: string };

type ServerActionResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: string; fieldErrors?: Record<string, string[]> };

type Props = {
  vehiculeId: string;
  affectations: AffectationRow[];
  peutAffecter: boolean;
  employes: Option[];
  chantiers: Option[];
  actions: {
    creer: (
      input: AffectationInput,
    ) => Promise<ServerActionResult<{ id: string; avertissement: string | null }>>;
    terminer: (id: string) => Promise<ServerActionResult<void>>;
  };
};

const NONE = '__none__';
const STATUT_TONE = {
  en_cours: 'emerald',
  prevue: 'sky',
  terminee: 'neutral',
  annulee: 'rose',
} as const;

export function AffectationSection({
  vehiculeId,
  affectations,
  peutAffecter,
  employes,
  chantiers,
  actions,
}: Props) {
  const router = useRouter();
  const [showAdd, setShowAdd] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [erreur, setErreur] = useState<string | null>(null);

  const [employeId, setEmployeId] = useState<string>(NONE);
  const [chantierId, setChantierId] = useState<string>(NONE);
  const [dateDebut, setDateDebut] = useState('');
  const [motif, setMotif] = useState('');

  function reset() {
    setEmployeId(NONE);
    setChantierId(NONE);
    setDateDebut('');
    setMotif('');
    setShowAdd(false);
    setErreur(null);
  }

  function handleCreate() {
    setErreur(null);
    if (employeId === NONE && chantierId === NONE) {
      setErreur('Renseignez au moins un conducteur ou un chantier.');
      return;
    }
    if (!dateDebut) {
      setErreur('La date de début est requise.');
      return;
    }
    startTransition(async () => {
      const r = await actions.creer({
        vehiculeId,
        employeId: employeId === NONE ? null : employeId,
        chantierId: chantierId === NONE ? null : chantierId,
        statut: 'en_cours',
        dateDebut,
        dateFin: null,
        kmDebut: null,
        kmFin: null,
        motif: motif.trim() || null,
        notes: null,
      });
      if (r.ok) {
        if (r.data.avertissement) toast.warning(r.data.avertissement);
        else toast.success('Affectation enregistrée');
        reset();
        router.refresh();
      } else {
        setErreur(r.error);
      }
    });
  }

  function handleTerminer(id: string) {
    startTransition(async () => {
      const r = await actions.terminer(id);
      if (r.ok) {
        toast.success('Affectation clôturée');
        router.refresh();
      } else {
        toast.error(r.error);
      }
    });
  }

  return (
    <div className="space-y-3">
      {affectations.length === 0 ? (
        <p className="rounded border border-dashed p-4 text-center text-sm text-muted-foreground">
          Aucune affectation.
        </p>
      ) : (
        <div className="overflow-hidden rounded-md border">
          <table className="w-full text-sm">
            <thead className="bg-muted/40 text-left text-xs uppercase tracking-widest text-muted-foreground">
              <tr>
                <th className="px-4 py-2 font-medium">Période</th>
                <th className="px-4 py-2 font-medium">Conducteur</th>
                <th className="px-4 py-2 font-medium">Chantier</th>
                <th className="px-4 py-2 font-medium">Statut</th>
                {peutAffecter && <th className="px-4 py-2" />}
              </tr>
            </thead>
            <tbody className="divide-y">
              {affectations.map((a) => (
                <tr key={a.id}>
                  <td className="px-4 py-2 tabular-nums">
                    {formatDateFr(a.dateDebut)} → {a.dateFin ? formatDateFr(a.dateFin) : '…'}
                  </td>
                  <td className="px-4 py-2 text-muted-foreground">{a.employe ?? '—'}</td>
                  <td className="px-4 py-2 text-muted-foreground">{a.chantier ?? '—'}</td>
                  <td className="px-4 py-2">
                    <Badge tone={STATUT_TONE[a.statut]}>
                      {LIBELLES_STATUT_AFFECTATION[a.statut]}
                    </Badge>
                  </td>
                  {peutAffecter && (
                    <td className="px-4 py-2 text-right">
                      {a.statut === 'en_cours' && (
                        <Button
                          variant="ghost"
                          size="sm"
                          disabled={isPending}
                          onClick={() => handleTerminer(a.id)}
                        >
                          Clôturer
                        </Button>
                      )}
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {peutAffecter &&
        (!showAdd ? (
          <Button variant="outline" size="sm" onClick={() => setShowAdd(true)}>
            <PlusIcon className="mr-1 size-4" /> Nouvelle affectation
          </Button>
        ) : (
          <div className="grid gap-3 rounded-md border p-4">
            {erreur && <p className="text-sm text-destructive">{erreur}</p>}
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
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
              <div>
                <Label>Chantier</Label>
                <Select value={chantierId} onValueChange={(v) => setChantierId(v ?? NONE)}>
                  <SelectTrigger>
                    <SelectValue>
                      {(v) =>
                        v && v !== NONE ? (chantiers.find((c) => c.id === v)?.label ?? '—') : '—'
                      }
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NONE}>—</SelectItem>
                    {chantiers.map((c) => (
                      <SelectItem key={c.id} value={c.id}>
                        {c.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Date de début</Label>
                <Input
                  type="date"
                  value={dateDebut}
                  onChange={(e) => setDateDebut(e.target.value)}
                />
              </div>
            </div>
            <div>
              <Label>Motif (optionnel)</Label>
              <Input value={motif} onChange={(e) => setMotif(e.target.value)} maxLength={200} />
            </div>
            <p className="rounded-md bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:bg-amber-950/20 dark:text-amber-300">
              La validité du permis du conducteur est vérifiée automatiquement (avertissement non
              bloquant). Une affectation « en cours » clôture la précédente.
            </p>
            <div className="flex justify-end gap-2">
              <Button variant="ghost" size="sm" onClick={reset} disabled={isPending}>
                Annuler
              </Button>
              <Button size="sm" onClick={handleCreate} disabled={isPending}>
                {isPending ? 'Enregistrement…' : 'Affecter'}
              </Button>
            </div>
          </div>
        ))}
    </div>
  );
}
