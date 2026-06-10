'use client';

import { ArrowDownIcon, ArrowUpIcon, PencilIcon, PlusIcon, Trash2Icon } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { toast } from 'sonner';

import { TacheForm } from '@/components/chantiers/tache-form';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  LIBELLES_STATUT_TACHE,
  TRANSITIONS_TACHE,
  type ChantierTacheInput,
  type StatutTache,
} from '@/lib/validation/chantier-taches';

type TacheItem = {
  id: string;
  chantierId: string;
  ordre: number;
  libelle: string;
  description: string | null;
  responsableId: string | null;
  responsableEmail: string | null;
  statut: StatutTache;
  avancementPourcent: number;
  dateDebutPrevue: string | null;
  dateFinPrevue: string | null;
  dateDebutReelle: string | null;
  dateFinReelle: string | null;
  notes: string | null;
};

type ServerActionResult = {
  ok: boolean;
  error?: string;
  fieldErrors?: Record<string, string[]>;
  data?: unknown;
};

type Props = {
  taches: TacheItem[];
  responsables: { id: string; email: string }[];
  peutEcrire: boolean;
  actions: {
    creer: (input: ChantierTacheInput) => Promise<ServerActionResult>;
    mettreAJour: (id: string, input: ChantierTacheInput) => Promise<ServerActionResult>;
    changerStatut: (id: string, nouveau: StatutTache) => Promise<ServerActionResult>;
    supprimer: (id: string) => Promise<ServerActionResult>;
    deplacer: (id: string, direction: -1 | 1) => Promise<ServerActionResult>;
  };
};

function classesPillStatut(s: StatutTache): string {
  switch (s) {
    case 'a_faire':
      return 'bg-muted text-muted-foreground';
    case 'en_cours':
      return 'bg-amber-100 text-amber-900';
    case 'bloque':
      return 'bg-rose-100 text-rose-900';
    case 'termine':
      return 'bg-emerald-100 text-emerald-900';
    case 'annule':
      return 'bg-slate-200 text-slate-700';
  }
}

