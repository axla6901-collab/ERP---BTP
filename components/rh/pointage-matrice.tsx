'use client';

import { PlusIcon, Trash2Icon } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useMemo, useState, useTransition } from 'react';
import { toast } from 'sonner';

import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import {
  LIBELLES_MOTIF_ABSENCE,
  MOTIFS_ABSENCE_MATRICE,
  type MatricePointageInput,
  type MotifAbsence,
  type TypePointage,
} from '@/lib/validation/rh';

type EmployeOption = { id: string; nom: string; prenom: string };
type ChantierOption = { id: string; numero: string; libelle: string };

type ServerActionResult = {
  ok: boolean;
  error?: string;
  data?: { inserted: number; deleted: number };
};

/**
 * Type interne simplifié pour la matrice : on n'expose que "heures" ou
 * "absence". Les types budget/% avancement restent côté DB pour l'historique
 * Pointage mais ne sont pas saisissables ici.
 */
type TypeMatrice = 'heures' | 'absence';

type LigneState = {
  employeId: string;
  chantierId: string | null;
  type: TypeMatrice;
  motifAbsence: MotifAbsence | null;
  jours: Record<string, string>;
};

type Props = {
  annee: number;
  mois: number;
  employes: EmployeOption[];
  chantiers: ChantierOption[];
  /** Pointages existants à pré-remplir (regroupés en lignes par couple) */
  initialLignes: LigneState[];
  onSubmit: (input: MatricePointageInput) => Promise<ServerActionResult>;
};

const MOIS_NOMS = [
  'Janvier',
  'Février',
  'Mars',
  'Avril',
  'Mai',
  'Juin',
  'Juillet',
  'Août',
  'Septembre',
  'Octobre',
  'Novembre',
  'Décembre',
];

const DAY_LETTERS = ['D', 'L', 'M', 'M', 'J', 'V', 'S'];

function ligneVide(): LigneState {
  return { employeId: '', chantierId: null, type: 'heures', motifAbsence: null, jours: {} };
}

