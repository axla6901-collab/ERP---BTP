'use client';

import { PlusIcon, Trash2Icon } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { toast } from 'sonner';

import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
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
  LIBELLES_TYPE_HABILITATION,
  TYPES_HABILITATION,
  type HabilitationInput,
  type TypeHabilitation,
} from '@/lib/validation/rh';

type Habilitation = {
  id: string;
  type: TypeHabilitation;
  dateObtention: string | null;
  dateValidite: string | null;
  numero: string | null;
  organisme: string | null;
  notes: string | null;
};

type ServerActionResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: string; fieldErrors?: Record<string, string[]> };

type Props = {
  items: Habilitation[];
  peutEcrire: boolean;
  actions: {
    creer: (input: HabilitationInput) => Promise<ServerActionResult<{ id: string }>>;
    supprimer: (id: string) => Promise<ServerActionResult<void>>;
  };
};

function statutValidite(dateValidite: string | null): {
  classe: string;
  label: string;
} {
  if (!dateValidite) return { classe: 'bg-muted text-muted-foreground', label: 'Permanente' };
  const today = new Date().toISOString().slice(0, 10);
  if (dateValidite < today) return { classe: 'bg-rose-100 text-rose-900', label: 'Expirée' };
  const expDate = new Date(dateValidite);
  const diffJ = Math.ceil((expDate.getTime() - Date.now()) / (1000 * 60 * 60 * 24));
  if (diffJ < 30) return { classe: 'bg-amber-100 text-amber-900', label: `J-${diffJ}` };
  return { classe: 'bg-emerald-100 text-emerald-900', label: 'Valide' };
}

export function HabilitationsList({ items, peutEcrire, actions }: Props) {
  const router = useRouter();
  const [showAdd, setShowAdd] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [form, setForm] = useState<HabilitationInput>({
    type: 'autre',
    dateObtention: null,
    dateValidite: null,
    numero: null,
    organisme: null,
    notes: null,
  });
  const [erreur, setErreur] = useState<string | null>(null);

  function handleAdd() {
    setErreur(null);
    startTransition(async () => {
      const r = await actions.creer(form);
      if (r.ok) {
        toast.success('Habilitation ajoutée');
        setShowAdd(false);
        setForm({
          type: 'autre',
          dateObtention: null,
          dateValidite: null,
          numero: null,
          organisme: null,
          notes: null,
        });
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
        toast.success('Habilitation supprimée');
        router.refresh();
      } else {
        toast.error(r.error);
      }
    });
  }

  return (
    <div className="space-y-3">
      {items.length === 0 ? (
        <p className="rounded border border-dashed p-4 text-center text-sm text-muted-foreground">
          Aucune habilitation enregistrée.
        </p>
      ) : (
        <ul className="divide-y rounded-md border">
          {items.map((h) => {
            const st = statutValidite(h.dateValidite);
            return (
              <li key={h.id} className="flex items-start gap-3 p-3">
                <div className="grow space-y-0.5">
                  <div className="flex flex-wrap items-baseline gap-2">
                    <span className="font-medium">{LIBELLES_TYPE_HABILITATION[h.type]}</span>
                    <span className={`rounded-full px-2 py-0.5 text-xs ${st.classe}`}>
                      {st.label}
                    </span>
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {h.dateObtention && <>Obtenue : {h.dateObtention} · </>}
                    {h.dateValidite && <>Validité : {h.dateValidite} · </>}
                    {h.numero && <>N° : {h.numero} · </>}
                    {h.organisme && <>Délivré par : {h.organisme}</>}
                  </div>
                  {h.notes && <p className="text-xs text-muted-foreground">{h.notes}</p>}
                </div>
                {peutEcrire && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 w-7 p-0 text-destructive hover:text-destructive"
                    disabled={isPending}
                    onClick={() => handleDelete(h.id)}
                  >
                    <Trash2Icon className="size-3.5" />
                  </Button>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {peutEcrire && (
        <>
          {!showAdd ? (
            <Button variant="outline" size="sm" onClick={() => setShowAdd(true)}>
              <PlusIcon className="mr-1 size-4" /> Ajouter une habilitation
            </Button>
          ) : (
            <div className="grid gap-3 rounded-md border p-4">
              {erreur && (
                <Alert variant="destructive">
                  <AlertTitle>Erreur</AlertTitle>
                  <AlertDescription>{erreur}</AlertDescription>
                </Alert>
              )}
              <div>
                <Label>Type d&apos;habilitation</Label>
                <Select
                  value={form.type}
                  onValueChange={(v) => setForm((f) => ({ ...f, type: v as TypeHabilitation }))}
                >
                  <SelectTrigger>
                    <SelectValue>
                      {(v) =>
                        v ? (LIBELLES_TYPE_HABILITATION[v as TypeHabilitation] ?? v) : 'Choisir…'
                      }
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    {TYPES_HABILITATION.map((t) => (
                      <SelectItem key={t} value={t}>
                        {LIBELLES_TYPE_HABILITATION[t]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div>
                  <Label>Date d&apos;obtention</Label>
                  <Input
                    type="date"
                    value={form.dateObtention ?? ''}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, dateObtention: e.target.value || null }))
                    }
                  />
                </div>
                <div>
                  <Label>Date de validité</Label>
                  <Input
                    type="date"
                    value={form.dateValidite ?? ''}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, dateValidite: e.target.value || null }))
                    }
                  />
                </div>
              </div>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div>
                  <Label>N° du document</Label>
                  <Input
                    value={form.numero ?? ''}
                    onChange={(e) => setForm((f) => ({ ...f, numero: e.target.value || null }))}
                    maxLength={50}
                  />
                </div>
                <div>
                  <Label>Organisme</Label>
                  <Input
                    value={form.organisme ?? ''}
                    onChange={(e) => setForm((f) => ({ ...f, organisme: e.target.value || null }))}
                    maxLength={100}
                  />
                </div>
              </div>
              <div>
                <Label>Notes (optionnel)</Label>
                <Input
                  value={form.notes ?? ''}
                  onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value || null }))}
                  maxLength={500}
                />
              </div>
              <div className="flex justify-end gap-2">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setShowAdd(false)}
                  disabled={isPending}
                >
                  Annuler
                </Button>
                <Button size="sm" onClick={handleAdd} disabled={isPending}>
                  Ajouter
                </Button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