export function ChantierTaches({
  taches,
  responsables,
  peutEcrire,
  actions,
}: Props) {
  const router = useRouter();
  const [showAdd, setShowAdd] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function refresh() {
    router.refresh();
  }

  function handleStatutChange(t: TacheItem, nouveau: StatutTache) {
    startTransition(async () => {
      const r = await actions.changerStatut(t.id, nouveau);
      if (r.ok) {
        toast.success(`Tâche → ${LIBELLES_STATUT_TACHE[nouveau]}`);
        refresh();
      } else {
        toast.error(r.error ?? 'Erreur');
      }
    });
  }

  function handleDelete(id: string) {
    startTransition(async () => {
      const r = await actions.supprimer(id);
      if (r.ok) {
        toast.success('Tâche supprimée');
        setConfirmDeleteId(null);
        refresh();
      } else {
        toast.error(r.error ?? 'Erreur');
      }
    });
  }

  function handleDeplacer(id: string, direction: -1 | 1) {
    startTransition(async () => {
      const r = await actions.deplacer(id, direction);
      if (r.ok) {
        refresh();
      } else {
        toast.error(r.error ?? 'Erreur');
      }
    });
  }

  const taux = taches.filter((t) => t.statut !== 'annule');
  const avancementMoyen =
    taux.length === 0
      ? 0
      : Math.round(taux.reduce((acc, t) => acc + t.avancementPourcent, 0) / taux.length);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-baseline justify-between">
          <span>Tâches ({taches.length})</span>
          {taches.length > 0 && (
            <span className="text-sm font-normal text-muted-foreground">
              Avancement moyen :{' '}
              <span className="font-semibold text-foreground tabular-nums">
                {avancementMoyen} %
              </span>
            </span>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {taches.length === 0 ? (
          <p className="rounded border border-dashed p-6 text-center text-sm text-muted-foreground">
            Aucune tâche. {peutEcrire && 'Ajoute la première via le bouton ci-dessous.'}
          </p>
        ) : (
          <ul className="divide-y rounded-md border">
            {taches.map((t, idx) => {
              const isEditing = editingId === t.id;
              return (
                <li key={t.id} className="p-3">
                  {isEditing ? (
                    <TacheForm
                      responsables={responsables}
                      defaultValues={{
                        libelle: t.libelle,
                        description: t.description,
                        responsableId: t.responsableId,
                        statut: t.statut,
                        avancementPourcent: t.avancementPourcent,
                        dateDebutPrevue: t.dateDebutPrevue,
                        dateFinPrevue: t.dateFinPrevue,
                        dateDebutReelle: t.dateDebutReelle,
                        dateFinReelle: t.dateFinReelle,
                        notes: t.notes,
                      }}
                      submitLabel="Enregistrer"
                      onSubmit={async (values) => {
                        const r = await actions.mettreAJour(t.id, values);
                        if (r.ok) {
                          toast.success('Tâche modifiée');
                          setEditingId(null);
                          refresh();
                        }
                        return r;
                      }}
                      onCancel={() => setEditingId(null)}
                    />
                  ) : (
                    <div className="flex items-start gap-3">
                      <span className="mt-1 w-6 text-right text-xs font-mono text-muted-foreground">
                        {idx + 1}
                      </span>
                      <div className="grow space-y-1">
                        <div className="flex flex-wrap items-baseline gap-2">
                          <span className="font-medium">{t.libelle}</span>
                          <span
                            className={`rounded-full px-2 py-0.5 text-xs ${classesPillStatut(t.statut)}`}
                          >
                            {LIBELLES_STATUT_TACHE[t.statut]}
                          </span>
                          <span className="tabular-nums text-xs text-muted-foreground">
                            {t.avancementPourcent}%
                          </span>
                        </div>
                        <div className="h-1.5 w-full rounded-full bg-muted">
                          <div
                            className="h-full rounded-full bg-emerald-500 transition-[width]"
                            style={{ width: `${t.avancementPourcent}%` }}
                          />
                        </div>
                        <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                          <span>Responsable : {t.responsableEmail ?? 'Non assigné'}</span>
                          {t.dateDebutPrevue && (
                            <span>
                              Prévu : {t.dateDebutPrevue}
                              {t.dateFinPrevue ? ` → ${t.dateFinPrevue}` : ''}
                            </span>
                          )}
                          {t.dateDebutReelle && (
                            <span>
                              Réel : {t.dateDebutReelle}
                              {t.dateFinReelle ? ` → ${t.dateFinReelle}` : ''}
                            </span>
                          )}
                        </div>
                        {t.description && (
                          <p className="text-xs text-muted-foreground">{t.description}</p>
                        )}
                      </div>
                      {peutEcrire && (
                        <div className="flex flex-col items-end gap-1">
                          <div className="flex items-center gap-1">
                            <Button
                              size="sm"
                              variant="ghost"
                              disabled={isPending || idx === 0}
                              onClick={() => handleDeplacer(t.id, -1)}
                              title="Monter"
                            >
                              <ArrowUpIcon className="size-3.5" />
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              disabled={isPending || idx === taches.length - 1}
                              onClick={() => handleDeplacer(t.id, 1)}
                              title="Descendre"
                            >
                              <ArrowDownIcon className="size-3.5" />
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              disabled={isPending}
                              onClick={() => setEditingId(t.id)}
                              title="Modifier"
                            >
                              <PencilIcon className="size-3.5" />
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              className="text-destructive hover:text-destructive"
                              disabled={isPending}
                              onClick={() => setConfirmDeleteId(t.id)}
                              title="Supprimer"
                            >
                              <Trash2Icon className="size-3.5" />
                            </Button>
                          </div>
                          {TRANSITIONS_TACHE[t.statut].length > 0 && (
                            <div className="flex flex-wrap justify-end gap-1">
                              {TRANSITIONS_TACHE[t.statut].map((s) => (
                                <Button
                                  key={s}
                                  size="sm"
                                  variant={
                                    s === 'termine'
                                      ? 'default'
                                      : s === 'annule' || s === 'bloque'
                                        ? 'outline'
                                        : 'outline'
                                  }
                                  className="h-6 px-2 text-xs"
                                  disabled={isPending}
                                  onClick={() => handleStatutChange(t, s)}
                                >
                                  → {LIBELLES_STATUT_TACHE[s]}
                                </Button>
                              ))}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  )}
                  {confirmDeleteId === t.id && !isEditing && (
                    <div className="mt-3 rounded border border-destructive bg-destructive/5 p-3 text-sm">
                      <p className="mb-2">Supprimer cette tâche ?</p>
                      <div className="flex justify-end gap-2">
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => setConfirmDeleteId(null)}
                          disabled={isPending}
                        >
                          Annuler
                        </Button>
                        <Button
                          size="sm"
                          variant="destructive"
                          onClick={() => handleDelete(t.id)}
                          disabled={isPending}
                        >
                          Supprimer
                        </Button>
                      </div>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}

        {peutEcrire && (
          <div>
            {showAdd ? (
              <div className="rounded-md border p-3">
                <TacheForm
                  responsables={responsables}
                  onSubmit={async (values) => {
                    const r = await actions.creer(values);
                    if (r.ok) {
                      toast.success('Tâche ajoutée');
                      setShowAdd(false);
                      refresh();
                    }
                    return r;
                  }}
                  onCancel={() => setShowAdd(false)}
                  submitLabel="Ajouter la tâche"
                />
              </div>
            ) : (
              <Button variant="outline" size="sm" onClick={() => setShowAdd(true)}>
                <PlusIcon className="mr-1 size-4" /> Ajouter une tâche
              </Button>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