export function PointageMatrice({
  annee: initialAnnee,
  mois: initialMois,
  employes,
  chantiers,
  initialLignes,
  onSubmit,
}: Props) {
  const router = useRouter();
  const [annee, setAnnee] = useState(initialAnnee);
  const [mois, setMois] = useState(initialMois);
  const [lignes, setLignes] = useState<LigneState[]>(
    initialLignes.length > 0 ? initialLignes : [ligneVide()],
  );
  const [erreur, setErreur] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const nbJours = useMemo(() => new Date(annee, mois, 0).getDate(), [annee, mois]);
  const jours = useMemo(() => Array.from({ length: nbJours }, (_, i) => i + 1), [nbJours]);
  const jourInfos = useMemo(
    () =>
      jours.map((j) => {
        const dow = new Date(annee, mois - 1, j).getDay();
        return { j, letter: DAY_LETTERS[dow], weekend: dow === 0 || dow === 6 };
      }),
    [jours, annee, mois],
  );

  function changerMoisOuAnnee(nouvelAnnee: number, nouveauMois: number) {
    setAnnee(nouvelAnnee);
    setMois(nouveauMois);
    router.push(`/rh/pointages/saisie?annee=${nouvelAnnee}&mois=${nouveauMois}`);
  }

  function ajouterLigne() {
    setLignes((prev) => [...prev, ligneVide()]);
  }
  function supprimerLigne(idx: number) {
    setLignes((prev) => prev.filter((_, i) => i !== idx));
  }
  function updateLigne(idx: number, patch: Partial<LigneState>) {
    setLignes((prev) => prev.map((l, i) => (i === idx ? { ...l, ...patch } : l)));
  }
  function updateHeure(idx: number, jour: number, value: string) {
    setLignes((prev) =>
      prev.map((l, i) => (i === idx ? { ...l, jours: { ...l.jours, [String(jour)]: value } } : l)),
    );
  }

  function totalLigne(l: LigneState): number {
    return jours.reduce((s, j) => {
      const v = l.jours[String(j)];
      if (!v) return s;
      const n = Number(v.replace(',', '.'));
      return Number.isNaN(n) ? s : s + n;
    }, 0);
  }
  const totalMois = lignes.reduce((s, l) => s + totalLigne(l), 0);

  function enregistrer() {
    setErreur(null);

    const lignesPretes = lignes.filter((l) =>
      Object.values(l.jours).some((v) => v && Number(v.replace(',', '.')) > 0),
    );

    if (lignesPretes.length === 0) {
      setErreur('Aucune cellule remplie. Saisis au moins une heure.');
      return;
    }

    const erreurs: string[] = [];
    for (const l of lignesPretes) {
      if (!l.employeId) erreurs.push('Une ligne sans employé.');
      if (l.type === 'absence') {
        if (!l.motifAbsence) erreurs.push('Une absence requiert un motif.');
      } else if (!l.chantierId) {
        erreurs.push('Une ligne sans chantier (hors absence).');
      }
    }
    if (erreurs.length > 0) {
      setErreur([...new Set(erreurs)].join(' '));
      return;
    }

    const input: MatricePointageInput = {
      annee,
      mois,
      lignes: lignesPretes.map((l) => ({
        employeId: l.employeId,
        chantierId: l.type === 'absence' ? null : l.chantierId,
        type: l.type as TypePointage,
        motifAbsence: l.type === 'absence' ? l.motifAbsence : null,
        zoneDeplacement: null,
        panier: false,
        grandPanier: false,
        nuitPanierSoir: false,
        jours: Object.fromEntries(
          Object.entries(l.jours)
            .map(([k, v]) => {
              if (!v) return [k, null];
              const n = Number(v.replace(',', '.'));
              return [k, Number.isNaN(n) ? null : n];
            })
            .filter(([, v]) => v !== null && (v as number) > 0),
        ),
      })),
    };

    startTransition(async () => {
      const r = await onSubmit(input);
      if (r.ok) {
        toast.success(
          `Enregistré : ${r.data?.inserted ?? 0} pointages (${r.data?.deleted ?? 0} précédents remplacés).`,
        );
        router.refresh();
      } else {
        setErreur(r.error ?? 'Enregistrement impossible.');
        toast.error(r.error ?? 'Erreur');
      }
    });
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <select
            value={mois}
            onChange={(e) => changerMoisOuAnnee(annee, Number(e.target.value))}
            className="rounded-md border bg-background px-2 py-1 text-sm"
          >
            {MOIS_NOMS.map((m, i) => (
              <option key={i} value={i + 1}>
                {m}
              </option>
            ))}
          </select>
          <select
            value={annee}
            onChange={(e) => changerMoisOuAnnee(Number(e.target.value), mois)}
            className="rounded-md border bg-background px-2 py-1 text-sm"
          >
            {[annee - 2, annee - 1, annee, annee + 1, annee + 2].map((y) => (
              <option key={y} value={y}>
                {y}
              </option>
            ))}
          </select>
          <span className="ml-2 text-xs text-muted-foreground">
            {lignes.length} ligne(s) — total mois :{' '}
            <span className="font-semibold tabular-nums text-foreground">{totalMois}</span>
          </span>
        </div>
        <Button onClick={enregistrer} disabled={isPending} size="sm">
          {isPending ? 'Enregistrement…' : 'Enregistrer le mois'}
        </Button>
      </div>

      {erreur && (
        <Alert variant="destructive">
          <AlertTitle>Erreur</AlertTitle>
          <AlertDescription>{erreur}</AlertDescription>
        </Alert>
      )}

      <p className="text-xs text-muted-foreground sm:hidden" aria-hidden="true">
        Le tableau défile horizontalement.
      </p>
      <div className="overflow-x-auto rounded-md border">
        <table
          className="w-full min-w-[960px] border-collapse text-[11px]"
          style={{ tableLayout: 'fixed' }}
        >
          <colgroup>
            <col style={{ width: '11%' }} />
            <col style={{ width: '5%' }} />
            <col style={{ width: '16%' }} />
            {jours.map((j) => (
              <col key={j} style={{ width: `calc(64% / ${nbJours})` }} />
            ))}
            <col style={{ width: '3%' }} />
            <col style={{ width: '1%' }} />
          </colgroup>
          <thead>
            <tr className="bg-muted/50">
              <th className="border-r px-1 py-1 text-left font-semibold">Employé</th>
              <th className="border-r px-1 py-1 text-left font-semibold">Type</th>
              <th className="border-r px-1 py-1 text-left font-semibold">Chantier / Motif</th>
              {jourInfos.map(({ j, letter, weekend }) => (
                <th
                  key={j}
                  className={`border-r px-0 py-1 text-center font-semibold ${
                    weekend ? 'bg-rose-50/60 text-rose-700' : ''
                  }`}
                >
                  <div className="text-[9px] leading-none opacity-60">{letter}</div>
                  <div className="leading-none">{j}</div>
                </th>
              ))}
              <th className="border-l bg-muted/50 px-1 py-1 text-center font-semibold">Tot.</th>
              <th className="bg-muted/50 px-0"></th>
            </tr>
          </thead>
          <tbody>
            {lignes.map((l, idx) => {
              const total = totalLigne(l);
              return (
                <tr key={idx} className="border-t hover:bg-muted/30">
                  <td className="border-r p-0">
                    <select
                      value={l.employeId}
                      onChange={(e) => updateLigne(idx, { employeId: e.target.value })}
                      className="h-7 w-full bg-transparent px-1 text-[11px] focus:bg-amber-50 focus:outline-none"
                      title={
                        l.employeId
                          ? (() => {
                              const e = employes.find((x) => x.id === l.employeId);
                              return e ? `${e.nom} ${e.prenom}` : '';
                            })()
                          : ''
                      }
                    >
                      <option value="">Employé…</option>
                      {employes.map((e) => (
                        <option key={e.id} value={e.id}>
                          {e.nom} {e.prenom}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="border-r p-0">
                    <select
                      value={l.type}
                      onChange={(e) => {
                        const type = e.target.value as TypeMatrice;
                        updateLigne(idx, {
                          type,
                          chantierId: type === 'absence' ? null : l.chantierId,
                          motifAbsence: type === 'absence' ? (l.motifAbsence ?? 'autre') : null,
                        });
                      }}
                      className="h-7 w-full bg-transparent px-1 text-[11px] focus:bg-amber-50 focus:outline-none"
                    >
                      <option value="heures">Heures</option>
                      <option value="absence">Absence</option>
                    </select>
                  </td>
                  <td className="border-r p-0">
                    {l.type === 'absence' ? (
                      <select
                        value={l.motifAbsence ?? 'autre'}
                        onChange={(e) =>
                          updateLigne(idx, { motifAbsence: e.target.value as MotifAbsence })
                        }
                        className="h-7 w-full truncate bg-transparent px-1 text-[11px] focus:bg-amber-50 focus:outline-none"
                      >
                        {MOTIFS_ABSENCE_MATRICE.map((m) => (
                          <option key={m} value={m}>
                            {LIBELLES_MOTIF_ABSENCE[m]}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <select
                        value={l.chantierId ?? ''}
                        onChange={(e) => updateLigne(idx, { chantierId: e.target.value || null })}
                        className="h-7 w-full bg-transparent px-1 text-[11px] focus:bg-amber-50 focus:outline-none"
                        title={
                          l.chantierId
                            ? (chantiers.find((c) => c.id === l.chantierId)?.libelle ?? '')
                            : ''
                        }
                      >
                        <option value="">Chantier…</option>
                        {chantiers.map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.libelle}
                          </option>
                        ))}
                      </select>
                    )}
                  </td>
                  {jourInfos.map(({ j, weekend }) => (
                    <td key={j} className={`border-r p-0 ${weekend ? 'bg-rose-50/30' : ''}`}>
                      <input
                        type="text"
                        inputMode="decimal"
                        value={l.jours[String(j)] ?? ''}
                        onChange={(e) => updateHeure(idx, j, e.target.value)}
                        className="h-7 w-full bg-transparent px-0.5 text-center text-[11px] tabular-nums outline-none focus:bg-amber-50"
                      />
                    </td>
                  ))}
                  <td className="border-l bg-muted/30 px-1 py-1 text-center font-semibold tabular-nums">
                    {total > 0 ? total : ''}
                  </td>
                  <td className="px-0 text-center">
                    <button
                      type="button"
                      onClick={() => supprimerLigne(idx)}
                      title="Supprimer la ligne"
                      className="rounded p-0.5 text-destructive hover:bg-destructive/10"
                    >
                      <Trash2Icon className="size-3" />
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="flex items-center justify-between">
        <Button variant="outline" size="sm" onClick={ajouterLigne}>
          <PlusIcon className="mr-1 size-3.5" /> Ajouter une ligne
        </Button>
        <p className="text-xs text-muted-foreground">
          Toutes les colonnes jour sont visibles sans défilement. La sauvegarde remplace tous les
          pointages du mois pour les couples (employé, chantier/motif, type) listés.
        </p>
      </div>
    </div>
  );
}
