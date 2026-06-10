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
  CATEGORIES_PERMIS,
  LIBELLES_CATEGORIE_PERMIS,
  type CategoriePermis,
  type PermisInput,
} from '@/lib/validation/rh';

type Permis = {
  id: string;
  categorie: CategoriePermis;
  dateObtention: string | null;
  dateValidite: string | null;
  numeroPermis: string | null;
  notes: string | null;
};

type ServerActionResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: string; fieldErrors?: Record<string, string[]> };

type Props = {
  items: Permis[];
  peutEcrire: boolean;
  actions: {
    creer: (input: PermisInput) => Promise<ServerActionResult<{ id: string }>>;
    supprimer: (id: string) => Promise<ServerActionResult<void>>;
  };
};

function statutValidite(dateValidite: string | null): {
  classe: string;
  label: string;
} {
  if (!dateValidite) return { classe: 'bg-muted text-muted-foreground', label: 'Permanente' };
  const today = new Date().toISOString().slice(0, 10);
  if (dateValidite < today) return { classe: 'bg-rose-100 text-rose-900', label: 'Expiré' };
  const diffJ = Math.ceil((new Date(dateValidite).getTime() - Date.now()) / (1000 * 60 * 60 * 24));
  if (diffJ < 30) return { classe: 'bg-amber-100 text-amber-900', label: `J-${diffJ}` };
  return { classe: 'bg-emerald-100 text-emerald-900', label: 'Valide' };
}

export function PermisList({ items, peutEcrire, actions }: Props) {
  const router = useRouter();
  const [showAdd, setShowAdd] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [form, setForm] = useState<PermisInput>({
    categorie: 'B',
    dateObtention: null,
    dateValidite: null,
    numeroPermis: null,
    notes: null,
  });
  const [erreur, setErreur] = useState<string | null>(null);

  function handleAdd() {
    setErreur(null);
    startTransition(async () => {
      const r = await actions.creer(form);
      if (r.ok) {
        toast.success('Permis ajouté');
        setShowAdd(false);
        setForm({
          categorie: 'B',
          dateObtention: null,
          dateValidite: null,
          numeroPermis: null,
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
        toast.success('Permis supprimé');
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
          Aucun permis enregistré.
        </p>
      ) : (
        <ul className="divide-y rounded-md border">
          {items.map((p) => {
            const st = statutValidite(p.dateValidite);
            return (
              <li key={p.id} className="flex items-start gap-3 p-3">
                <div className="grow space-y-0.5">
                  <div className="flex flex-wrap items-baseline gap-2">
                    <span className="font-medium">
                      Permis {LIBELLES_CATEGORIE_PERMIS[p.categorie]}
                    </span>
                    <span className={`rounded-full px-2 py-0.5 text-xs ${st.classe}`}>
                      {st.label}
                    </span>
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {p.dateObtention && <>Obtenu : {p.dateObtention} · </>}
                    {p.dateValidite && <>Validité : {p.dateValidite} · </>}
                    {p.numeroPermis && <>N° : {p.numeroPermis}</>}
                  </div>
                  {p.notes && <p className="text-xs text-muted-foreground">{p.notes}</p>}
                </div>
                {peutEcrire && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 w-7 p-0 text-destructive hover:text-destructive"
                    disabled={isPending}
                    onClick={() => handleDelete(p.id)}
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
              <PlusIcon className="mr-1 size-4" /> Ajouter un permis
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
                <Label>Catégorie</Label>
                <Select
                  value={form.categorie}
                  onValueChange={(v) =>
                    setForm((f) => ({ ...f, categorie: v as CategoriePermis }))
                  }
                >
                  <SelectTrigger>
                    <SelectValue>
                      {(v) => LIBELLES_CATEGORIE_PERMIS[v as CategoriePermis] ?? v}
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    {CATEGORIES_PERMIS.map((c) => (
                      <SelectItem key={c} value={c}>
                        {LIBELLES_CATEGORIE_PERMIS[c]}
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
              <div>
                <Label>N° du permis</Label>
                <Input
                  value={form.numeroPermis ?? ''}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, numeroPermis: e.target.value || null }))
                  }
                  maxLength={30}
                />
              </div>
              <div className="flex justify-end gap-2">
                <Button variant="ghost" size="sm" onClick={() => setShowAdd(false)} disabled={isPending}>
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
